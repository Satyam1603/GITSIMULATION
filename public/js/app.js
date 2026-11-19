/**
 * GitChain Live - Main Application Controller
 */

// Application State
const state = {
  repoPath: '',
  repoStatus: null,
  allCommits: [],
  filteredCommits: [],
  selectedCommit: null,
  activeBranchFilter: 'all',
  activePushedFilter: 'all',
  searchQuery: '',
  isLoading: false
};

// DOM Elements
const elements = {
  repoForm: document.getElementById('repoForm'),
  repoPathInput: document.getElementById('repoPathInput'),
  connectBtn: document.getElementById('connectBtn'),
  demoRepoBtn: document.getElementById('demoRepoBtn'),
  emptyDemoBtn: document.getElementById('emptyDemoBtn'),
  refreshBtn: document.getElementById('refreshBtn'),
  centerHeadBtn: document.getElementById('centerHeadBtn'),
  simulateMenuBtn: document.getElementById('simulateMenuBtn'),
  simulateModal: document.getElementById('simulateModal'),
  closeSimulateModalBtn: document.getElementById('closeSimulateModalBtn'),

  // Simulator actions
  simCommitBtn: document.getElementById('simCommitBtn'),
  simBranchBtn: document.getElementById('simBranchBtn'),
  simCheckoutMainBtn: document.getElementById('simCheckoutMainBtn'),
  simMergeBtn: document.getElementById('simMergeBtn'),
  simPushBtn: document.getElementById('simPushBtn'),
  simMessage: document.getElementById('simMessage'),

  // Labels & counters
  repoNameLabel: document.getElementById('repoNameLabel'),
  currentBranchLabel: document.getElementById('currentBranchLabel'),
  totalCommitsCount: document.getElementById('totalCommitsCount'),
  pushedCommitsCount: document.getElementById('pushedCommitsCount'),
  unpushedCommitsCount: document.getElementById('unpushedCommitsCount'),
  dirtyStatusBadge: document.getElementById('dirtyStatusBadge'),
  visibleCountLabel: document.getElementById('visibleCountLabel'),
  liveStatusBadge: document.getElementById('liveStatusBadge'),

  // Filters
  searchInput: document.getElementById('searchInput'),
  branchFilter: document.getElementById('branchFilter'),
  pushedFilter: document.getElementById('pushedFilter'),

  // States & Graph
  loadingState: document.getElementById('loadingState'),
  emptyState: document.getElementById('emptyState'),
  graphContainer: document.getElementById('graphContainer'),
  gitSvgCanvas: document.getElementById('gitSvgCanvas'),
  commitsContainer: document.getElementById('commitsContainer'),

  // Commit Detail Drawer
  commitDrawer: document.getElementById('commitDrawer'),
  closeDrawerBtn: document.getElementById('closeDrawerBtn'),
  drawerPushedBanner: document.getElementById('drawerPushedBanner'),
  drawerHash: document.getElementById('drawerHash'),
  copyHashBtn: document.getElementById('copyHashBtn'),
  drawerSubject: document.getElementById('drawerSubject'),
  drawerBody: document.getElementById('drawerBody'),
  drawerAuthorName: document.getElementById('drawerAuthorName'),
  drawerAuthorEmail: document.getElementById('drawerAuthorEmail'),
  drawerDateRelative: document.getElementById('drawerDateRelative'),
  drawerDateIso: document.getElementById('drawerDateIso'),
  drawerRefsContainer: document.getElementById('drawerRefsContainer'),
  drawerParentsList: document.getElementById('drawerParentsList'),
  drawerChildrenList: document.getElementById('drawerChildrenList'),
  drawerFilesCount: document.getElementById('drawerFilesCount'),
  drawerFilesList: document.getElementById('drawerFilesList'),
  togglePatchBtn: document.getElementById('togglePatchBtn'),
  togglePatchIcon: document.getElementById('togglePatchIcon'),
  patchContainer: document.getElementById('patchContainer'),
  drawerPatch: document.getElementById('drawerPatch'),

  // Animated Flow Playback Elements
  animatedFlowBtn: document.getElementById('animatedFlowBtn'),
  playbackBar: document.getElementById('playbackBar'),
  playbackStepLabel: document.getElementById('playbackStepLabel'),
  playbackCommitSubject: document.getElementById('playbackCommitSubject'),
  playbackAuthorLabel: document.getElementById('playbackAuthorLabel'),
  playbackSlider: document.getElementById('playbackSlider'),
  closePlaybackBtn: document.getElementById('closePlaybackBtn'),
  playToggleBtn: document.getElementById('playToggleBtn'),
  playToggleIcon: document.getElementById('playToggleIcon'),
  playToggleText: document.getElementById('playToggleText'),
  playPrevBtn: document.getElementById('playPrevBtn'),
  playNextBtn: document.getElementById('playNextBtn'),
  playResetBtn: document.getElementById('playResetBtn'),

  toastContainer: document.getElementById('toastContainer')
};

