/**
 * GitChain Live - Interactive Git Chain Diagram Renderer
 */
class GitGraphRenderer {
  constructor(options = {}) {
    this.container = options.container || document.getElementById('graphContainer');
    this.svg = options.svg || document.getElementById('gitSvgCanvas');
    this.commitsWrapper = options.commitsWrapper || document.getElementById('commitsContainer');
    this.onSelectCommit = options.onSelectCommit || (() => {});

    // Rendering dimensions
    this.rowHeight = 48;
    this.laneWidth = 26;
    this.laneOffsetLeft = 32;
    this.nodeRadius = 6.5;

    // Vibrant palette for branch swimlanes
    this.palette = [
      '#0ea5e9', // Sky blue
      '#10b981', // Emerald
      '#8b5cf6', // Violet
      '#f59e0b', // Amber
      '#ec4899', // Pink
      '#06b6d4', // Cyan
      '#f97316', // Orange
      '#14b8a6', // Teal
      '#a855f7', // Purple
      '#6366f1'  // Indigo
    ];

    this.commits = [];
    this.commitMap = new Map();
    this.selectedHash = null;
    this.hoveredHash = null;
  }

  getColorForLane(lane) {
    return this.palette[lane % this.palette.length];
  }

  /**
   * Render the complete commits diagram
   */
  render(commits) {
    this.commits = commits;
    this.commitMap.clear();
    commits.forEach(c => this.commitMap.set(c.hash, c));

    // Clear existing content
    this.svg.innerHTML = '';
    this.commitsWrapper.innerHTML = '';

    if (!commits || commits.length === 0) {
      this.svg.setAttribute('height', '0');
      this.svg.setAttribute('width', '0');
      return;
    }

    // Determine max lanes for SVG width calculation
    let maxLane = 0;
    commits.forEach(c => {
      if (c.lane > maxLane) maxLane = c.lane;
    });

    const totalHeight = commits.length * this.rowHeight;
    const graphWidth = this.laneOffsetLeft + (maxLane + 1) * this.laneWidth + 24;

    this.svg.setAttribute('height', totalHeight.toString());
    this.svg.setAttribute('width', graphWidth.toString());

    // Create SVG Defs for gradients & markers
    this.createSvgDefs();

    // Group for connector curves (behind nodes)
    const curvesGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    curvesGroup.setAttribute('class', 'curves-layer');
    this.svg.appendChild(curvesGroup);

    // Group for nodes (on top of curves)
    const nodesGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    nodesGroup.setAttribute('class', 'nodes-layer');
    this.svg.appendChild(nodesGroup);

    // Render branch curves connecting parents to children
    this.renderConnections(curvesGroup);

    // Render commit rows and SVG nodes
    commits.forEach((commit, index) => {
      const cy = index * this.rowHeight + this.rowHeight / 2;
      const cx = this.laneOffsetLeft + commit.lane * this.laneWidth;

      // 1. Draw SVG Node
      this.renderCommitNode(nodesGroup, commit, cx, cy, index);

      // 2. Build HTML Row for labels, badges, message, author, status
      this.renderCommitRow(commit, index, graphWidth);
    });

    // Re-initialize Lucide icons in dynamically inserted elements
    if (window.lucide) {
      window.lucide.createIcons();
    }
  }

  createSvgDefs() {
    const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
    defs.innerHTML = `
      <filter id="glow-pushed" x="-30%" y="-30%" width="160%" height="160%">
        <feGaussianBlur stdDeviation="2.5" result="blur" />
        <feComposite in="SourceGraphic" in2="blur" operator="over" />
      </filter>
      <filter id="glow-head" x="-50%" y="-50%" width="200%" height="200%">
        <feDropShadow dx="0" dy="0" stdDeviation="3.5" flood-color="#0ea5e9" flood-opacity="0.8" />
      </filter>
    `;
    this.svg.appendChild(defs);
  }

