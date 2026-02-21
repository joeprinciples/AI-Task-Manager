import * as vscode from 'vscode';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';
import { loadAllProjects, parseTaskFile, deleteTask, watchFolder, getActiveTask, scaffoldProjectFile, saveTaskFile, updateProjectPath } from './taskDataProvider';
import { TaskManagerPanel } from './webviewPanel';
import { ProjectFile } from './types';

const DISMISSED_WORKSPACES_KEY = 'aiTaskManager.dismissedWorkspaces';
const CLAUDE_MD_SETUP_KEY = 'aiTaskManager.claudeMdInjected';
const MARKER_START = '<!-- AI-TASK-MANAGER-START -->';
const MARKER_END = '<!-- AI-TASK-MANAGER-END -->';

let fileWatcher: vscode.FileSystemWatcher | undefined;
let statusBarItem: vscode.StatusBarItem;
let projectCache: ProjectFile[] = [];
let refreshTimer: ReturnType<typeof setTimeout> | undefined;
let autoTrimInProgress = false;

const DEBOUNCE_MS = 300;

// Normalize file paths for reliable comparison on Windows
function normalizePath(p: string): string {
  return path.normalize(p).toLowerCase();
}

function resolveTasksFolder(): string {
  const config = vscode.workspace.getConfiguration('aiTaskManager');
  let folder = config.get<string>('tasksFolder', '~/.ai-tasks');
  if (folder.startsWith('~')) {
    folder = path.join(os.homedir(), folder.slice(1));
  }
  return folder;
}

function ensureTasksFolder(folder: string): void {
  const isNew = !fs.existsSync(folder);
  if (isNew) {
    fs.mkdirSync(folder, { recursive: true });
    seedExampleFile(folder);
  }
}

function seedExampleFile(folder: string): void {
  const now = new Date().toISOString();
  const example = `---
{
  "projectName": "Example Project",
  "tasks": [
    {
      "id": "_template",
      "title": "Example: this task is hidden from the UI — use it as a reference for optional fields",
      "status": "todo",
      "priority": "medium",
      "type": "feature",
      "description": "A longer description of what needs to be done, with acceptance criteria or context",
      "createdAt": "${now}",
      "updatedAt": "${now}",
      "grepKeywords": ["functionName", "ClassName", "configKey"],
      "relatedDocuments": ["src/example/file.ts", "src/utils/helper.ts"]
    },
    {
      "id": "t1",
      "title": "This is an example task — right-click to change status or priority",
      "status": "doing",
      "priority": "medium",
      "createdAt": "${now}",
      "updatedAt": "${now}"
    },
    {
      "id": "t2",
      "title": "Add your own tasks with the + button, or let your AI assistant manage them",
      "status": "todo",
      "priority": "low",
      "createdAt": "${now}",
      "updatedAt": "${now}"
    }
  ]
}
---

## Getting Started

Delete this file once you're ready, or edit it to track a real project.
Task files are simple Markdown with JSON frontmatter — any AI assistant that can read and write files can manage your tasks automatically.
`;
  fs.writeFileSync(path.join(folder, 'example-project.md'), example, 'utf-8');
}

function syncAutoCheckFlag(folder: string): void {
  const flagPath = path.join(folder, '.auto-check');
  const config = vscode.workspace.getConfiguration('aiTaskManager');
  const enabled = config.get<boolean>('autoCheckTasks', true);

  if (enabled && !fs.existsSync(flagPath)) {
    fs.writeFileSync(flagPath, '', 'utf-8');
  } else if (!enabled && fs.existsSync(flagPath)) {
    fs.unlinkSync(flagPath);
  }
}

function deployTaskHelper(tasksFolder: string, extensionPath: string): void {
  const src = path.join(extensionPath, 'dist', 'scripts', 'task-helper.js');
  const dest = path.join(tasksFolder, 'task-helper.js');

  try {
    if (!fs.existsSync(src)) { return; }
    const srcContent = fs.readFileSync(src, 'utf-8');

    // Only overwrite if content actually changed
    if (fs.existsSync(dest)) {
      const destContent = fs.readFileSync(dest, 'utf-8');
      if (srcContent === destContent) { return; }
    }

    fs.writeFileSync(dest, srcContent, 'utf-8');

    // Remove old bash version if it exists
    const oldBash = path.join(tasksFolder, 'task-helper.sh');
    if (fs.existsSync(oldBash)) { fs.unlinkSync(oldBash); }
  } catch {
    // Non-critical - don't block activation
  }
}

