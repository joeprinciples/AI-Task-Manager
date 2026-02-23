# AI Task Manager

A VS Code extension for persistent, file-based task tracking across AI coding sessions — tasks live in `~/.ai-tasks/` as markdown files with JSON frontmatter, readable and writable by any AI assistant.

## Tech Stack
- TypeScript (VS Code Extension API)
- Vanilla JS webview (no framework)
- esbuild bundler
- jsonrepair for tolerant JSON parsing

## Modules
- `.context/core/src.md` — Extension core: activation, task data layer, webview host, shared types
- `.context/ui/media.md` — Webview frontend: task table rendering, inline editing, styling

## Key Decisions
- Global `~/.ai-tasks/` folder (not per-project) — one file per project, matched by `projectPath`
- Tasks with `_`-prefixed IDs are hidden system templates, never shown in UI
- Markdown body below frontmatter is AI-only context (stripped before sending to webview)