  /**
   * Render bezier connector lines between commits and their parents
   */
  renderConnections(curvesGroup) {
    const commitIndices = new Map();
    this.commits.forEach((c, i) => commitIndices.set(c.hash, i));

    for (let i = 0; i < this.commits.length; i++) {
      const commit = this.commits[i];
      const childY = i * this.rowHeight + this.rowHeight / 2;
      const childX = this.laneOffsetLeft + commit.lane * this.laneWidth;
      const childColor = this.getColorForLane(commit.lane);

      for (let p = 0; p < commit.parents.length; p++) {
        const parentHash = commit.parents[p];
        const parentIndex = commitIndices.get(parentHash);

        if (parentIndex !== undefined) {
          const parentCommit = this.commits[parentIndex];
          const parentY = parentIndex * this.rowHeight + this.rowHeight / 2;
          const parentX = this.laneOffsetLeft + parentCommit.lane * this.laneWidth;

          // Color curve with branch lane color
          const strokeColor = p === 0 ? childColor : this.getColorForLane(parentCommit.lane);

          let d = '';
          if (childX === parentX) {
            // Straight vertical line
            d = `M ${childX} ${childY} L ${parentX} ${parentY}`;
          } else {
            // Cubic Bezier curve for branch forks and merges
            const dy = parentY - childY;
            const c1y = childY + dy * 0.45;
            const c2y = childY + dy * 0.55;
            d = `M ${childX} ${childY} C ${childX} ${c1y}, ${parentX} ${c2y}, ${parentX} ${parentY}`;
          }

          const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
          path.setAttribute('d', d);
          path.setAttribute('class', 'branch-curve');
          path.setAttribute('stroke', strokeColor);
          path.setAttribute('stroke-width', '2.2');
          path.setAttribute('opacity', '0.75');
          path.dataset.childHash = commit.hash;
          path.dataset.parentHash = parentHash;

          curvesGroup.appendChild(path);
        }
      }
    }
  }

  /**
   * Render SVG commit circle node with pushed/unpushed indicator and HEAD halo
   */
  renderCommitNode(nodesGroup, commit, cx, cy, index) {
    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    g.setAttribute('class', 'commit-node-group');
    g.dataset.hash = commit.hash;

    const laneColor = this.getColorForLane(commit.lane);

    // If commit is HEAD, draw glowing pulsing halo ring
    if (commit.isHead) {
      const halo = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      halo.setAttribute('cx', cx);
      halo.setAttribute('cy', cy);
      halo.setAttribute('r', '11');
      halo.setAttribute('fill', 'none');
      halo.setAttribute('stroke', '#38bdf8');
      halo.setAttribute('stroke-width', '2');
      halo.setAttribute('class', 'node-head-halo');
      halo.setAttribute('filter', 'url(#glow-head)');
      g.appendChild(halo);
    }

    // Outer circle
    const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    circle.setAttribute('cx', cx);
    circle.setAttribute('cy', cy);
    circle.setAttribute('r', this.nodeRadius.toString());
    circle.setAttribute('class', 'node-circle');

    // Visual indicators for Pushed vs Unpushed (Local)
    if (commit.isPushed) {
      // Pushed to remote: solid lane color, glowing green/emerald core or clean border
      circle.setAttribute('fill', laneColor);
      circle.setAttribute('stroke', '#ffffff');
      circle.setAttribute('stroke-width', '2');
    } else {
      // Unpushed / Local: amber dashed stroke with darker core
      circle.setAttribute('fill', '#1e293b');
      circle.setAttribute('stroke', '#fbbf24');
      circle.setAttribute('stroke-width', '2.2');
      circle.setAttribute('stroke-dasharray', '3 2');
    }

    g.appendChild(circle);

    // If merge commit (2+ parents), add small inner ring
    if (commit.parents.length > 1) {
      const inner = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      inner.setAttribute('cx', cx);
      inner.setAttribute('cy', cy);
      inner.setAttribute('r', '2.5');
      inner.setAttribute('fill', '#ffffff');
      inner.setAttribute('pointer-events', 'none');
      g.appendChild(inner);
    }

    // Click handler on node
    g.style.cursor = 'pointer';
    g.addEventListener('click', (e) => {
      e.stopPropagation();
      this.selectCommit(commit.hash);
    });

    nodesGroup.appendChild(g);
  }