// Initialize Graph Renderer
const graphRenderer = new GitGraphRenderer({
  container: elements.graphContainer,
  svg: elements.gitSvgCanvas,
  commitsWrapper: elements.commitsContainer,
  onSelectCommit: (commit) => openCommitDrawer(commit)
});

// Toast notification helper
window.showToast = function (message, type = 'info') {
  const toast = document.createElement('div');
  const bg = type === 'success' ? 'bg-emerald-900/90 border-emerald-600 text-emerald-200' :
             type === 'warning' ? 'bg-amber-900/90 border-amber-600 text-amber-200' :
             type === 'error' ? 'bg-rose-900/90 border-rose-600 text-rose-200' :
             'bg-slate-800/95 border-slate-700 text-slate-200';

  const icon = type === 'success' ? 'check-circle' :
               type === 'warning' ? 'alert-triangle' :
               type === 'error' ? 'alert-circle' : 'info';

  toast.className = `toast flex items-center gap-2.5 px-4 py-2.5 rounded-xl border shadow-xl text-xs backdrop-blur font-medium ${bg}`;
  toast.innerHTML = `<i data-lucide="${icon}" class="w-4 h-4 flex-shrink-0"></i><span>${message}</span>`;

  elements.toastContainer.appendChild(toast);
  if (window.lucide) window.lucide.createIcons();

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(10px)';
    toast.style.transition = 'all 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 3500);
};

/**
 * Fetch and refresh repository status and commits
 */
async function loadRepositoryData(silent = false) {
  if (!silent) {
    elements.loadingState.classList.remove('hidden');
  }

  try {
    // 1. Fetch repo status
    const statusRes = await fetch('/api/status');
    const statusData = await statusRes.json();

    if (!statusData.isValid) {
      elements.repoNameLabel.textContent = 'No Git Repo Loaded';
      elements.repoPathInput.value = statusData.repoPath || '';
      showEmptyState();
      return;
    }

    state.repoStatus = statusData;
    state.repoPath = statusData.repoPath;
    elements.repoPathInput.value = statusData.repoPath;
    elements.repoNameLabel.textContent = statusData.repoName;
    elements.currentBranchLabel.textContent = statusData.currentBranch;

    // Working tree status
    if (statusData.dirty) {
      elements.dirtyStatusBadge.classList.remove('hidden');
      elements.dirtyStatusBadge.classList.add('flex');
    } else {
      elements.dirtyStatusBadge.classList.add('hidden');
      elements.dirtyStatusBadge.classList.remove('flex');
    }

    // 2. Fetch commits graph
    const commitsRes = await fetch('/api/commits');
    const graphData = await commitsRes.json();

    state.allCommits = graphData.commits || [];

    // Update counters
    elements.totalCommitsCount.textContent = graphData.totalCount || 0;
    elements.pushedCommitsCount.textContent = graphData.pushedCount || 0;
    elements.unpushedCommitsCount.textContent = graphData.unpushedCount || 0;

    // Update branch dropdown filter
    updateBranchDropdown(graphData.branches || []);

    // Apply active filters & render
    applyFilters();

    if (!silent) {
      window.showToast(`Loaded ${graphData.totalCount} commits from ${statusData.repoName}`, 'success');
    }
  } catch (err) {
    console.error('Failed to load repo data:', err);
    window.showToast(`Error: ${err.message}`, 'error');
    showEmptyState();
  } finally {
    elements.loadingState.classList.add('hidden');
  }
}

