import * as vscode from 'vscode';
import * as path from 'path';
import { ProjectFile } from './types';
import { deleteTask, setTaskStatus, setTaskPriority, addTask } from './taskDataProvider';

export class TaskManagerPanel {
  public static currentPanel: TaskManagerPanel | undefined;
  private readonly _panel: vscode.WebviewPanel;
  private readonly _extensionUri: vscode.Uri;
  private _disposables: vscode.Disposable[] = [];
  private _onDidDeleteTask: ((filePath: string) => void) | undefined;
  private _onDidUpdateTask: ((filePath: string) => void) | undefined;

  public static createOrShow(extensionUri: vscode.Uri): TaskManagerPanel {
    if (TaskManagerPanel.currentPanel) {
      TaskManagerPanel.currentPanel._panel.reveal();
      return TaskManagerPanel.currentPanel;
    }

    const panel = vscode.window.createWebviewPanel(
      'aiTaskManager',
      'AI Task Manager',
      vscode.ViewColumn.Two,
      {
        enableScripts: true,
        localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'dist', 'media')],
        retainContextWhenHidden: true,
      }
    );

    TaskManagerPanel.currentPanel = new TaskManagerPanel(panel, extensionUri);
    return TaskManagerPanel.currentPanel;
  }

  // Lets the extension host know when we delete a task so it can update its cache
  public onDidDeleteTask(cb: (filePath: string) => void): void {
    this._onDidDeleteTask = cb;
  }

  public onDidUpdateTask(cb: (filePath: string) => void): void {
    this._onDidUpdateTask = cb;
  }

  private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri) {
    this._panel = panel;
    this._extensionUri = extensionUri;

    this._panel.webview.html = this._getWebviewContent();
    this._panel.onDidDispose(() => this.dispose(), null, this._disposables);
    this._panel.webview.onDidReceiveMessage(
      (message) => this._handleMessage(message),
      null,
      this._disposables
    );
  }

  public updateProjects(projects: ProjectFile[]): void {
    this._panel.webview.postMessage({ type: 'update', projects });
  }

  public dispose(): void {
    TaskManagerPanel.currentPanel = undefined;
    this._panel.dispose();
    while (this._disposables.length) {
      const d = this._disposables.pop();
      if (d) { d.dispose(); }
    }
  }

  public get visible(): boolean {
    return this._panel.visible;
  }

  public reveal(): void {
    this._panel.reveal();
  }

  private _handleMessage(message: any): void {
    switch (message.type) {
      case 'openFile': {
        const uri = vscode.Uri.file(message.filePath);
        vscode.window.showTextDocument(uri);
        break;
      }
      case 'openSettings':
        vscode.commands.executeCommand('workbench.action.openSettings', 'aiTaskManager');
        break;
      case 'togglePanel':
        this._panel.dispose();
        break;
      case 'setStatus': {
        const updated = setTaskStatus(message.filePath, message.taskId, message.status);
        if (updated && this._onDidUpdateTask) {
          this._onDidUpdateTask(message.filePath);
        }
        break;
      }
      case 'setPriority': {
        const updated = setTaskPriority(message.filePath, message.taskId, message.priority);
        if (updated && this._onDidUpdateTask) {
          this._onDidUpdateTask(message.filePath);
        }
        break;
      }
      case 'addTask': {
        const updated = addTask(message.filePath, message.title);
        if (updated && this._onDidUpdateTask) {
          this._onDidUpdateTask(message.filePath);
        }
        break;
      }
      case 'deleteTask': {
        const { filePath, taskId, status } = message;
        const doDelete = () => {
          const deleted = deleteTask(filePath, taskId);
          if (deleted && this._onDidDeleteTask) {
            this._onDidDeleteTask(filePath);
          }
        };

        if (status && status !== 'done') {
          const warning = status === 'doing'
            ? 'This task is currently in progress. Remove it?'
            : 'This task is still waiting to be done. Remove it?';
          vscode.window.showWarningMessage(warning, 'Remove', 'Cancel').then(choice => {
            if (choice === 'Remove') { doDelete(); }
          });
        } else {
          doDelete();
        }
        break;
      }
    }
  }

  private _getWebviewContent(): string {
    const webview = this._panel.webview;
    const mediaPath = vscode.Uri.joinPath(this._extensionUri, 'dist', 'media');
    const cssUri = webview.asWebviewUri(vscode.Uri.joinPath(mediaPath, 'webview.css'));
    const jsUri = webview.asWebviewUri(vscode.Uri.joinPath(mediaPath, 'webview.js'));

    // Random nonce so only our script can run in the webview (CSP requirement)
    const nonce = getNonce();

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
  <link rel="stylesheet" href="${cssUri}">
  <title>AI Task Manager</title>
</head>
<body>
  <div class="panel-container">
    <div class="title-bar" id="titleBar">
      <span class="title-text">AI Task Manager</span>
      <div class="title-actions">
        <button class="icon-btn" id="settingsBtn" title="Settings">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="3"></circle>
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
          </svg>
        </button>
        <button class="icon-btn" id="closeBtn" title="Close">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
      </div>
    </div>
    <div class="panel-content" id="panelContent">
      <div class="table-header">
        <div class="col-status">Status</div>
        <div class="col-task">Task</div>
        <div class="col-project">Project</div>
        <div class="col-document">Document</div>
        <div class="col-progress"></div>
        <div class="col-expand"></div>
      </div>
      <div class="table-body" id="tableBody">
        <div class="empty-state">No projects found. Configure the tasks folder in settings.</div>
      </div>
    </div>
  </div>
  <script nonce="${nonce}" src="${jsUri}"></script>
</body>
</html>`;
  }
}

function getNonce(): string {
  let text = '';
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < 32; i++) {
    text += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return text;
}
