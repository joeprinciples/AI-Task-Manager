---
{
  "module": "src",
  "category": "core",
  "description": "Extension core — activation, task data layer, webview host, and shared types",
  "lastUpdated": "2026-02-23T23:40:00.000Z",
  "files": [
    {
      "path": "src/extension.ts",
      "description": "Activation entry point, commands, file watcher, status bar, CLAUDE.md injection, auto-trim, timestamp fixer"
    },
    {
      "path": "src/taskDataProvider.ts",
      "description": "Data layer — parsing task files (JSON frontmatter + markdown), CRUD operations, file scaffolding"
    },
    {
      "path": "src/types.ts",
      "description": "Shared TypeScript interfaces (Task, ProjectData, ProjectFile)"
    },
    {
      "path": "src/webviewPanel.ts",
      "description": "Webview panel management, message handling for task operations, CSP setup"
    }
  ]
}
---

## Core Source

The extension backend — everything that runs in the VS Code extension host process.

### Architecture

- **extension.ts** is the activation hub. Registers two commands (toggle, initProject), sets up a debounced file watcher on `~/.ai-tasks/**/*.md`, manages the status bar (shows active "doing" task for current workspace). Key features: CLAUDE.md auto-injection with marker-based idempotent insertion, `fixTimestamps()` that stamps real ISO times when AI writes guessed timestamps, `autoTrimDoneTasks()` that prunes oldest done tasks when exceeding a threshold. Both mutate in place and a single `saveIfDirty()` does one write. Seeds an example file on first run. Deploys `task-helper.js` to the tasks folder and syncs an `.auto-check` flag file.
- **taskDataProvider.ts** is the data layer. Parses task files (JSON frontmatter + markdown body) with `jsonrepair` fallback. CRUD: `addTask`, `deleteTask`, `setTaskStatus`, `setTaskPriority`, `setTaskType`, `clearDoneTasks`. `scaffoldProjectFile()` auto-detects project name from package.json, uses `JSON.stringify` for safe serialisation. `updateProjectPath()` handles moved project folders. `getActiveTask()` finds the current "doing" task, filtering out `_`-prefixed template IDs.
- **webviewPanel.ts** hosts the sidebar panel. Handles all task operations via `postMessage` (status changes, priority, type, add, delete, clear done). Confirms before deleting in-progress or todo tasks. CSP with nonce-based script loading.
- **types.ts** defines `Task` (id, title, status, priority, type, description, timestamps, grepKeywords, relatedDocuments), `ProjectData` (projectName, projectPath, tasks), and `ProjectFile` (parsed representation with filePath, context markdown, parseError).

### Key patterns

- Task files live in a global folder (`~/.ai-tasks/`), not per-project — one file per project, matched by `projectPath`
- Tasks with `_`-prefixed IDs are hidden system templates (e.g. `_template`)
- `fixTimestamps()` detects AI-written stale timestamps by comparing against cached state and stamps real times
- `saveIfDirty()` consolidates writes — both `fixTimestamps` and `autoTrimDoneTasks` mutate then a single save
- Moved-project detection: `findMovedProjectFile()` matches by folder name when old path no longer exists on disk
- Markdown body below `---` is stripped before sending to webview (`stripContextForWebview`) — it's AI-only context