function autoTrimDoneTasks(project: ProjectFile): void {
  const config = vscode.workspace.getConfiguration('aiTaskManager');
  const threshold = config.get<number>('autoRemoveDoneTasks', 0);
  if (threshold <= 0) { return; }

  const doneTasks = project.data.tasks
    .map((t, i) => ({ task: t, index: i }))
    .filter(({ task }) => task.status === 'done');

  if (doneTasks.length <= threshold) { return; }

  // Sort done tasks by updatedAt ascending (oldest first), remove the excess
  doneTasks.sort((a, b) => {
    const da = a.task.updatedAt || a.task.createdAt || '';
    const db = b.task.updatedAt || b.task.createdAt || '';
    return da.localeCompare(db);
  });

  const removeCount = doneTasks.length - threshold;
  const idsToRemove = new Set(doneTasks.slice(0, removeCount).map(d => d.task.id));

  project.data.tasks = project.data.tasks.filter(t => !idsToRemove.has(t.id));

  autoTrimInProgress = true;
  try {
    saveTaskFile(project);
  } finally {
    // Reset after a short delay so the file watcher ignores this write
    setTimeout(() => { autoTrimInProgress = false; }, DEBOUNCE_MS + 100);
  }
}

// When an AI agent saves a file it often guesses timestamps (or uses midnight).
// Compare against cached state and stamp real times on anything that changed.
function fixTimestamps(updated: ProjectFile, cached: ProjectFile | undefined): boolean {
  const now = new Date().toISOString();
  let changed = false;

  for (const task of updated.data.tasks) {
    const old = cached?.data.tasks.find(t => t.id === task.id);

    if (!old) {
      // New task - stamp both times
      task.createdAt = now;
      task.updatedAt = now;
      changed = true;
    } else if (old.status !== task.status || old.title !== task.title || old.priority !== task.priority || old.type !== task.type) {
      // Something changed - stamp updatedAt
      task.updatedAt = now;
      changed = true;
    }
  }

  if (changed) {
    autoTrimInProgress = true;
    try {
      saveTaskFile(updated);
    } finally {
      setTimeout(() => { autoTrimInProgress = false; }, DEBOUNCE_MS + 100);
    }
  }

  return changed;
}

// No point sending the full markdown body to the webview - it's never displayed
function stripContextForWebview(projects: ProjectFile[]): ProjectFile[] {
  return projects.map(p => ({ ...p, context: '' }));
}

function fullReload(): void {
  const folder = resolveTasksFolder();
  projectCache = loadAllProjects(folder);
  pushToWebview();
}

// Only re-parse the file that actually changed instead of reloading everything
function reloadSingleFile(changedUri: vscode.Uri): void {
  if (autoTrimInProgress) { return; }

  const filePath = changedUri.fsPath;
  const normalizedFilePath = normalizePath(filePath);

  try {
    fs.statSync(filePath);
  } catch {
    // File gone - drop it from the cache
    projectCache = projectCache.filter(p => normalizePath(p.filePath) !== normalizedFilePath);
    pushToWebview();
    return;
  }

  const updated = parseTaskFile(filePath);
  const idx = projectCache.findIndex(p => normalizePath(p.filePath) === normalizedFilePath);

  if (!updated.parseError) {
    const cached = idx >= 0 ? projectCache[idx] : undefined;
    fixTimestamps(updated, cached);
    autoTrimDoneTasks(updated);
  }

  if (idx >= 0) {
    projectCache[idx] = updated;
  } else {
    projectCache.push(updated);
  }

  pushToWebview();
}

function updateStatusBar(): void {
  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (!workspaceFolders || workspaceFolders.length === 0) {
    statusBarItem.text = '$(checklist) AI Tasks';
    statusBarItem.tooltip = 'Toggle AI Task Manager';
    return;
  }

  const workspacePath = normalizePath(workspaceFolders[0].uri.fsPath);

  for (const project of projectCache) {
    if (project.parseError || !project.data.projectPath) continue;
    if (normalizePath(project.data.projectPath) === workspacePath) {
      const active = getActiveTask(project);
      if (active) {
        const label = active.title.length > 40
          ? active.title.slice(0, 37) + '...'
          : active.title;
        statusBarItem.text = `$(checklist) ${label}`;
        statusBarItem.tooltip = `Doing: ${active.title}\n(${project.data.projectName})`;
        return;
      }
    }
  }

  statusBarItem.text = '$(checklist) AI Tasks';
  statusBarItem.tooltip = 'Toggle AI Task Manager';
}

function pushToWebview(): void {
  updateStatusBar();
  if (!TaskManagerPanel.currentPanel) {
    return;
  }
  TaskManagerPanel.currentPanel.updateProjects(stripContextForWebview(projectCache));
}

