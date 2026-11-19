const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');

class GitService {
  /**
   * Run a git command in the target directory
   */
  static runGit(command, repoPath) {
    return new Promise((resolve, reject) => {
      exec(command, { cwd: repoPath, maxBuffer: 10 * 1024 * 1024 }, (error, stdout, stderr) => {
        if (error) {
          return reject(new Error(stderr.trim() || error.message));
        }
        resolve(stdout.trim());
      });
    });
  }

  /**
   * Check if the directory is a valid git repository
   */
  static async isValidRepo(repoPath) {
    try {
      if (!fs.existsSync(repoPath)) return false;
      const result = await this.runGit('git rev-parse --is-inside-work-tree', repoPath);
      return result === 'true';
    } catch {
      return false;
    }
  }

  /**
   * Check if input string is a remote Git or GitHub URL
   */
  static isRemoteUrl(input) {
    if (!input || typeof input !== 'string') return false;
    const trimmed = input.trim();
    return (
      trimmed.startsWith('https://') ||
      trimmed.startsWith('http://') ||
      trimmed.startsWith('git@') ||
      trimmed.startsWith('git://') ||
      /^(?:[\w.-]+@)?github\.com[/:]/.test(trimmed)
    );
  }

  /**
   * Clone or fetch a remote Git / GitHub repository into cloned_repos cache
   */
  static async cloneOrFetchRemote(remoteUrl, baseDir) {
    let cleanUrl = remoteUrl.trim();
    if (!cleanUrl.includes('://') && !cleanUrl.startsWith('git@')) {
      cleanUrl = `https://${cleanUrl}`;
    }

    // Extract repository owner & name (e.g. "expressjs/express" from "https://github.com/expressjs/express.git")
    const urlClean = cleanUrl.replace(/\.git$/, '');
    const parts = urlClean.split(/[/:]/).filter(Boolean);
    const repoName = parts[parts.length - 1] || 'repo';
    const ownerName = parts[parts.length - 2] || 'github';
    const safeDirName = `${ownerName}_${repoName}`.replace(/[^a-zA-Z0-9_-]/g, '_');

    const clonedReposDir = path.resolve(baseDir, 'cloned_repos');
    if (!fs.existsSync(clonedReposDir)) {
      fs.mkdirSync(clonedReposDir, { recursive: true });
    }

    const targetPath = path.join(clonedReposDir, safeDirName);

    if (fs.existsSync(targetPath) && await this.isValidRepo(targetPath)) {
      console.log(`[GitService] Repository already cached. Fetching latest updates for ${cleanUrl}...`);
      try {
        await this.runGit('git fetch --all --prune', targetPath);
      } catch (err) {
        console.warn('[GitService] Fetch warning:', err.message);
      }
      return targetPath;
    }

    console.log(`[GitService] Cloning remote repository ${cleanUrl} into ${targetPath}...`);
    return new Promise((resolve, reject) => {
      // Try fast blobless clone first, then fallback to standard clone
      exec(`git clone --filter=blob:none "${cleanUrl}" "${targetPath}"`, { timeout: 180000 }, (err) => {
        if (!err) {
          console.log(`[GitService] Successfully cloned ${cleanUrl}`);
          return resolve(targetPath);
        }
        // Fallback to standard git clone
        console.log(`[GitService] Blob-filter not supported, performing standard clone...`);
        exec(`git clone "${cleanUrl}" "${targetPath}"`, { timeout: 300000 }, (err2, stdout, stderr) => {
          if (err2) {
            if (fs.existsSync(targetPath)) {
              try { fs.rmSync(targetPath, { recursive: true, force: true }); } catch {}
            }
            return reject(new Error(`Failed to clone GitHub repository (${cleanUrl}): ${stderr.trim() || err2.message}`));
          }
          console.log(`[GitService] Successfully cloned ${cleanUrl}`);
          resolve(targetPath);
        });
      });
    });
  }

  /**
   * Get the .git directory path
   */
  static async getGitDir(repoPath) {
    try {
      const gitDir = await this.runGit('git rev-parse --git-dir', repoPath);
      return path.resolve(repoPath, gitDir);
    } catch (e) {
      return path.resolve(repoPath, '.git');
    }
  }

