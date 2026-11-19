const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const GitService = require('./gitService');
const RepoWatcher = require('./repoWatcher');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

// Default repository is the current project workspace or current working directory
let activeRepoPath = process.env.REPO_PATH || process.cwd();

// Set up WebSocket connections
const clients = new Set();

wss.on('connection', ws => {
  clients.add(ws);

  // Send initial active repo info
  ws.send(JSON.stringify({
    type: 'CONNECTED',
    repoPath: activeRepoPath
  }));

  ws.on('close', () => {
    clients.delete(ws);
  });
});

function broadcast(data) {
  const message = JSON.stringify(data);
  for (const client of clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  }
}

// Set up Git repository watcher
const watcher = new RepoWatcher(changeInfo => {
  console.log(`[Event] Git changes detected in ${changeInfo.repoPath} (${changeInfo.event} on ${path.basename(changeInfo.file || '')})`);
  broadcast({
    type: 'REPO_UPDATED',
    repoPath: activeRepoPath,
    timestamp: changeInfo.timestamp
  });
});

// Initialize watcher on active repository
(async () => {
  try {
    const isValid = await GitService.isValidRepo(activeRepoPath);
    if (isValid) {
      await watcher.watch(activeRepoPath);
    } else {
      console.log(`[Init] ${activeRepoPath} is not a git repository yet. Waiting for repo selection.`);
    }
  } catch (err) {
    console.warn(`[Init] Repo watch warning:`, err.message);
  }
})();

// ================= API ROUTES =================

/**
 * Get active repo metadata & status
 */
app.get('/api/status', async (req, res) => {
  try {
    const isValid = await GitService.isValidRepo(activeRepoPath);
    if (!isValid) {
      return res.json({
        isValid: false,
        repoPath: activeRepoPath,
        error: 'Not a valid Git repository'
      });
    }

    const status = await GitService.getRepoStatus(activeRepoPath);
    res.json({
      isValid: true,
      ...status
    });
  } catch (err) {
    res.status(500).json({ error: err.message, repoPath: activeRepoPath });
  }
});

/**
 * Get full commit graph for active repository
 */