/**
 * Populate branch filter dropdown
 */
function updateBranchDropdown(branches) {
  const currentVal = elements.branchFilter.value;
  elements.branchFilter.innerHTML = '<option value="all">All Branches</option>';

  branches.forEach(b => {
    const opt = document.createElement('option');
    opt.value = b;
    opt.textContent = b;
    elements.branchFilter.appendChild(opt);
  });

  if (branches.includes(currentVal)) {
    elements.branchFilter.value = currentVal;
  }
}

/**
 * Filter commits by branch, pushed status, and search query
 */
function applyFilters() {
  const query = state.searchQuery.toLowerCase().trim();
  const branch = state.activeBranchFilter;
  const pushedFilter = state.activePushedFilter;

  state.filteredCommits = state.allCommits.filter(c => {
    // 1. Pushed vs Unpushed filter
    if (pushedFilter === 'pushed' && !c.isPushed) return false;
    if (pushedFilter === 'unpushed' && c.isPushed) return false;

    // 2. Branch filter
    if (branch !== 'all') {
      const onBranch = (c.localBranches && c.localBranches.includes(branch)) ||
                       (c.remoteBranches && c.remoteBranches.includes(branch));
      // For now if not exact branch head, we check ref matches
      if (!onBranch) {
        // Also check if any ref contains branch
        const matchesRef = c.refs && c.refs.some(r => r.name === branch);
        if (!matchesRef) return false;
      }
    }

    // 3. Search query filter
    if (query) {
      const matchHash = c.hash.toLowerCase().includes(query) || c.shortHash.toLowerCase().includes(query);
      const matchSubject = c.subject.toLowerCase().includes(query);
      const matchAuthor = c.author.name.toLowerCase().includes(query) || c.author.email.toLowerCase().includes(query);
      if (!matchHash && !matchSubject && !matchAuthor) return false;
    }

    return true;
  });

  elements.visibleCountLabel.textContent = `Showing ${state.filteredCommits.length} of ${state.allCommits.length} commits`;

  if (state.filteredCommits.length === 0) {
    showEmptyState();
  } else {
    elements.emptyState.classList.add('hidden');
    // Re-assign swimlanes for filtered commits to maintain visual elegance
    assignDynamicSwimlanes(state.filteredCommits);
    graphRenderer.render(state.filteredCommits);
  }
}

function showEmptyState() {
  elements.gitSvgCanvas.innerHTML = '';
  elements.commitsContainer.innerHTML = '';
  elements.emptyState.classList.remove('hidden');
}

/**
 * Dynamically recompute swimlane indices for filtered view
 */