  /**
   * Render the corresponding interactive HTML row with commit info
   */
  renderCommitRow(commit, index, graphWidth) {
    const row = document.createElement('div');
    row.className = 'commit-row flex items-center pr-4 text-xs';
    row.dataset.hash = commit.hash;
    row.style.height = `${this.rowHeight}px`;

    // Row selection check
    if (this.selectedHash === commit.hash) {
      row.classList.add('selected');
    }

    // Left spacer matching the SVG graph width so text doesn't overlap swimlane nodes
    const graphSpacer = document.createElement('div');
    graphSpacer.style.width = `${graphWidth}px`;
    graphSpacer.style.minWidth = `${graphWidth}px`;
    graphSpacer.className = 'h-full flex-shrink-0';
    row.appendChild(graphSpacer);

    // Information container
    const content = document.createElement('div');
    content.className = 'flex items-center justify-between w-full min-w-0 gap-4';

    // Left side: Pushed Badge + Ref Badges + Hash + Subject
    const leftSide = document.createElement('div');
    leftSide.className = 'flex items-center gap-2.5 min-w-0 flex-1';

    // 1. PUSHED / UNPUSHED STATUS BADGE (Interactive & Clear)
    const pushedBadge = document.createElement('span');
    if (commit.isPushed) {
      pushedBadge.className = 'pushed-badge text-[10px] font-semibold px-2 py-0.5 rounded-full flex items-center gap-1 flex-shrink-0';
      pushedBadge.title = 'Pushed: Synced with remote tracking branch';
      pushedBadge.innerHTML = `<i data-lucide="cloud-check" class="w-3 h-3 text-emerald-400"></i><span>Pushed</span>`;
    } else {
      pushedBadge.className = 'unpushed-badge text-[10px] font-semibold px-2 py-0.5 rounded-full flex items-center gap-1 flex-shrink-0';
      pushedBadge.title = 'Unpushed: Local commit not yet pushed to remote';
      pushedBadge.innerHTML = `<i data-lucide="cloud-off" class="w-3 h-3 text-amber-400"></i><span>Local</span>`;
    }
    leftSide.appendChild(pushedBadge);

    // 2. REF BADGES (HEAD, Branches, Tags)
    if (commit.isHead) {
      const headBadge = document.createElement('span');
      headBadge.className = 'px-2 py-0.5 rounded-full bg-sky-500/20 text-sky-300 border border-sky-500/40 font-bold text-[10px] flex items-center gap-1 flex-shrink-0';
      headBadge.innerHTML = `<i data-lucide="disc" class="w-3 h-3 text-sky-400"></i><span>HEAD</span>`;
      leftSide.appendChild(headBadge);
    }

    if (commit.localBranches && commit.localBranches.length > 0) {
      commit.localBranches.forEach(b => {
        const branchBadge = document.createElement('span');
        branchBadge.className = 'px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 font-medium text-[10px] flex items-center gap-1 flex-shrink-0';
        branchBadge.innerHTML = `<i data-lucide="git-branch" class="w-2.5 h-2.5"></i><span>${b}</span>`;
        leftSide.appendChild(branchBadge);
      });
    }

    if (commit.remoteBranches && commit.remoteBranches.length > 0) {
      commit.remoteBranches.forEach(rb => {
        const remoteBadge = document.createElement('span');
        remoteBadge.className = 'px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-medium text-[10px] flex items-center gap-1 flex-shrink-0';
        remoteBadge.innerHTML = `<i data-lucide="globe" class="w-2.5 h-2.5"></i><span>${rb}</span>`;
        leftSide.appendChild(remoteBadge);
      });
    }

    if (commit.tags && commit.tags.length > 0) {
      commit.tags.forEach(t => {
        const tagBadge = document.createElement('span');
        tagBadge.className = 'px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30 font-medium text-[10px] flex items-center gap-1 flex-shrink-0';
        tagBadge.innerHTML = `<i data-lucide="tag" class="w-2.5 h-2.5"></i><span>${t}</span>`;
        leftSide.appendChild(tagBadge);
      });
    }

    // 3. COMMIT ID / HASH (with quick copy on click)
    const hashSpan = document.createElement('button');
    hashSpan.className = 'font-mono text-[11px] font-semibold text-slate-400 hover:text-sky-300 bg-slate-900/60 hover:bg-slate-800 px-1.5 py-0.5 rounded border border-slate-700/60 transition-all flex items-center gap-1 flex-shrink-0 cursor-pointer';
    hashSpan.title = `Full Hash: ${commit.hash} (Click to copy)`;
    hashSpan.innerHTML = `<span>${commit.shortHash}</span><i data-lucide="copy" class="w-2.5 h-2.5 opacity-60"></i>`;
    hashSpan.addEventListener('click', (e) => {
      e.stopPropagation();
      navigator.clipboard.writeText(commit.hash);
      if (window.showToast) window.showToast('Commit hash copied to clipboard!', 'success');
    });
    leftSide.appendChild(hashSpan);

    // 4. COMMIT SUBJECT MESSAGE
    const messageSpan = document.createElement('span');
    messageSpan.className = 'font-medium text-slate-100 truncate hover:text-sky-200 transition-colors';
    messageSpan.textContent = commit.subject;
    messageSpan.title = commit.subject;
    leftSide.appendChild(messageSpan);

    content.appendChild(leftSide);

    // Right side: Author Avatar + Name + Relative Timestamp
    const rightSide = document.createElement('div');
    rightSide.className = 'flex items-center gap-3 flex-shrink-0 text-slate-400 text-[11px]';

    // Author
    const authorDiv = document.createElement('div');
    authorDiv.className = 'flex items-center gap-1.5 max-w-[150px] truncate';
    const initials = (commit.author.name || 'U').split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase();
    authorDiv.innerHTML = `
      <span class="w-5 h-5 rounded-full bg-slate-800 text-sky-400 border border-slate-700 font-bold text-[9px] flex items-center justify-center">${initials}</span>
      <span class="text-slate-300 truncate" title="${commit.author.name} <${commit.author.email}>">${commit.author.name}</span>
    `;
    rightSide.appendChild(authorDiv);

    // Relative Time
    const timeSpan = document.createElement('span');
    timeSpan.className = 'text-slate-500 font-mono w-24 text-right';
    timeSpan.textContent = this.formatRelativeTime(commit.timestamp);
    timeSpan.title = commit.dateIso;
    rightSide.appendChild(timeSpan);

    content.appendChild(rightSide);
    row.appendChild(content);

    // Row selection and hover interactions
    row.addEventListener('click', () => {
      this.selectCommit(commit.hash);
    });

    row.addEventListener('mouseenter', () => {
      this.highlightCommit(commit.hash, true);
    });

    row.addEventListener('mouseleave', () => {
      this.highlightCommit(commit.hash, false);
    });

    this.commitsWrapper.appendChild(row);
  }

