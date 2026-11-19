const chokidar = require('chokidar');
const path = require('path');
const fs = require('fs');
const GitService = require('./gitService');

class RepoWatcher {
  constructor(onRepoChange) {
    this.currentPath = null;
    this.watcher = null;
    this.onRepoChange = onRepoChange;
    this.debounceTimer = null;
    this.debounceMs = 300;
  }

  /**
   * Start watching a repository
   */
  async watch(repoPath) {
    if (this.currentPath === repoPath && this.watcher) {
      return;
    }

    await this.stop();

    const isValid = await GitService.isValidRepo(repoPath);
    if (!isValid) {
      console.warn(`[RepoWatcher] Not a valid git repository: ${repoPath}`);
      return;
    }

    this.currentPath = path.resolve(repoPath);
    const gitDir = await GitService.getGitDir(this.currentPath);

    // Watch key git control files:
    // - HEAD
    // - refs/ (heads, remotes, tags)
    // - index (for staging)
    // - packed-refs
    const targets = [
      path.join(gitDir, 'HEAD'),
      path.join(gitDir, 'refs'),
      path.join(gitDir, 'index'),
      path.join(gitDir, 'packed-refs'),
      path.join(gitDir, 'FETCH_HEAD'),
      path.join(gitDir, 'ORIG_HEAD')
    ].filter(p => fs.existsSync(p) || p.endsWith('refs') || p.endsWith('HEAD') || p.endsWith('index'));

    try {
      this.watcher = chokidar.watch(targets, {
        ignoreInitial: true,
        persistent: true,
        depth: 4,
        awaitWriteFinish: {
          stabilityThreshold: 150,
          pollInterval: 50
        }
      });

      const handleChange = (eventName, changedPath) => {
        // Ignore lock files that git creates during atomic writes
        if (changedPath && changedPath.endsWith('.lock')) return;

        if (this.debounceTimer) clearTimeout(this.debounceTimer);
        this.debounceTimer = setTimeout(() => {
          if (this.onRepoChange) {
            this.onRepoChange({
              event: eventName,
              file: changedPath,
              repoPath: this.currentPath,
              timestamp: Date.now()
            });
          }
        }, this.debounceMs);
      };

      this.watcher
        .on('add', p => handleChange('add', p))
        .on('change', p => handleChange('change', p))
        .on('unlink', p => handleChange('unlink', p))
        .on('error', err => console.error('[RepoWatcher Error]', err));

      console.log(`[RepoWatcher] Now watching .git in: ${this.currentPath}`);
    } catch (err) {
      console.error(`[RepoWatcher] Failed to watch ${repoPath}:`, err.message);
    }
  }

  /**
   * Stop watching current repository
   */
  async stop() {
    if (this.watcher) {
      await this.watcher.close();
      this.watcher = null;
    }
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    this.currentPath = null;
  }
}

module.exports = RepoWatcher;
