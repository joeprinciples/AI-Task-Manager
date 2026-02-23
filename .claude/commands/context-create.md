First, read .context/_config.json. If "needsAiSetup" is true:
1. Check the project type (look at file extensions present, package.json, project files, etc.)
2. Update _config.json: set sourceExtensions, categoryMap, categories, and scanRoots to match this project
3. Set "needsAiSetup" to false
4. Tell the user to re-run "Initialize .context/" (Ctrl+Shift+P → "AI Context Manager: Initialize .context/") to re-scan with the updated config, then run this command again

If "needsAiSetup" is false, proceed:

Read the .context/_overview.md and all module files in .context/ to understand the current state.

For every module that still has [AI: ...] placeholder text:
1. Read the source files listed in that module's frontmatter "files" array
2. Replace the [AI: ...] placeholders with concise, real documentation:
   - Description: one sentence explaining what this module does
   - Body: what it does, key patterns, important decisions (a few lines each, not essays)
   - File descriptions: update generic ones like "button (tsx)" with what the file actually does
3. Set "lastUpdated" to the current ISO timestamp

Then update .context/_overview.md:
- Replace any [AI: ...] placeholders with real content
- Keep it SHORT — it's an index, not documentation
- Tech stack: one bullet per tool/framework
- Key decisions: 2-3 bullets max

Do NOT over-document. A few clear lines per section is better than paragraphs.