// All file watcher events are debounced so rapid saves don't thrash the parser
function onFileChanged(uri: vscode.Uri): void {
  if (refreshTimer) { clearTimeout(refreshTimer); }
  refreshTimer = setTimeout(() => reloadSingleFile(uri), DEBOUNCE_MS);
}

function onFileDeleted(uri: vscode.Uri): void {
  if (refreshTimer) { clearTimeout(refreshTimer); }
  const normalizedPath = normalizePath(uri.fsPath);
  refreshTimer = setTimeout(() => {
    projectCache = projectCache.filter(p => normalizePath(p.filePath) !== normalizedPath);
    pushToWebview();
  }, DEBOUNCE_MS);
}

function onFileCreated(uri: vscode.Uri): void {
  if (refreshTimer) { clearTimeout(refreshTimer); }
  refreshTimer = setTimeout(() => reloadSingleFile(uri), DEBOUNCE_MS);
}

function setupFileWatcher(context: vscode.ExtensionContext): void {
  if (fileWatcher) {
    fileWatcher.dispose();
  }

  const folder = resolveTasksFolder();
  ensureTasksFolder(folder);

  fileWatcher = watchFolder(folder, onFileChanged, onFileCreated, onFileDeleted);
  context.subscriptions.push(fileWatcher);
}

// --- CLAUDE.md auto-injection ---

const CLAUDE_MD_INSTRUCTIONS = `${MARKER_START}
## Task Management (REQUIRED WORKFLOW)

I use a persistent file-based task tracker at \`~/.ai-tasks/\` for cross-session persistence. Use your built-in task tools normally for in-session tracking, but also update the task file at \`~/.ai-tasks/\` so progress is preserved between sessions.

### Before writing any code, you MUST:
1. Check \`~/.ai-tasks/\` for a file where \`projectPath\` matches the current working directory
2. If a matching file exists, read it to see what's in progress
3. If the file has a JSON parse error, fix it immediately before doing anything else
4. If no file exists, create one with \`projectPath\` set to the current working directory
5. Add any new tasks I give you to the file with status \`"todo"\`
6. Set the task you're about to work on to \`"doing"\` BEFORE starting

### As you work:
- Any new work I ask for — even mid-conversation — must be added as a task BEFORE you start it. If I give you three things to do, that's three tasks. Do not treat follow-up requests as informal continuation.
- Mark finished tasks \`"done"\` and set \`updatedAt\` to the current ISO timestamp
- If new sub-tasks emerge, add them with incrementing IDs (check existing tasks for the next number)
- Set \`priority\` to \`"high"\`, \`"medium"\`, or \`"low"\` (defaults to \`"medium"\`)

### When you finish a session:
- Update the markdown context below the \`---\` with anything useful for next time: architecture decisions, discovered patterns, known issues, tech stack notes

### Rules
- One file per project, named descriptively (e.g. \`my-project.md\`)
- Do NOT touch files starting with \`_\` or \`.\` — they are system files
- Do NOT modify or delete tasks with IDs starting with \`_\` — they are system templates
- After editing a task file, always verify the JSON frontmatter is valid. If you break it, fix it immediately.
- \`grepKeywords\` and \`relatedDocuments\` are optional but helpful — add them when relevant

### File format
\`\`\`
---
{
  "projectName": "Human-Readable Project Name",
  "projectPath": "/absolute/path/to/project/root",
  "tasks": [
    {
      "id": "t1",
      "title": "Short task description",
      "status": "todo | doing | done",
      "priority": "high | medium | low",
      "createdAt": "ISO-8601",
      "updatedAt": "ISO-8601",
      "grepKeywords": ["optional", "search", "terms"],
      "relatedDocuments": ["optional/paths/to/files.ts"]
    }
  ]
}
---

Markdown body with project context, tech stack, architecture notes.
This is not displayed in the UI — it's context for you (the AI).
\`\`\`
${MARKER_END}`;

function getClaudeMdPath(): string {
  return path.join(os.homedir(), '.claude', 'CLAUDE.md');
}

function claudeMdHasMarkers(content: string): boolean {
  return content.includes(MARKER_START) && content.includes(MARKER_END);
}