  /**
   * Get general repository metadata (HEAD, current branch, remotes, status)
   */
  static async getRepoStatus(repoPath) {
    const isValid = await this.isValidRepo(repoPath);
    if (!isValid) {
      throw new Error(`Directory is not a valid Git repository: ${repoPath}`);
    }

    let headHash = '';
    let currentBranch = 'HEAD';
    let isDetached = false;
    let remotes = [];
    let dirty = false;
    let modifiedFiles = 0;
    let stagedFiles = 0;
    let untrackedFiles = 0;

    try {
      headHash = await this.runGit('git rev-parse HEAD', repoPath);
    } catch {
      // Empty repo with no commits
      headHash = null;
    }

    try {
      const branchOutput = await this.runGit('git branch --show-current', repoPath);
      if (branchOutput) {
        currentBranch = branchOutput;
      } else {
        isDetached = true;
        currentBranch = headHash ? `(HEAD detached at ${headHash.slice(0, 7)})` : 'HEAD';
      }
    } catch {
      currentBranch = 'main';
    }

    try {
      const remotesRaw = await this.runGit('git remote -v', repoPath);
      if (remotesRaw) {
        const lines = remotesRaw.split('\n');
        const map = new Map();
        for (const line of lines) {
          const parts = line.split(/\s+/);
          if (parts.length >= 2) {
            map.set(parts[0], parts[1]);
          }
        }
        remotes = Array.from(map.entries()).map(([name, url]) => ({ name, url }));
      }
    } catch {
      remotes = [];
    }

    try {
      const statusRaw = await this.runGit('git status --porcelain', repoPath);
      if (statusRaw) {
        const lines = statusRaw.split('\n').filter(Boolean);
        dirty = lines.length > 0;
        for (const line of lines) {
          const indexStatus = line[0];
          const workTreeStatus = line[1];
          if (indexStatus === '?' && workTreeStatus === '?') {
            untrackedFiles++;
          } else {
            if (indexStatus && indexStatus !== ' ' && indexStatus !== '?') stagedFiles++;
            if (workTreeStatus && workTreeStatus !== ' ' && workTreeStatus !== '?') modifiedFiles++;
          }
        }
      }
    } catch {
      // ignore
    }

    return {
      repoPath: path.resolve(repoPath),
      repoName: path.basename(path.resolve(repoPath)),
      headHash,
      currentBranch,
      isDetached,
      remotes,
      hasRemotes: remotes.length > 0,
      dirty,
      statusSummary: {
        modifiedFiles,
        stagedFiles,
        untrackedFiles
      }
    };
  }

  /**
   * Get all pushed commit hashes (reachable from any remote tracking branch)
   */
  static async getPushedCommitSet(repoPath) {
    try {
      const output = await this.runGit('git rev-list --remotes', repoPath);
      if (!output) return new Set();
      const hashes = output.split('\n').map(h => h.trim()).filter(Boolean);
      return new Set(hashes);
    } catch {
      return new Set();
    }
  }

  /**
   * Get remote tracking branch heads mapping: commitHash -> array of remote branches
   */
  static async getRemoteBranches(repoPath) {
    const remoteBranches = {};
    try {
      const output = await this.runGit(
        'git for-each-ref --format="%(objectname)|%(refname:short)" refs/remotes/',
        repoPath
      );
      if (output) {
        for (const line of output.split('\n')) {
          if (!line.trim()) continue;
          const [hash, ref] = line.split('|');
          if (ref.endsWith('/HEAD')) continue; // Skip origin/HEAD pointer
          if (!remoteBranches[hash]) remoteBranches[hash] = [];
          remoteBranches[hash].push(ref);
        }
      }
    } catch {
      // no remotes
    }
    return remoteBranches;
  }

  /**
   * Get local branch heads mapping: commitHash -> array of local branches
   */
  static async getLocalBranches(repoPath) {
    const localBranches = {};
    try {
      const output = await this.runGit(
        'git for-each-ref --format="%(objectname)|%(refname:short)" refs/heads/',
        repoPath
      );
      if (output) {
        for (const line of output.split('\n')) {
          if (!line.trim()) continue;
          const [hash, ref] = line.split('|');
          if (!localBranches[hash]) localBranches[hash] = [];
          localBranches[hash].push(ref);
        }
      }
    } catch {
      // ignore
    }
    return localBranches;
  }