function assignDynamicSwimlanes(commits) {
  const activeLanes = [];
  for (let i = 0; i < commits.length; i++) {
    const commit = commits[i];
    let laneIndex = activeLanes.indexOf(commit.hash);
    if (laneIndex === -1) {
      laneIndex = activeLanes.indexOf(null);
      if (laneIndex === -1) {
        laneIndex = activeLanes.length;
        activeLanes.push(null);
      }
    }
    commit.lane = laneIndex;

    if (commit.parents.length === 0) {
      activeLanes[laneIndex] = null;
    } else {
      activeLanes[laneIndex] = commit.parents[0];
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

    while (activeLanes.length > 0 && activeLanes[activeLanes.length - 1] === null) {
      activeLanes.pop();
    }
  }
}

/**
 * Open Commit Details Drawer
 */
async function openCommitDrawer(commit) {
  state.selectedCommit = commit;
  elements.commitDrawer.classList.remove('translate-x-full');

  // Pushed / Unpushed Status Banner
  if (commit.isPushed) {
    elements.drawerPushedBanner.className = 'p-3 rounded-xl flex items-center gap-3 bg-emerald-950/60 border border-emerald-700/50 text-emerald-300';
    elements.drawerPushedBanner.innerHTML = `
      <div class="w-8 h-8 rounded-lg bg-emerald-500/20 flex items-center justify-center">
        <i data-lucide="cloud-check" class="w-5 h-5 text-emerald-400"></i>
      </div>
      <div>
        <p class="text-xs font-bold text-white">Already Pushed Commit</p>
        <p class="text-[11px] text-emerald-400/90">This commit has been synchronized with the remote tracking repository.</p>
      </div>
    `;
  } else {
    elements.drawerPushedBanner.className = 'p-3 rounded-xl flex items-center gap-3 bg-amber-950/60 border border-amber-700/50 text-amber-300';
    elements.drawerPushedBanner.innerHTML = `
      <div class="w-8 h-8 rounded-lg bg-amber-500/20 flex items-center justify-center">
        <i data-lucide="cloud-off" class="w-5 h-5 text-amber-400"></i>
      </div>
      <div>
        <p class="text-xs font-bold text-white">Local / Unpushed Commit</p>
        <p class="text-[11px] text-amber-300/90">Exists only in your local clone. Run "git push" to sync with remote.</p>
      </div>
    `;
  }

  // Hash & Subjects
  elements.drawerHash.textContent = commit.hash;
  elements.drawerSubject.textContent = commit.subject;
  elements.drawerBody.textContent = commit.body || '(No additional commit message body)';

  // Author & Date
  elements.drawerAuthorName.textContent = commit.author.name;
  elements.drawerAuthorEmail.textContent = commit.author.email ? `<${commit.author.email}>` : '';
  elements.drawerDateRelative.textContent = graphRenderer.formatRelativeTime(commit.timestamp);
  elements.drawerDateIso.textContent = commit.dateIso || new Date(commit.timestamp * 1000).toLocaleString();

  // References / Badges
  elements.drawerRefsContainer.innerHTML = '';
  if (commit.isHead) {
    elements.drawerRefsContainer.innerHTML += `<span class="px-2 py-0.5 rounded-full bg-sky-500/20 text-sky-300 border border-sky-500/30 text-[11px] font-semibold flex items-center gap-1"><i data-lucide="disc" class="w-3 h-3"></i>HEAD</span>`;
  }
  (commit.localBranches || []).forEach(b => {
    elements.drawerRefsContainer.innerHTML += `<span class="px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 text-[11px] font-medium flex items-center gap-1"><i data-lucide="git-branch" class="w-3 h-3"></i>${b}</span>`;
  });
  (commit.remoteBranches || []).forEach(rb => {
    elements.drawerRefsContainer.innerHTML += `<span class="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[11px] font-medium flex items-center gap-1"><i data-lucide="globe" class="w-3 h-3"></i>${rb}</span>`;
  });
  (commit.tags || []).forEach(t => {
    elements.drawerRefsContainer.innerHTML += `<span class="px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30 text-[11px] font-medium flex items-center gap-1"><i data-lucide="tag" class="w-3 h-3"></i>${t}</span>`;
  });

  // Parents List (clickable to jump)
  elements.drawerParentsList.innerHTML = '';
  if (commit.parents.length === 0) {
    elements.drawerParentsList.innerHTML = '<span class="text-[11px] text-slate-500 italic">None (Root commit)</span>';
  } else {
    commit.parents.forEach(pHash => {
      const pBtn = document.createElement('button');
      pBtn.className = 'w-full text-left font-mono text-[11px] text-sky-400 hover:text-sky-300 hover:bg-slate-800/80 p-1 rounded flex items-center justify-between cursor-pointer';
      pBtn.innerHTML = `<span>${pHash.slice(0, 8)}</span><i data-lucide="arrow-right" class="w-3 h-3"></i>`;
      pBtn.addEventListener('click', () => graphRenderer.selectCommit(pHash));
      elements.drawerParentsList.appendChild(pBtn);
    });
  }

  // Children List (clickable to jump)
  elements.drawerChildrenList.innerHTML = '';
  if (commit.children.length === 0) {
    elements.drawerChildrenList.innerHTML = '<span class="text-[11px] text-slate-500 italic">None (Branch tip)</span>';
  } else {
    commit.children.forEach(cHash => {
      const cBtn = document.createElement('button');
      cBtn.className = 'w-full text-left font-mono text-[11px] text-sky-400 hover:text-sky-300 hover:bg-slate-800/80 p-1 rounded flex items-center justify-between cursor-pointer';
      cBtn.innerHTML = `<span>${cHash.slice(0, 8)}</span><i data-lucide="arrow-right" class="w-3 h-3"></i>`;
      cBtn.addEventListener('click', () => graphRenderer.selectCommit(cHash));
      elements.drawerChildrenList.appendChild(cBtn);
    });
  }

  // Fetch full details (files changed & patch)
  fetchCommitDetails(commit.hash);

  if (window.lucide) window.lucide.createIcons();
}

/**
 * Fetch detailed diff stat and files from server
 */
async function fetchCommitDetails(hash) {
  elements.drawerFilesList.innerHTML = '<div class="p-3 text-center text-xs text-slate-500">Loading changed files...</div>';
  elements.drawerPatch.textContent = 'Loading diff...';

  try {
    const res = await fetch(`/api/commit/${hash}`);
    const details = await res.json();

    elements.drawerFilesCount.textContent = `${details.files.length} file(s)`;
    elements.drawerFilesList.innerHTML = '';

    if (details.files.length === 0) {
      elements.drawerFilesList.innerHTML = '<div class="p-3 text-center text-xs text-slate-500 italic">No files changed (empty or merge commit)</div>';
    } else {
      details.files.forEach(f => {
        const item = document.createElement('div');
        item.className = 'p-2 flex items-center justify-between text-xs hover:bg-slate-800/40 transition-colors';

        const statusColor = f.status === 'A' ? 'text-emerald-400' :
                            f.status === 'D' ? 'text-rose-400' : 'text-sky-400';
        const statusLabel = f.status === 'A' ? 'Added' :
                            f.status === 'D' ? 'Deleted' : 'Modified';

        item.innerHTML = `
          <div class="flex items-center gap-2 min-w-0">
            <span class="font-mono font-bold text-[10px] ${statusColor}" title="${statusLabel}">[${f.status}]</span>
            <span class="text-slate-200 truncate font-mono text-[11px]" title="${f.filename}">${f.filename}</span>
          </div>
          <div class="flex items-center gap-1.5 font-mono text-[10px] flex-shrink-0">
            <span class="text-emerald-400">+${f.added}</span>
            <span class="text-rose-400">-${f.deleted}</span>
          </div>
        `;
        elements.drawerFilesList.appendChild(item);
      });
    }

    elements.drawerPatch.textContent = details.patch || 'No textual diff available for this commit.';
  } catch (err) {
    elements.drawerFilesList.innerHTML = '<div class="p-3 text-rose-400 text-xs">Failed to load changed files.</div>';
    elements.drawerPatch.textContent = 'Failed to load diff patch.';
  }
}

function closeCommitDrawer() {
  elements.commitDrawer.classList.add('translate-x-full');
  state.selectedCommit = null;
}

/**
 * Switch repository to path entered by user (or clone GitHub link)
 */
async function handleSwitchRepo(targetPath) {
  if (!targetPath) return;

  const isRemote = targetPath.startsWith('http://') ||
                   targetPath.startsWith('https://') ||
                   targetPath.startsWith('git@') ||
                   targetPath.includes('github.com');

  elements.connectBtn.disabled = true;
  elements.connectBtn.innerHTML = `<i data-lucide="loader" class="w-4 h-4 animate-spin"></i><span>${isRemote ? 'Cloning Repo...' : 'Connecting...'}</span>`;
  if (window.lucide) window.lucide.createIcons();

  if (isRemote) {
    window.showToast('Fetching/Cloning remote GitHub repository... please wait.', 'info');
  }

  try {
    const res = await fetch('/api/set-repo', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ repoPath: targetPath })
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Failed to connect to repository');
    }

    window.showToast(isRemote ? `Successfully connected to GitHub repo!` : `Switched repository to ${data.repoPath}`, 'success');
    await loadRepositoryData();
  } catch (err) {
    window.showToast(err.message, 'error');
  } finally {
    elements.connectBtn.disabled = false;
    elements.connectBtn.innerHTML = `<i data-lucide="refresh-cw" class="w-4 h-4"></i><span>Connect</span>`;
    if (window.lucide) window.lucide.createIcons();
  }
}