app.get('/api/commits', async (req, res) => {
  try {
    const isValid = await GitService.isValidRepo(activeRepoPath);
    if (!isValid) {
      return res.status(400).json({ error: 'Not a valid Git repository' });
    }

    const graph = await GitService.getCommitsGraph(activeRepoPath);
    res.json(graph);
  } catch (err) {
    console.error('Error fetching commits:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * Get detailed commit information (diff stat, patch, files)
 */
app.get('/api/commit/:hash', async (req, res) => {
  try {
    const details = await GitService.getCommitDetails(activeRepoPath, req.params.hash);
    res.json(details);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * Switch active repository path or clone GitHub repository
 */
app.post('/api/set-repo', async (req, res) => {
  try {
    const targetInput = req.body.repoPath;
    if (!targetInput || !targetInput.trim()) {
      return res.status(400).json({ error: 'repoPath or GitHub URL is required' });
    }

    let resolved = targetInput.trim();

    // Check if input is a GitHub or remote Git repository URL
    if (GitService.isRemoteUrl(resolved)) {
      console.log(`[API] Remote GitHub URL detected: ${resolved}`);
      resolved = await GitService.cloneOrFetchRemote(resolved, path.join(__dirname, '..'));
    } else {
      resolved = path.resolve(resolved);
    }

    const isValid = await GitService.isValidRepo(resolved);
    if (!isValid) {
      return res.status(400).json({
        error: `Path "${resolved}" is not a valid Git repository (no .git directory found).`
      });
    }

    activeRepoPath = resolved;
    await watcher.watch(activeRepoPath);

    const status = await GitService.getRepoStatus(activeRepoPath);

    broadcast({
      type: 'REPO_SWITCHED',
      repoPath: activeRepoPath,
      repoStatus: status
    });

    res.json({ success: true, repoPath: activeRepoPath, status });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * Trigger simulated action (commit, branch, merge)
 */
app.post('/api/simulate-action', async (req, res) => {
  try {
    const { action, params } = req.body;
    const result = await GitService.simulateAction(activeRepoPath, action, params);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * Create a sample demo repository for quick instant testing
 */
app.post('/api/create-demo-repo', async (req, res) => {
  try {
    const demoDir = path.resolve(activeRepoPath, 'demo_git_repo');
    if (!fs.existsSync(demoDir)) {
      fs.mkdirSync(demoDir, { recursive: true });
    }

    // Initialize git repo with default branch 'main'
    await GitService.runGit('git init -b main', demoDir);
    await GitService.runGit('git config user.name "Demo User"', demoDir);
    await GitService.runGit('git config user.email "demo@example.com"', demoDir);

    // Initial commit
    fs.writeFileSync(path.join(demoDir, 'README.md'), '# Demo Project\nThis is a sample git project to demonstrate real-time graph visualization.\n');
    await GitService.runGit('git add README.md', demoDir);
    await GitService.runGit('git commit -m "initial: initialize repository with README"', demoDir);

    // Commit 2
    fs.writeFileSync(path.join(demoDir, 'app.js'), 'console.log("Hello Git Simulation!");\n');
    await GitService.runGit('git add app.js', demoDir);
    await GitService.runGit('git commit -m "feat(core): add main application entry point"', demoDir);

    // Tag v0.1.0
    await GitService.runGit('git tag v0.1.0', demoDir);

    // Set up a bare local remote to simulate "origin"
    const remoteDir = path.resolve(activeRepoPath, 'demo_git_repo_remote.git');
    if (fs.existsSync(remoteDir)) {
      fs.rmSync(remoteDir, { recursive: true, force: true });
    }
    fs.mkdirSync(remoteDir, { recursive: true });
    await GitService.runGit('git init --bare', remoteDir);
    await GitService.runGit(`git remote add origin "${remoteDir.replace(/\\/g, '/')}"`, demoDir);
    await GitService.runGit('git push -u origin main', demoDir);

    // Create feature branch
    await GitService.runGit('git checkout -b feature/auth', demoDir);
    fs.writeFileSync(path.join(demoDir, 'auth.js'), 'export function login(user) { return true; }\n');
    await GitService.runGit('git add auth.js', demoDir);
    await GitService.runGit('git commit -m "feat(auth): implement user authentication service"', demoDir);

    // Create another commit on feature
    fs.appendFileSync(path.join(demoDir, 'auth.js'), 'export function logout() { return true; }\n');
    await GitService.runGit('git add auth.js', demoDir);
    await GitService.runGit('git commit -m "feat(auth): add logout handling and token revocation"', demoDir);

    // Back to main and make a commit
    await GitService.runGit('git checkout main', demoDir);
    fs.appendFileSync(path.join(demoDir, 'README.md'), '\n## Architecture\nBuilt with node and express.\n');
    await GitService.runGit('git add README.md', demoDir);
    await GitService.runGit('git commit -m "docs: expand architecture documentation in README"', demoDir);

    // Merge feature/auth into main
    await GitService.runGit('git merge feature/auth -m "merge: integrate feature/auth into main branch" --no-ff', demoDir);

    // Create unpushed feature branch
    await GitService.runGit('git checkout -b feature/analytics', demoDir);
    fs.writeFileSync(path.join(demoDir, 'analytics.js'), 'export function trackEvent(name) { console.log(name); }\n');
    await GitService.runGit('git add analytics.js', demoDir);
    await GitService.runGit('git commit -m "feat(analytics): start event tracking module"', demoDir);

    // Switch back to main
    await GitService.runGit('git checkout main', demoDir);

    // Automatically switch activeRepo to this demo repository
    activeRepoPath = demoDir;
    await watcher.watch(activeRepoPath);

    const status = await GitService.getRepoStatus(activeRepoPath);
    broadcast({
      type: 'REPO_SWITCHED',
      repoPath: activeRepoPath,
      repoStatus: status
    });

    res.json({
      success: true,
      demoDir,
      status
    });
  } catch (err) {
    console.error('Failed to create demo repo:', err);
    res.status(500).json({ error: err.message });
  }
});

// Fallback route for SPA
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

server.listen(PORT, () => {
  console.log(`====================================================`);
  console.log(`🚀 GitChain Live visualizer running at:`);
  console.log(`👉 http://localhost:${PORT}`);
  console.log(`📂 Active repository: ${activeRepoPath}`);
  console.log(`====================================================`);
});