function injectClaudeMdInstructions(context: vscode.ExtensionContext, onComplete: () => void): void {
  // Already set up in a previous activation
  if (context.globalState.get(CLAUDE_MD_SETUP_KEY, false)) {
    // But verify the markers are still there (user may have manually removed them)
    const claudePath = getClaudeMdPath();
    try {
      const content = fs.readFileSync(claudePath, 'utf-8');
      if (claudeMdHasMarkers(content)) { onComplete(); return; }
    } catch {
      // File doesn't exist — fall through to prompt
    }
    // Markers gone — reset flag so we can offer again
    context.globalState.update(CLAUDE_MD_SETUP_KEY, false);
  }

  const claudePath = getClaudeMdPath();
  let existingContent = '';
  let fileExists = false;

  try {
    existingContent = fs.readFileSync(claudePath, 'utf-8');
    fileExists = true;
    if (claudeMdHasMarkers(existingContent)) {
      // Already has our block — mark as done and skip
      context.globalState.update(CLAUDE_MD_SETUP_KEY, true);
      onComplete();
      return;
    }
  } catch {
    // File doesn't exist yet
  }

  vscode.window.showInformationMessage(
    'AI Task Manager can add task tracking instructions to your CLAUDE.md so AI assistants use the task system automatically. Set up now?',
    'Set up',
    'Skip'
  ).then(choice => {
    if (choice === 'Set up') {
      const claudeDir = path.dirname(claudePath);
      if (!fs.existsSync(claudeDir)) {
        fs.mkdirSync(claudeDir, { recursive: true });
      }

      const newContent = fileExists
        ? existingContent.trimEnd() + '\n\n' + CLAUDE_MD_INSTRUCTIONS + '\n'
        : CLAUDE_MD_INSTRUCTIONS + '\n';

      fs.writeFileSync(claudePath, newContent, 'utf-8');
      context.globalState.update(CLAUDE_MD_SETUP_KEY, true);
      vscode.window.showInformationMessage('Task management instructions added to CLAUDE.md.');
    } else if (choice === 'Skip') {
      // Mark as done so we don't ask again
      context.globalState.update(CLAUDE_MD_SETUP_KEY, true);
    }
    onComplete();
  });
}

function removeClaudeMdInstructions(): void {
  const claudePath = getClaudeMdPath();
  try {
    const content = fs.readFileSync(claudePath, 'utf-8');
    if (!claudeMdHasMarkers(content)) { return; }

    // Remove everything between (and including) the markers
    const startIdx = content.indexOf(MARKER_START);
    const endIdx = content.indexOf(MARKER_END) + MARKER_END.length;

    const before = content.slice(0, startIdx).trimEnd();
    const after = content.slice(endIdx).trimStart();

    const cleaned = before + (before && after ? '\n\n' : '') + after;

    if (cleaned.trim()) {
      fs.writeFileSync(claudePath, cleaned.trimEnd() + '\n', 'utf-8');
    } else {
      // File is now empty — remove it
      fs.unlinkSync(claudePath);
    }
  } catch {
    // File doesn't exist or can't be read — nothing to clean up
  }
}

function getWorkspacePath(): string | undefined {
  const folders = vscode.workspace.workspaceFolders;
  if (!folders || folders.length === 0) { return undefined; }
  return folders[0].uri.fsPath;
}

function hasMatchingTaskFile(workspacePath: string): boolean {
  const normalized = normalizePath(workspacePath);
  return projectCache.some(p =>
    !p.parseError && p.data.projectPath && normalizePath(p.data.projectPath) === normalized
  );
}

function findMovedProjectFile(workspacePath: string): ProjectFile | null {
  const folderName = path.basename(workspacePath).toLowerCase();

  for (const p of projectCache) {
    if (p.parseError || !p.data.projectPath) { continue; }

    // Folder name must match
    if (path.basename(p.data.projectPath).toLowerCase() !== folderName) { continue; }

    // Old path must no longer exist on disk (confirms move, not a duplicate folder)
    try {
      fs.statSync(p.data.projectPath);
      continue; // Old path still exists — skip
    } catch {
      // Old path gone — this is a likely match
      return p;
    }
  }

  return null;
}

async function initProjectForWorkspace(workspacePath: string): Promise<void> {
  const folder = resolveTasksFolder();
  const filePath = await scaffoldProjectFile(folder, workspacePath);
  if (filePath) {
    reloadSingleFile(vscode.Uri.file(filePath));
    vscode.window.showInformationMessage(`Task file created: ${path.basename(filePath)}`);
  }
}