  /**
   * Get all tags mapping: commitHash -> array of tags
   */
  static async getTags(repoPath) {
    const tags = {};
    try {
      const output = await this.runGit(
        'git for-each-ref --format="%(objectname)|%(refname:short)" refs/tags/',
        repoPath
      );
      if (output) {
        for (const line of output.split('\n')) {
          if (!line.trim()) continue;
          const [hash, tag] = line.split('|');
          if (!tags[hash]) tags[hash] = [];
          tags[hash].push(tag);
        }
      }
    } catch {
      // ignore
    }
    return tags;
  }

  /**
   * Get full list of commits formatted and organized into DAG
   */
  static async getCommitsGraph(repoPath) {
    const isValid = await this.isValidRepo(repoPath);
    if (!isValid) {
      throw new Error(`Directory is not a valid Git repository: ${repoPath}`);
    }

    // Delimiter for git log parsing
    const RECORD_SEP = '---GIT_RECORD_SEPARATOR---';
    const FIELD_SEP = '%x1f'; // ASCII Unit Separator

    // Format: hash, shortHash, parents, authorName, authorEmail, authorDateUnix, authorDateIso, subject, body, refNames
    const format = [
      '%H',  // Hash
      '%h',  // Abbreviated Hash
      '%P',  // Parent Hashes (space-separated)
      '%an', // Author Name
      '%ae', // Author Email
      '%at', // Author Date, UNIX timestamp
      '%aI', // Author Date, strict ISO 8601
      '%s',  // Subject
      '%b',  // Body
      '%D'   // Ref names (e.g. HEAD -> main, origin/main, tag: v1.0)
    ].join(FIELD_SEP);

    let rawLog = '';
    try {
      rawLog = await this.runGit(
        `git log --all --topo-order --format="${RECORD_SEP}${format}"`,
        repoPath
      );
    } catch (e) {
      // May fail if repo has no commits yet
      return {
        commits: [],
        branches: [],
        totalCount: 0,
        pushedCount: 0,
        unpushedCount: 0
      };
    }

    if (!rawLog || !rawLog.trim()) {
      return {
        commits: [],
        branches: [],
        totalCount: 0,
        pushedCount: 0,
        unpushedCount: 0
      };
    }

    // Fetch remote pushed commit set and remote/local branch mappings in parallel
    const [pushedSet, remoteBranches, localBranches, tags, repoStatus] = await Promise.all([
      this.getPushedCommitSet(repoPath),
      this.getRemoteBranches(repoPath),
      this.getLocalBranches(repoPath),
      this.getTags(repoPath),
      this.getRepoStatus(repoPath)
    ]);

    const records = rawLog.split(RECORD_SEP).filter(r => r.trim().length > 0);
    const commits = [];
    const commitMap = new Map();

    for (const record of records) {
      const parts = record.split('\x1f');
      if (parts.length < 9) continue;

      const hash = parts[0].trim();
      const shortHash = parts[1].trim();
      const parentsRaw = parts[2].trim();
      const parents = parentsRaw ? parentsRaw.split(/\s+/).filter(Boolean) : [];
      const authorName = parts[3].trim();
      const authorEmail = parts[4].trim();
      const timestamp = parseInt(parts[5].trim(), 10) || 0;
      const dateIso = parts[6].trim();
      const subject = parts[7].trim() || '(no message)';
      const body = parts[8].trim();
      const refNamesRaw = parts[9] ? parts[9].trim() : '';

      // Parse ref badges
      const refs = [];
      let isHead = false;

      if (hash === repoStatus.headHash) {
        isHead = true;
      }

      if (refNamesRaw) {
        const rawRefs = refNamesRaw.split(',').map(r => r.trim()).filter(Boolean);
        for (const r of rawRefs) {
          if (r.startsWith('HEAD -> ')) {
            isHead = true;
            refs.push({ type: 'head-branch', name: r.replace('HEAD -> ', '') });
          } else if (r === 'HEAD') {
            isHead = true;
            refs.push({ type: 'head', name: 'HEAD' });
          } else if (r.startsWith('tag: ')) {
            refs.push({ type: 'tag', name: r.replace('tag: ', '') });
          } else if (r.includes('/')) {
            refs.push({ type: 'remote-branch', name: r });
          } else {
            refs.push({ type: 'branch', name: r });
          }
        }
      }

      // Check if pushed:
      // A commit is pushed if it is in pushedSet (ancestor/reachable by a remote ref)
      // Or if it directly matches a remote branch
      const isPushed = Boolean(pushedSet.has(hash) || (remoteBranches[hash] && remoteBranches[hash].length > 0));

      const commitObj = {
        hash,
        shortHash,
        parents,
        children: [],
        author: {
          name: authorName,
          email: authorEmail
        },
        timestamp,
        dateIso,
        subject,
        body,
        refs,
        isHead,
        isPushed,
        hasRemotesConfigured: repoStatus.hasRemotes,
        localBranches: localBranches[hash] || [],
        remoteBranches: remoteBranches[hash] || [],
        tags: tags[hash] || []
      };

      commits.push(commitObj);
      commitMap.set(hash, commitObj);
    }

    // Populate children for DAG traversal
    for (const commit of commits) {
      for (const parentHash of commit.parents) {
        const parent = commitMap.get(parentHash);
        if (parent) {
          parent.children.push(commit.hash);
        }
      }
    }

    // Compute swimlanes / branch column positions for visual rendering
    this.assignSwimlanes(commits, commitMap);

    // Summary counts
    const totalCount = commits.length;
    const pushedCount = commits.filter(c => c.isPushed).length;
    const unpushedCount = totalCount - pushedCount;

    // Collect all unique branches
    const allBranchesSet = new Set();
    commits.forEach(c => {
      c.localBranches.forEach(b => allBranchesSet.add(b));
      c.remoteBranches.forEach(b => allBranchesSet.add(b));
    });

    return {
      commits,
      branches: Array.from(allBranchesSet),
      totalCount,
      pushedCount,
      unpushedCount,
      hasRemotes: repoStatus.hasRemotes,
      repoStatus
    };
  }