  selectCommit(hash) {
    this.selectedHash = hash;

    // Update row highlights
    const allRows = this.commitsWrapper.querySelectorAll('.commit-row');
    allRows.forEach(r => {
      if (r.dataset.hash === hash) {
        r.classList.add('selected');
        r.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      } else {
        r.classList.remove('selected');
      }
    });

    const commit = this.commitMap.get(hash);
    if (commit && this.onSelectCommit) {
      this.onSelectCommit(commit);
    }
  }

  highlightCommit(hash, isHovered) {
    // Dim or highlight connecting curves
    const curves = this.svg.querySelectorAll('.branch-curve');
    if (isHovered) {
      curves.forEach(c => {
        if (c.dataset.childHash === hash || c.dataset.parentHash === hash) {
          c.setAttribute('stroke-width', '3.5');
          c.setAttribute('opacity', '1');
        } else {
          c.setAttribute('opacity', '0.25');
        }
      });
    } else {
      curves.forEach(c => {
        c.setAttribute('stroke-width', '2.2');
        c.setAttribute('opacity', '0.75');
      });
    }
  }

  formatRelativeTime(timestamp) {
    if (!timestamp) return '';
    const now = Math.floor(Date.now() / 1000);
    const diff = now - timestamp;

    if (diff < 60) return `${diff}s ago`;
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
    const date = new Date(timestamp * 1000);
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }
}

window.GitGraphRenderer = GitGraphRenderer;