/**
 * Create or load sample demo repository
 */
async function handleCreateDemoRepo() {
  elements.demoRepoBtn.disabled = true;
  elements.demoRepoBtn.innerHTML = `<i data-lucide="loader" class="w-4 h-4 animate-spin"></i><span>Creating Demo...</span>`;
  if (window.lucide) window.lucide.createIcons();

  try {
    const res = await fetch('/api/create-demo-repo', { method: 'POST' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to create demo repo');

    window.showToast('Demo repository created and connected!', 'success');
    await loadRepositoryData();
  } catch (err) {
    window.showToast(err.message, 'error');
  } finally {
    elements.demoRepoBtn.disabled = false;
    elements.demoRepoBtn.innerHTML = `<i data-lucide="sparkles" class="w-4 h-4 text-amber-400"></i><span>Load Demo Repo</span>`;
    if (window.lucide) window.lucide.createIcons();
  }
}

/**
 * Git Action Simulator Handler
 */
async function triggerSimulateAction(action, params = {}) {
  elements.simMessage.classList.add('hidden');
  try {
    const res = await fetch('/api/simulate-action', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, params })
    });
    const result = await res.json();
    if (!res.ok) throw new Error(result.error || 'Simulation failed');

    elements.simMessage.textContent = `Action "${action}" succeeded! Watch the diagram update...`;
    elements.simMessage.classList.remove('hidden');
    window.showToast(`Simulated: ${action}`, 'info');
  } catch (err) {
    elements.simMessage.textContent = `Error: ${err.message}`;
    elements.simMessage.classList.remove('hidden');
    window.showToast(err.message, 'error');
  }
}