function checkWorkspaceAndPrompt(context: vscode.ExtensionContext): void {
  const config = vscode.workspace.getConfiguration('aiTaskManager');
  if (!config.get<boolean>('autoCheckTasks', true)) { return; }

  const workspacePath = getWorkspacePath();
  if (!workspacePath) { return; }

  if (hasMatchingTaskFile(workspacePath)) { return; }

  // Don't nag if the user already dismissed this workspace
  const dismissed: string[] = context.globalState.get(DISMISSED_WORKSPACES_KEY, []);
  if (dismissed.includes(normalizePath(workspacePath))) { return; }

  // Check if this looks like a project that was moved from another location
  const movedMatch = findMovedProjectFile(workspacePath);
  if (movedMatch) {
    const oldPath = movedMatch.data.projectPath!;
    vscode.window.showInformationMessage(
      `"${movedMatch.data.projectName}" looks like it moved here from ${oldPath}. Update the task file?`,
      'Update',
      'Create new',
      'Dismiss'
    ).then(choice => {
      if (choice === 'Update') {
        const updated = updateProjectPath(movedMatch.filePath, workspacePath);
        if (updated) {
          reloadSingleFile(vscode.Uri.file(movedMatch.filePath));
          vscode.window.showInformationMessage(`Task file updated to point to ${workspacePath}`);
        }
      } else if (choice === 'Create new') {
        initProjectForWorkspace(workspacePath);
      } else if (choice === 'Dismiss') {
        dismissed.push(normalizePath(workspacePath));
        context.globalState.update(DISMISSED_WORKSPACES_KEY, dismissed);
      }
    });
    return;
  }

  vscode.window.showInformationMessage(
    `No task file found for this workspace. Create one?`,
    'Create',
    'Don\'t ask again'
  ).then(choice => {
    if (choice === 'Create') {
      initProjectForWorkspace(workspacePath);
    } else if (choice === 'Don\'t ask again') {
      dismissed.push(normalizePath(workspacePath));
      context.globalState.update(DISMISSED_WORKSPACES_KEY, dismissed);
    }
  });
}

export function activate(context: vscode.ExtensionContext) {
  statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 0);
  statusBarItem.command = 'aiTaskManager.toggle';
  statusBarItem.text = '$(checklist) AI Tasks';
  statusBarItem.tooltip = 'Toggle AI Task Manager';
  statusBarItem.show();
  context.subscriptions.push(statusBarItem);

  const toggleCommand = vscode.commands.registerCommand(
    'aiTaskManager.toggle',
    () => {
      if (TaskManagerPanel.currentPanel) {
        TaskManagerPanel.currentPanel.dispose();
      } else {
        const panel = TaskManagerPanel.createOrShow(context.extensionUri);
        // When a task gets changed via the UI, reload through the same
        // debounced path as the file watcher to prevent duplicates
        panel.onDidDeleteTask((filePath) => {
          onFileChanged(vscode.Uri.file(filePath));
        });
        panel.onDidUpdateTask((filePath) => {
          onFileChanged(vscode.Uri.file(filePath));
        });
        panel.onDidBecomeVisible(() => {
          fullReload();
        });
        fullReload();
      }
    }
  );
  context.subscriptions.push(toggleCommand);

  const initCommand = vscode.commands.registerCommand(
    'aiTaskManager.initProject',
    async () => {
      const workspacePath = getWorkspacePath();
      if (!workspacePath) {
        vscode.window.showWarningMessage('No workspace folder open.');
        return;
      }
      if (hasMatchingTaskFile(workspacePath)) {
        vscode.window.showInformationMessage('A task file already exists for this workspace.');
        return;
      }
      await initProjectForWorkspace(workspacePath);
    }
  );
  context.subscriptions.push(initCommand);

  setupFileWatcher(context);
  syncAutoCheckFlag(resolveTasksFolder());

  // Load cache on startup so the status bar shows the active task
  const folder = resolveTasksFolder();
  projectCache = loadAllProjects(folder);
  deployTaskHelper(folder, context.extensionPath);
  updateStatusBar();

  // Offer to inject instructions into CLAUDE.md on first activation,
  // then prompt to create a task file — sequenced so they don't stack
  injectClaudeMdInstructions(context, () => {
    checkWorkspaceAndPrompt(context);
  });

  // If the user changes settings, rewire everything
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration('aiTaskManager.tasksFolder')) {
        setupFileWatcher(context);
        fullReload();
      }
      if (e.affectsConfiguration('aiTaskManager.autoCheckTasks') ||
          e.affectsConfiguration('aiTaskManager.tasksFolder')) {
        syncAutoCheckFlag(resolveTasksFolder());
      }
      if (e.affectsConfiguration('aiTaskManager.autoRemoveDoneTasks')) {
        for (const project of projectCache) {
          if (!project.parseError) {
            autoTrimDoneTasks(project);
          }
        }
        pushToWebview();
      }
    })
  );
}

export function deactivate() {
  if (fileWatcher) { fileWatcher.dispose(); }
  if (refreshTimer) { clearTimeout(refreshTimer); }
}
