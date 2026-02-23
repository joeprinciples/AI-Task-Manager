---
{
  "module": "media",
  "category": "ui",
  "description": "Webview frontend — task table rendering, inline editing, and styling",
  "lastUpdated": "2026-02-23T23:40:00.000Z",
  "files": [
    {
      "path": "media/webview.js",
      "description": "Vanilla JS task panel — renders project cards with task tables, context menus, inline add"
    },
    {
      "path": "media/webview.css",
      "description": "Styling using VS Code CSS custom properties for theme integration"
    }
  ]
}
---

## Webview Frontend

Vanilla JS sidebar panel — no framework. Communicates with the extension host via `postMessage`.

### Architecture

- **webview.js** receives `update` messages containing project data. Renders collapsible project cards, each with a task table (status, title, project, file, progress). Tasks are colour-coded by status (doing = blue, todo = default, done = muted). Right-click context menus for status/priority/type changes and deletion. Inline task creation via text input. Summary bar shows total counts. Expand/collapse state preserved across updates. Invalid timestamps handled gracefully (shows dash instead of NaN).
- **webview.css** uses VS Code CSS custom properties (`--vscode-*`) for full theme integration. Table layout with fixed column widths. Priority and type badges with colour-coded backgrounds. Progress bar per project.

### Key patterns

- All user text escaped via `escapeHtml()` to prevent XSS
- Project expand state preserved across data updates via `expandedProjects` Set
- Context menus built dynamically per task state (different options for doing/todo/done)
- Empty state prompts user to configure the tasks folder in settings