// ================= Event Listeners =================

// Connect Repo Form
elements.repoForm.addEventListener('submit', (e) => {
  e.preventDefault();
  handleSwitchRepo(elements.repoPathInput.value.trim());
});

elements.demoRepoBtn.addEventListener('click', handleCreateDemoRepo);
elements.emptyDemoBtn.addEventListener('click', handleCreateDemoRepo);

// Refresh button
elements.refreshBtn.addEventListener('click', () => loadRepositoryData());

// Jump to HEAD button
elements.centerHeadBtn.addEventListener('click', () => {
  if (state.repoStatus && state.repoStatus.headHash) {
    graphRenderer.selectCommit(state.repoStatus.headHash);
  }
});

// Filters
elements.searchInput.addEventListener('input', (e) => {
  state.searchQuery = e.target.value;
  applyFilters();
});

elements.branchFilter.addEventListener('change', (e) => {
  state.activeBranchFilter = e.target.value;
  applyFilters();
});

elements.pushedFilter.addEventListener('change', (e) => {
  state.activePushedFilter = e.target.value;
  applyFilters();
});

// Drawer close
elements.closeDrawerBtn.addEventListener('click', closeCommitDrawer);

// Copy hash in drawer
elements.copyHashBtn.addEventListener('click', () => {
  if (state.selectedCommit) {
    navigator.clipboard.writeText(state.selectedCommit.hash);
    window.showToast('Full hash copied to clipboard!', 'success');
  }
});

// Toggle patch accordion
elements.togglePatchBtn.addEventListener('click', () => {
  const isHidden = elements.patchContainer.classList.contains('hidden');
  if (isHidden) {
    elements.patchContainer.classList.remove('hidden');
    elements.togglePatchIcon.style.transform = 'rotate(180deg)';
  } else {
    elements.patchContainer.classList.add('hidden');
    elements.togglePatchIcon.style.transform = 'rotate(0deg)';
  }
});

// Simulator Modal
elements.simulateMenuBtn.addEventListener('click', () => {
  elements.simulateModal.classList.remove('hidden');
});
elements.closeSimulateModalBtn.addEventListener('click', () => {
  elements.simulateModal.classList.add('hidden');
});

elements.simCommitBtn.addEventListener('click', () => {
  triggerSimulateAction('commit', {
    message: `feat: add live commit at ${new Date().toLocaleTimeString()}`
  });
});