  /**
   * Compute column / swimlane index for each commit in topological order
   * so branch lines don't collide unnecessarily.
   */
  static assignSwimlanes(commits, commitMap) {
    const activeLanes = []; // Array of commit hashes expected in each column lane

    for (let i = 0; i < commits.length; i++) {
      const commit = commits[i];
      let laneIndex = activeLanes.indexOf(commit.hash);

      if (laneIndex === -1) {
        // Find first empty slot in activeLanes or append
        laneIndex = activeLanes.indexOf(null);
        if (laneIndex === -1) {
          laneIndex = activeLanes.length;
          activeLanes.push(null);
        }
      }

      commit.lane = laneIndex;

      // Now update active lanes for parents
      if (commit.parents.length === 0) {
        // Root commit, free up this lane
        activeLanes[laneIndex] = null;
      } else {
        // First parent stays in the current lane if not already assigned
        const firstParent = commit.parents[0];
        activeLanes[laneIndex] = firstParent;

        // Additional parents (merges) get their own lanes if needed
        for (let p = 1; p < commit.parents.length; p++) {
          const nextParent = commit.parents[p];
          if (!activeLanes.includes(nextParent)) {
            let freeSlot = activeLanes.indexOf(null);
            if (freeSlot === -1) {
              freeSlot = activeLanes.length;
              activeLanes.push(null);
            }
            activeLanes[freeSlot] = nextParent;
          }
        }
      }

      // Compact trailing nulls in activeLanes
      while (activeLanes.length > 0 && activeLanes[activeLanes.length - 1] === null) {
        activeLanes.pop();
      }

      commit.activeLanesCount = Math.max(activeLanes.length, laneIndex + 1);
    }
  }

