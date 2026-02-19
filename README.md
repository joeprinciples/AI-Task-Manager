# AI Task Manager

[![Buy Me A Coffee](https://img.shields.io/badge/Buy%20Me%20A%20Coffee-joecoulam-FFDD00?style=for-the-badge&logo=buy-me-a-coffee&logoColor=black)](https://buymeacoffee.com/joecoulam)

Persistent task tracking for AI coding sessions. Your AI picks up where it left off — tasks, context, and progress survive between sessions.

Works with Claude Code, Cursor, Copilot, Windsurf, and any AI that can read/write files.

<p>
<img src="https://raw.githubusercontent.com/joeprinciples/AI-Task-Manager/main/screenshots/1.png" alt="Task panel" width="650" /><br>
<sub>All projects at a glance. Expand for full task lists with statuses, priorities, and timestamps.</sub>
</p>

<p>
<img src="https://raw.githubusercontent.com/joeprinciples/AI-Task-Manager/main/screenshots/2.png" alt="Expanded task list" width="650" /><br>
<sub>Right-click to change status, priority, or remove. Add tasks with the + button.</sub>
</p>

<p>
<img src="https://raw.githubusercontent.com/joeprinciples/AI-Task-Manager/main/screenshots/3.png" alt="Right-click context menu" width="650" /><br>
<sub>Right-click any task to change its status, update its priority, or remove it.</sub>
</p>

<p>
<img src="https://raw.githubusercontent.com/joeprinciples/AI-Task-Manager/main/screenshots/4.png" alt="Markdown file format" width="650" /><br>
<sub>All task data lives in a single Markdown file per project — easy to read, edit, and version control.</sub>
</p>

## How it works

1. **Install** — auto-configures your AI assistant on first launch
2. **Open a project** — prompted to create a task file if none exists
3. **Work** — AI tracks tasks and writes session context to disk
4. **Next session** — AI reads the file and continues where it left off

Tasks live in `~/.ai-tasks/` as plain Markdown with JSON frontmatter — git-trackable, human-editable.

## Why not built-in task tools?

They're session-scoped. Close the terminal, everything's gone. This persists to disk.

## Features

- **Persistent** — tasks and project context survive across sessions
- **AI-agnostic** — any tool that reads files works, no vendor lock-in
- **Auto-setup** — configures your AI assistant on first launch
- **Live updates** — file watcher picks up changes instantly
- **Status bar** — shows current active task
- **Git-friendly** — plain Markdown files

## Settings

| Setting | Default | Description |
|---------|---------|-------------|
| `aiTaskManager.tasksFolder` | `~/.ai-tasks` | Folder containing task files |
| `aiTaskManager.autoCheckTasks` | `true` | AI auto-reads tasks at session start |

## Commands

- **Toggle AI Task Manager** — open/close the panel
- **AI Task Manager: Init Project** — create a task file for the current workspace

## Requirements

VS Code 1.85+ (or compatible: Cursor, Windsurf, VSCodium)

## Bugs & Feedback

[Open an issue on GitHub](https://github.com/joeprinciples/AI-Task-Manager/issues)

## License

MIT with [Commons Clause](https://commonsclause.com/)
