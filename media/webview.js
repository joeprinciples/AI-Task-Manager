// @ts-nocheck
(function () {
  const vscode = acquireVsCodeApi();

  let projects = [];
  let expandedProjects = new Set();
  let hiddenDoneProjects = new Set();

  const tableBody = document.getElementById('tableBody');
  const summaryBar = document.getElementById('summaryBar');
  const titleText = document.getElementById('titleText');
  const settingsBtn = document.getElementById('settingsBtn');

  // Inline SVGs so we don't need a CDN or icon font
  const icons = {
    circleDot: `<svg class="status-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><circle cx="12" cy="12" r="1" fill="currentColor"></circle></svg>`,
    circleCheck: `<svg class="status-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><path d="m9 12 2 2 4-4"></path></svg>`,
    circle: `<svg class="status-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle></svg>`,
    chevronRight: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>`,
    x: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`,
    warning: `<svg class="status-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>`,
  };

  function getStatusIcon(status) {
    switch (status) {
      case 'doing': return icons.circleDot;
      case 'done': return icons.circleCheck;
      case 'todo': return icons.circle;
      default: return icons.circle;
    }
  }

  function getStatusLabel(status) {
    switch (status) {
      case 'doing': return 'Doing';
      case 'done': return 'Done';
      case 'todo': return 'To Do';
      default: return status;
    }
  }

  function getStatusClass(status) {
    return `status-${status}`;
  }

  const STATUS_ORDER = { doing: 0, todo: 1, done: 2 };
  const PRIORITY_ORDER = { high: 0, medium: 1, low: 2 };

  function sortTasks(tasks) {
    return [...tasks].sort((a, b) => {
      const statusDiff = (STATUS_ORDER[a.status] ?? 1) - (STATUS_ORDER[b.status] ?? 1);
      if (statusDiff !== 0) return statusDiff;
      const pa = PRIORITY_ORDER[a.priority || 'medium'] ?? 1;
      const pb = PRIORITY_ORDER[b.priority || 'medium'] ?? 1;
      return pa - pb;
    });
  }

  function getActiveTask(project) {
    const sorted = sortTasks(project.data.tasks.filter(t => !t.id.startsWith('_')));
    return sorted[0] || null;
  }

  function getTaskStats(project) {
    const visible = project.data.tasks.filter(t => !t.id.startsWith('_'));
    const total = visible.length;
    const done = visible.filter(t => t.status === 'done').length;
    return { done, total };
  }

  function formatTimestamp(isoStr) {
    if (!isoStr) { return '—'; }
    const d = new Date(isoStr);
    if (isNaN(d.getTime())) { return '—'; }
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const year = String(d.getFullYear()).slice(-2);
    let hours = d.getHours();
    const ampm = hours >= 12 ? 'pm' : 'am';
    hours = hours % 12 || 12;
    const minutes = String(d.getMinutes()).padStart(2, '0');
    return `${month}/${day}/${year} - ${hours}:${minutes}${ampm}`;
  }

  function renderProjects() {
    if (!projects.length) {
      tableBody.innerHTML = '<div class="empty-state">No projects found. Configure the tasks folder in settings.</div>';
      return;
    }

    const fragment = document.createDocumentFragment();

    for (const project of projects) {
      if (project.parseError) {
        const row = document.createElement('div');
        row.className = 'project-row project-row-error';

        row.innerHTML = `
          <div class="col-status status-cell status-error">
            ${icons.warning}
            <span class="status-label">Error</span>
          </div>
          <div class="col-task task-cell error-message" title="${escapeHtml(project.parseError)}">${escapeHtml(project.parseError)}</div>
          <div class="col-project project-cell"></div>
          <div class="col-document">
            <span class="doc-link" data-filepath="${escapeHtml(project.filePath)}" title="${escapeHtml(project.fileName)}">${escapeHtml(project.fileName)}</span>
          </div>
          <div class="col-progress progress-cell"></div>
          <div class="col-expand"></div>
        `;

        fragment.appendChild(row);
        continue;
      }

      const activeTask = getActiveTask(project);
      const stats = getTaskStats(project);
      const isExpanded = expandedProjects.has(project.filePath);

      const row = document.createElement('div');
      row.className = 'project-row';
      row.addEventListener('click', (e) => {
        if (e.target.closest('.doc-link')) return;
        toggleExpand(project.filePath);
      });

      const statusClass = activeTask ? getStatusClass(activeTask.status) : 'status-todo';
      const statusIcon = activeTask ? getStatusIcon(activeTask.status) : getStatusIcon('todo');
      const statusLabel = activeTask ? getStatusLabel(activeTask.status) : 'No tasks';
      const taskTitle = activeTask ? activeTask.title : 'No tasks';

      row.innerHTML = `
        <div class="col-status status-cell ${statusClass}">
          ${statusIcon}
          <span class="status-label">${statusLabel}</span>
        </div>
        <div class="col-task task-cell" title="${escapeHtml(taskTitle)}">${escapeHtml(taskTitle)}</div>
        <div class="col-project project-cell" title="${escapeHtml(project.data.projectName)}">${escapeHtml(project.data.projectName)}</div>
        <div class="col-document">
          <span class="doc-link" data-filepath="${escapeHtml(project.filePath)}" title="${escapeHtml(project.fileName)}">${escapeHtml(project.fileName)}</span>
        </div>
        <div class="col-progress progress-cell">${stats.done}/${stats.total}</div>
        <div class="col-expand">
          <button class="expand-btn ${isExpanded ? 'expanded' : ''}" title="Toggle task history">
            ${icons.chevronRight}
          </button>
        </div>
      `;

      fragment.appendChild(row);

      if (isExpanded) {
        fragment.appendChild(createTaskHistory(project));
      }
    }

    tableBody.innerHTML = '';
    tableBody.appendChild(fragment);

    // Open the .md file when clicking the document name
    tableBody.querySelectorAll('.doc-link').forEach(link => {
      link.addEventListener('click', (e) => {
        e.stopPropagation();
        vscode.postMessage({ type: 'openFile', filePath: e.currentTarget.getAttribute('data-filepath') });
      });
    });
  }

  function createTaskHistory(project) {
    const allTasks = sortTasks(project.data.tasks.filter(t => !t.id.startsWith('_')));
    const doneTasks = allTasks.filter(t => t.status === 'done');
    const activeTasks = allTasks.filter(t => t.status !== 'done');
    const doneHidden = hiddenDoneProjects.has(project.filePath);

    const container = document.createElement('div');
    container.className = 'task-history';

    // Header with + button
    const header = document.createElement('div');
    header.className = 'task-history-header';

    const headerText = document.createElement('span');
    headerText.textContent = `Tasks (${allTasks.length})`;

    const addBtn = document.createElement('button');
    addBtn.className = 'add-task-btn';
    addBtn.title = 'Add task';
    addBtn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>`;
    addBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      // Show inline input
      const existing = container.querySelector('.add-task-input-row');
      if (existing) { existing.remove(); return; }
      const inputRow = document.createElement('div');
      inputRow.className = 'add-task-input-row';
      const input = document.createElement('input');
      input.className = 'add-task-input';
      input.type = 'text';
      input.placeholder = 'Task title...';
      input.addEventListener('keydown', (ke) => {
        if (ke.key === 'Enter' && input.value.trim()) {
          vscode.postMessage({ type: 'addTask', filePath: project.filePath, title: input.value.trim() });
          inputRow.remove();
        } else if (ke.key === 'Escape') {
          inputRow.remove();
        }
      });
      inputRow.appendChild(input);
      header.after(inputRow);
      input.focus();
    });

    header.appendChild(headerText);
    header.appendChild(addBtn);
    container.appendChild(header);

    const list = document.createElement('div');
    list.className = 'task-history-list';

    const visibleTasks = doneHidden ? activeTasks : allTasks;

    for (const task of visibleTasks) {
      list.appendChild(createTaskRow(task, project.filePath));
    }
    container.appendChild(list);

    // Done toggle + clear
    if (doneTasks.length > 0) {
      const footer = document.createElement('div');
      footer.className = 'done-toggle';

      const toggle = document.createElement('span');
      toggle.className = 'done-toggle-link';
      toggle.textContent = doneHidden
        ? `Show ${doneTasks.length} completed`
        : `Hide completed`;
      toggle.addEventListener('click', () => {
        if (doneHidden) {
          hiddenDoneProjects.delete(project.filePath);
        } else {
          hiddenDoneProjects.add(project.filePath);
        }
        renderProjects();
      });

      footer.appendChild(toggle);

      if (!doneHidden) {
        const clear = document.createElement('span');
        clear.className = 'done-toggle-link';
        clear.textContent = 'Clear done';
        clear.addEventListener('click', () => {
          vscode.postMessage({ type: 'clearDone', filePath: project.filePath, count: doneTasks.length });
        });
        footer.appendChild(clear);
      }

      container.appendChild(footer);
    }

    return container;
  }

  // --- Context menu ---
  let contextMenu = null;

  function showContextMenu(x, y, filePath, taskId, currentStatus, currentPriority, currentType) {
    hideContextMenu();

    contextMenu = document.createElement('div');
    contextMenu.className = 'context-menu';

    const items = [
      { label: 'To Do', status: 'todo' },
      { label: 'Doing', status: 'doing' },
      { label: 'Done', status: 'done' },
      { type: 'separator' },
      { type: 'header', label: 'Priority' },
      { label: 'High', priority: 'high' },
      { label: 'Medium', priority: 'medium' },
      { label: 'Low', priority: 'low' },
      { type: 'separator' },
      { type: 'header', label: 'Type' },
      { label: 'Bug', taskType: 'bug' },
      { label: 'Feature', taskType: 'feature' },
      { label: 'Task', taskType: 'task' },
      { label: 'None', taskType: undefined },
      { type: 'separator' },
      { label: 'Remove', action: 'delete', destructive: true },
    ];

    for (const item of items) {
      if (item.type === 'separator') {
        const sep = document.createElement('div');
        sep.className = 'context-menu-separator';
        contextMenu.appendChild(sep);
        continue;
      }
      if (item.type === 'header') {
        const hdr = document.createElement('div');
        hdr.className = 'context-menu-header';
        hdr.textContent = item.label;
        contextMenu.appendChild(hdr);
        continue;
      }

      const el = document.createElement('div');
      el.className = 'context-menu-item';
      if (item.destructive) el.classList.add('context-menu-destructive');
      if (item.status === currentStatus) el.classList.add('context-menu-active');
      if (item.priority === currentPriority) el.classList.add('context-menu-active');
      if ('taskType' in item && item.taskType === currentType) el.classList.add('context-menu-active');

      el.textContent = item.label;
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        hideContextMenu();
        if (item.action === 'delete') {
          vscode.postMessage({ type: 'deleteTask', filePath, taskId, status: currentStatus });
        } else if (item.status) {
          vscode.postMessage({ type: 'setStatus', filePath, taskId, status: item.status });
        } else if (item.priority) {
          vscode.postMessage({ type: 'setPriority', filePath, taskId, priority: item.priority });
        } else if ('taskType' in item) {
          vscode.postMessage({ type: 'setType', filePath, taskId, taskType: item.taskType });
        }
      });

      contextMenu.appendChild(el);
    }

    document.body.appendChild(contextMenu);

    // Position — keep within viewport
    const menuRect = contextMenu.getBoundingClientRect();
    const maxX = window.innerWidth - menuRect.width - 4;
    const maxY = window.innerHeight - menuRect.height - 4;
    contextMenu.style.left = Math.min(x, maxX) + 'px';
    contextMenu.style.top = Math.min(y, maxY) + 'px';
  }

  function hideContextMenu() {
    if (contextMenu) {
      contextMenu.remove();
      contextMenu = null;
    }
  }

  document.addEventListener('click', hideContextMenu);
  document.addEventListener('contextmenu', (e) => {
    // Only let our row handler fire; suppress default everywhere
    if (!e.target.closest('.task-history-row')) {
      e.preventDefault();
      hideContextMenu();
    }
  });

  function createTaskRow(task, filePath) {
    const row = document.createElement('div');
    row.className = 'task-history-row';

    const statusClass = getStatusClass(task.status);
    const statusIcon = getStatusIcon(task.status);
    const statusLabel = getStatusLabel(task.status);

    const priority = task.priority || 'medium';
    const priorityBadge = priority !== 'medium'
      ? `<span class="priority-badge priority-${priority}">${priority}</span>`
      : '';

    const taskType = task.type;
    const typeBadge = (taskType === 'bug' || taskType === 'feature')
      ? `<span class="type-badge type-${taskType}">${taskType}</span>`
      : '';

    row.innerHTML = `
      <div class="task-history-status ${statusClass}">
        ${statusIcon}
        <span>${statusLabel}</span>
      </div>
      <div class="task-history-title" title="${escapeHtml(task.title)}">${typeBadge}${priorityBadge}${escapeHtml(task.title)}</div>
      <div class="task-history-timestamp">${formatTimestamp(task.updatedAt)}</div>
    `;

    row.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      e.stopPropagation();
      showContextMenu(e.clientX, e.clientY, filePath, task.id, task.status, task.priority || 'medium', task.type);
    });

    return row;
  }

  function toggleExpand(filePath) {
    if (expandedProjects.has(filePath)) {
      expandedProjects.delete(filePath);
    } else {
      expandedProjects.add(filePath);
    }
    renderProjects();
  }

  function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function updateTitleBar() {
    const projectCount = projects.filter(p => !p.parseError).length;
    const taskCount = projects.reduce((sum, p) => sum + (p.parseError ? 0 : p.data.tasks.filter(t => !t.id.startsWith('_')).length), 0);
    const parts = [];
    parts.push(`${projectCount} Project${projectCount !== 1 ? 's' : ''}`);
    parts.push(`${taskCount} Task${taskCount !== 1 ? 's' : ''}`);
    titleText.textContent = parts.join('  \u00b7  ');
  }

  function updateSummaryBar() {
    const projectCount = projects.filter(p => !p.parseError).length;
    const allTasks = projects.flatMap(p => p.parseError ? [] : p.data.tasks.filter(t => !t.id.startsWith('_')));
    const doing = allTasks.filter(t => t.status === 'doing').length;
    const todo = allTasks.filter(t => t.status === 'todo').length;
    const done = allTasks.filter(t => t.status === 'done').length;

    const parts = [];
    parts.push(`${projectCount} project${projectCount !== 1 ? 's' : ''}`);
    if (doing > 0) parts.push(`${doing} active`);
    if (todo > 0) parts.push(`${todo} pending`);
    if (done > 0) parts.push(`${done} done`);

    summaryBar.textContent = parts.join('  \u00b7  ');
  }

  settingsBtn.addEventListener('click', () => {
    vscode.postMessage({ type: 'openSettings' });
  });

  window.addEventListener('message', (event) => {
    const message = event.data;
    if (message.type === 'update') {
      projects = message.projects || [];
      renderProjects();
      updateTitleBar();
      updateSummaryBar();
    }
  });

  renderProjects();
  updateTitleBar();
  updateSummaryBar();
})();