elements.simBranchBtn.addEventListener('click', () => {
  const branchName = `feature/exp-${Math.floor(Math.random() * 1000)}`;
  triggerSimulateAction('branch', { branchName });
});

elements.simCheckoutMainBtn.addEventListener('click', () => {
  triggerSimulateAction('checkout', { branchName: 'main' });
});

elements.simMergeBtn.addEventListener('click', () => {
  const current = state.repoStatus ? state.repoStatus.currentBranch : '';
  const target = current === 'main' ? 'feature/jwt-auth' : 'main';
  triggerSimulateAction('merge', { branchToMerge: target });
});

if (elements.simPushBtn) {
  elements.simPushBtn.addEventListener('click', () => {
    const current = state.repoStatus ? state.repoStatus.currentBranch : '';
    triggerSimulateAction('push', { branch: current });
  });
}

// ================= Animated Flow / Timeline Playback =================

const playback = {
  active: false,
  playing: false,
  index: 0,
  speed: 800,
  timer: null,
  commits: []
};

function startAnimatedFlow() {
  if (!state.filteredCommits || state.filteredCommits.length === 0) {
    window.showToast('No commits available to replay.', 'warning');
    return;
  }

  // Clone chronological commits (oldest to newest)
  playback.commits = [...state.filteredCommits].reverse();
  playback.active = true;
  playback.index = 0;
  playback.playing = true;

  // Set up slider range
  elements.playbackSlider.min = 1;
  elements.playbackSlider.max = playback.commits.length;
  elements.playbackSlider.value = 1;

  // Show playback bar
  elements.playbackBar.classList.remove('hidden');
  updatePlaybackPlayButton(true);

  // Render initial commit
  renderPlaybackStep(0);

  // Start auto-playback
  startPlaybackTimer();

  window.showToast('Animated Flow started! Replaying commit history...', 'info');
}

function stopAnimatedFlow() {
  pausePlaybackTimer();
  playback.active = false;
  elements.playbackBar.classList.add('hidden');
  // Restore full diagram
  applyFilters();
}

