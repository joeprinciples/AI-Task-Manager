# Changelog

## 1.3.2

- **Fix:** `scaffoldProjectFile` now uses `JSON.stringify` instead of template interpolation (prevents broken JSON from folder names with special characters)
- **Fix:** `formatTimestamp` guards against invalid or missing dates (shows `—` instead of `NaN`)
- **Fix:** `fixTimestamps` now detects changes to `description`, `grepKeywords`, and `relatedDocuments`

## 1.3.1

- Detect moved project folders and offer to update `projectPath`

## 1.3.0

- Seed scaffolded task files with hidden `_template` task
- Stop overriding built-in task tools in CLAUDE.md injection

## 1.2.0

- Task types (`bug`, `feature`, `task`) with colour-coded badges
- JSON auto-repair via `jsonrepair` for malformed frontmatter
- `description` field on tasks
- `task-helper.js` deployed to tasks folder for CLI usage
- Auto-trim oldest done tasks when count exceeds threshold
- Include task type in timestamp fix detection

## 1.1.0

- Redesigned panel UI with title bar, summary bar, and clear done button
- Init project command for creating task files from the command palette
- CLAUDE.md auto-injection with sequenced onboarding prompts

## 1.0.3

- "Using with AI" section in README
- Open VSX support and release script

## 1.0.1

- Hosted images in README, dropped screenshots from package

## 1.0.0

- Initial release
- File-based task tracking at `~/.ai-tasks/`
- Sidebar panel with collapsible project cards and task tables
- Right-click context menus for status, priority, and deletion
- Inline task creation
- Status bar showing active "doing" task for current workspace
- File watcher for live updates