  /**
   * Get detailed diff and changed files for a specific commit
   */
  static async getCommitDetails(repoPath, commitHash) {
    const isValid = await this.isValidRepo(repoPath);
    if (!isValid) throw new Error('Invalid repository');

    // Get basic commit metadata
    const infoRaw = await this.runGit(
      `git show -s --format="%H%x1f%h%x1f%P%x1f%an%x1f%ae%x1f%at%x1f%aI%x1f%cn%x1f%ce%x1f%ct%x1f%s%x1f%b%x1f%D" ${commitHash}`,
      repoPath
    );
    const parts = infoRaw.split('\x1f');
    const hash = parts[0];
    const shortHash = parts[1];
    const parents = parts[2] ? parts[2].split(/\s+/).filter(Boolean) : [];
    const author = { name: parts[3], email: parts[4], timestamp: parts[5], dateIso: parts[6] };
    const committer = { name: parts[7], email: parts[8], timestamp: parts[9] };
    const subject = parts[10];
    const body = parts[11];
    const refsRaw = parts[12];

    // Get changed files with diff stat
    let files = [];
    try {
      const numstatRaw = await this.runGit(`git show --numstat --format="" ${commitHash}`, repoPath);
      const nameStatusRaw = await this.runGit(`git show --name-status --format="" ${commitHash}`, repoPath);

      const statusMap = new Map();
      if (nameStatusRaw) {
        nameStatusRaw.split('\n').filter(Boolean).forEach(line => {
          const [status, ...nameParts] = line.trim().split(/\s+/);
          statusMap.set(nameParts.join(' '), status);
        });
      }

      if (numstatRaw) {
        files = numstatRaw.split('\n').filter(Boolean).map(line => {
          const [added, deleted, filename] = line.trim().split(/\s+/);
          return {
            filename,
            added: added === '-' ? 0 : parseInt(added, 10),
            deleted: deleted === '-' ? 0 : parseInt(deleted, 10),
            status: statusMap.get(filename) || 'M'
          };
        });
      }
    } catch {
      files = [];
    }

    // Get commit patch (truncated if very large)
    let patch = '';
    try {
      patch = await this.runGit(`git show --patch --stat ${commitHash}`, repoPath);
      if (patch.length > 50000) {
        patch = patch.slice(0, 50000) + '\n\n... (Diff truncated for performance)';
      }
    } catch {
      patch = '';
    }

    // Check pushed status
    const pushedSet = await this.getPushedCommitSet(repoPath);
    const isPushed = pushedSet.has(hash);

    return {
      hash,
      shortHash,
      parents,
      author,
      committer,
      subject,
      body,
      refsRaw,
      isPushed,
      files,
      patch
    };
  }

  /**
   * Helper to perform quick simulated git operations in a test repo
   */
  static async simulateAction(repoPath, action, params = {}) {
    switch (action) {
      case 'commit': {
        const filename = params.filename || `feature_${Date.now().toString().slice(-4)}.txt`;
        const content = params.content || `Update at ${new Date().toISOString()}\n`;
        const message = params.message || `feat: update ${filename}`;
        const filePath = path.join(repoPath, filename);
        fs.writeFileSync(filePath, content, { flag: 'a' });
        await this.runGit(`git add "${filename}"`, repoPath);
        await this.runGit(`git commit -m "${message}"`, repoPath);
        return { success: true, action: 'commit', message };
      }
      case 'branch': {
        const branchName = params.branchName || `feature/exp-${Date.now().toString().slice(-4)}`;
        await this.runGit(`git checkout -b "${branchName}"`, repoPath);
        return { success: true, action: 'branch', branchName };
      }
      case 'checkout': {
        const branchName = params.branchName;
        if (!branchName) throw new Error('branchName is required');
        await this.runGit(`git checkout "${branchName}"`, repoPath);
        return { success: true, action: 'checkout', branchName };
      }
      case 'merge': {
        const branchToMerge = params.branchToMerge;
        if (!branchToMerge) throw new Error('branchToMerge is required');
        const message = params.message || `merge: integrate branch ${branchToMerge}`;
        await this.runGit(`git merge "${branchToMerge}" -m "${message}" --no-ff`, repoPath);
        return { success: true, action: 'merge', branchToMerge };
      }
      case 'push': {
        const branch = params.branch || '';
        await this.runGit(`git push origin ${branch}`.trim(), repoPath);
        return { success: true, action: 'push', branch };
      }
      default:
        throw new Error(`Unsupported action: ${action}`);
    }
  }
}

module.exports = GitService;
