# AI Task Manager

[![Buy Me A Coffee](https://img.shields.io/badge/Buy%20Me%20A%20Coffee-joecoulam-FFDD00?style=for-the-badge&logo=buy-me-a-coffee&logoColor=black)](https://buymeacoffee.com/joecoulam)

A lightweight task management panel for VS Code, Cursor, and other VS Code-based editors. Track tasks across multiple projects using simple Markdown files with JSON frontmatter.

Designed to work seamlessly with AI coding assistants — any tool that can read and write files can manage your tasks automatically.

<img src="screenshots/1.png" alt="Task panel in its own sidebar window" width="650" />
<br><sub>Tasks appear in a dedicated sidebar panel, giving you an overview of all your projects at a glance.</sub>

<img src="screenshots/2.png" alt="Expanded project task list" width="650" />
<br><sub>Select a project to expand its full task list — with statuses, priorities, and timestamps.</sub>

<img src="screenshots/3.png" alt="Right-click context menu" width="650" />
<br><sub>Right-click any task to change its status, update its priority, or remove it.</sub>

<img src="screenshots/4.png" alt="Markdown file format" width="650" />
<br><sub>All task data lives in a single Markdown file per project — easy to read, edit, and version control.</sub>

## Features

- **Multi-project task tracking** — One file per project, all stored in a single folder (`~/.ai-tasks/`)
- **Live updates** — File watcher picks up changes instantly, whether you edit manually or an AI does it
- **Right-click context menu** — Set status (To Do / Doing / Done), change priority (High / Medium / Low), or remove tasks
- **Add tasks from the UI** — Click the `+` button in any project's task list
- **Priority badges** — High and low priority tasks are visually tagged
- **Smart sorting** — Active tasks first, then to-do, then completed. Sorted by priority within each group
- **Status bar integration** — Shows your current active task in the bottom bar (matched by project path)
- **Hide completed tasks** — Toggle to collapse done tasks and keep focus on what matters
- **Error handling** — Malformed files show a clear error row instead of silently breaking
- **Auto-check setting** — Optional flag to prompt AI assistants to check tasks at session start

## File Format

Task files are Markdown with JSON frontmatter, stored in `~/.ai-tasks/` by default:

```markdown
---
{
  "projectName": "My Project",
  "projectPath": "/path/to/project",
  "tasks": [
    {
      "id": "t1",
      "title": "Implement user authentication",
      "status": "doing",
      "priority": "high",
      "createdAt": "2026-01-15T10:00:00Z",
      "updatedAt": "2026-01-15T14:30:00Z",
      "grepKeywords": ["authenticateUser", "session"],
      "relatedDocuments": ["src/auth/login.ts"]
    }
  ]
}
---

## Project Context

Any markdown content here serves as context for AI assistants.
Not displayed in the UI.
```

## Settings

| Setting | Default | Description |
|---------|---------|-------------|
| `aiTaskManager.tasksFolder` | `~/.ai-tasks` | Path to the folder containing task files |
| `aiTaskManager.autoCheckTasks` | `false` | When enabled, creates a flag file that AI assistants can check to auto-load tasks at session start |

## Usage

1. Open the command palette (`Ctrl+Shift+P`) and run **Toggle AI Task Manager**
2. Or click **AI Tasks** in the status bar
3. Create task files manually or let your AI assistant manage them
4. Right-click any task to change status, priority, or remove it
5. Click the `+` button to add tasks directly from the panel

## Requirements

- VS Code 1.85+ (or compatible editor: Cursor, Windsurf, VSCodium, etc.)

## Bugs & Feedback

Found a bug or have a suggestion? [Open an issue on GitHub](https://github.com/joeprinciples/AI-Task-Manager/issues).

## License

MIT with [Commons Clause](https://commonsclause.com/) — free to use, modify, and share with attribution, but not to resell as a product.