function renderPlaybackStep(stepIndex) {
  if (stepIndex < 0) stepIndex = 0;
  if (stepIndex >= playback.commits.length) stepIndex = playback.commits.length - 1;
  playback.index = stepIndex;

  const currentCommit = playback.commits[stepIndex];
  // Subset to render: all commits from root up to stepIndex, ordered in standard display order (newest first)
  const currentSubset = playback.commits.slice(0, stepIndex + 1).reverse();

  // Recompute swimlanes
  assignDynamicSwimlanes(currentSubset);

  // Render with animatedCommitHash
  graphRenderer.render(currentSubset, currentCommit.hash);

  // Update UI Labels
  elements.playbackStepLabel.textContent = `Step ${stepIndex + 1} / ${playback.commits.length}`;
  elements.playbackCommitSubject.textContent = currentCommit.subject;
  elements.playbackCommitSubject.title = currentCommit.subject;
  elements.playbackAuthorLabel.textContent = `by ${currentCommit.author.name}`;
  elements.playbackSlider.value = stepIndex + 1;

  // Smoothly scroll to the new commit row
  const activeRow = elements.commitsContainer.querySelector(`[data-hash="${currentCommit.hash}"]`);
  if (activeRow) {
    activeRow.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
}

function startPlaybackTimer() {
  pausePlaybackTimer();
  playback.playing = true;
  updatePlaybackPlayButton(true);

  playback.timer = setInterval(() => {
    if (playback.index < playback.commits.length - 1) {
      renderPlaybackStep(playback.index + 1);
    } else {
      // Reached the end
      pausePlaybackTimer();
      updatePlaybackPlayButton(false);
      window.showToast('Reached latest commit in timeline!', 'success');
    }
  }, playback.speed);
}

function pausePlaybackTimer() {
  if (playback.timer) {
    clearInterval(playback.timer);
    playback.timer = null;
  }
  playback.playing = false;
  updatePlaybackPlayButton(false);
}

function togglePlayback() {
  if (playback.playing) {
    pausePlaybackTimer();
  } else {
    if (playback.index >= playback.commits.length - 1) {
      // Restart if at the end
      renderPlaybackStep(0);
    }
    startPlaybackTimer();
  }
}

function updatePlaybackPlayButton(isPlaying) {
  if (elements.playToggleIcon && elements.playToggleText) {
    elements.playToggleIcon.setAttribute('data-lucide', isPlaying ? 'pause' : 'play');
    elements.playToggleText.textContent = isPlaying ? 'Pause' : 'Play';
    if (window.lucide) window.lucide.createIcons();
  }
}

// Attach Animated Flow Listeners
if (elements.animatedFlowBtn) {
  elements.animatedFlowBtn.addEventListener('click', startAnimatedFlow);
}
if (elements.closePlaybackBtn) {
  elements.closePlaybackBtn.addEventListener('click', stopAnimatedFlow);
}
if (elements.playToggleBtn) {
  elements.playToggleBtn.addEventListener('click', togglePlayback);
}
if (elements.playPrevBtn) {
  elements.playPrevBtn.addEventListener('click', () => {
    pausePlaybackTimer();
    renderPlaybackStep(playback.index - 1);
  });
}
if (elements.playNextBtn) {
  elements.playNextBtn.addEventListener('click', () => {
    pausePlaybackTimer();
    renderPlaybackStep(playback.index + 1);
  });
}
if (elements.playResetBtn) {
  elements.playResetBtn.addEventListener('click', () => {
    pausePlaybackTimer();
    renderPlaybackStep(0);
  });
}
if (elements.playbackSlider) {
  elements.playbackSlider.addEventListener('input', (e) => {
    pausePlaybackTimer();
    renderPlaybackStep(parseInt(e.target.value, 10) - 1);
  });
}

// Speed buttons
document.querySelectorAll('.speed-btn').forEach(btn => {
  btn.addEventListener('click', (e) => {
    document.querySelectorAll('.speed-btn').forEach(b => {
      b.className = 'speed-btn px-2 py-0.5 rounded text-[10px] text-slate-400 hover:text-white transition-colors cursor-pointer';
    });
    btn.className = 'speed-btn px-2 py-0.5 rounded text-[10px] bg-indigo-600 text-white font-semibold transition-colors cursor-pointer';
    playback.speed = parseInt(btn.dataset.speed, 10) || 800;
    if (playback.playing) {
      startPlaybackTimer();
    }
  });
});

// Keyboard Shortcuts
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    closeCommitDrawer();
    elements.simulateModal.classList.add('hidden');
    if (playback.active) stopAnimatedFlow();
  }
  if (e.key === ' ' && playback.active && document.activeElement !== elements.searchInput && document.activeElement !== elements.repoPathInput) {
    e.preventDefault();
    togglePlayback();
  }
  if (e.key === '/' && document.activeElement !== elements.searchInput && document.activeElement !== elements.repoPathInput) {
    e.preventDefault();
    elements.searchInput.focus();
  }
});

// WebSocket Real-time Updates
window.liveSocket.on('status', (data) => {
  if (data.connected) {
    elements.liveStatusBadge.innerHTML = `
      <span class="w-2 h-2 rounded-full bg-emerald-400 animate-ping"></span>
      <span class="w-2 h-2 rounded-full bg-emerald-400"></span>
      <span>Syncing</span>
    `;
    elements.liveStatusBadge.className = 'flex items-center gap-1.5 text-xs font-medium px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20';
  } else {
    elements.liveStatusBadge.innerHTML = `
      <span class="w-2 h-2 rounded-full bg-amber-400"></span>
      <span>Disconnected</span>
    `;
    elements.liveStatusBadge.className = 'flex items-center gap-1.5 text-xs font-medium px-2.5 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20';
  }
});

window.liveSocket.on('REPO_UPDATED', (data) => {
  console.log('[LiveSocket] Real-time repository update detected:', data);
  window.showToast('Git repository updated! Refreshing chain diagram...', 'info');
  // Refresh graph silently in real-time
  loadRepositoryData(true);
});

window.liveSocket.on('REPO_SWITCHED', (data) => {
  console.log('[LiveSocket] Repository switched to:', data.repoPath);
  loadRepositoryData();
});

// Initial boot
window.liveSocket.connect();
loadRepositoryData();
