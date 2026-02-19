import * as vscode from 'vscode';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';
import { loadAllProjects, parseTaskFile, deleteTask, watchFolder, getActiveTask } from './taskDataProvider';
import { TaskManagerPanel } from './webviewPanel';
import { ProjectFile } from './types';

let fileWatcher: vscode.FileSystemWatcher | undefined;
let statusBarItem: vscode.StatusBarItem;
let projectCache: ProjectFile[] = [];
let refreshTimer: ReturnType<typeof setTimeout> | undefined;

const DEBOUNCE_MS = 300;
const MAX_FILE_SIZE = 1024 * 1024; // 1 MB

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
  const enabled = config.get<boolean>('autoCheckTasks', false);

  if (enabled && !fs.existsSync(flagPath)) {
    fs.writeFileSync(flagPath, '', 'utf-8');
  } else if (!enabled && fs.existsSync(flagPath)) {
    fs.unlinkSync(flagPath);
  }
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
        fullReload();
      }
    }
  );
  context.subscriptions.push(toggleCommand);

  setupFileWatcher(context);
  syncAutoCheckFlag(resolveTasksFolder());

  // Load cache on startup so the status bar shows the active task
  const folder = resolveTasksFolder();
  projectCache = loadAllProjects(folder);
  updateStatusBar();

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
    })
  );
}

export function deactivate() {
  if (fileWatcher) { fileWatcher.dispose(); }
  if (refreshTimer) { clearTimeout(refreshTimer); }
}
