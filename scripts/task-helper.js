#!/usr/bin/env node
// task-helper.js - utility for AI agents managing ~/.ai-tasks/ files
// Bundled with the AI Task Manager VS Code extension.
//
// Usage:
//   node task-helper.js timestamp           - print current UTC ISO-8601
//   node task-helper.js archive <file>      - move done tasks to markdown body
//   node task-helper.js summary <file>      - print only todo/doing tasks as JSON

const fs = require("fs");
const path = require("path");

const cmd = process.argv[2] || "";
const file = process.argv[3] || "";

// -- timestamp ---------------------------------------------------------------
if (cmd === "timestamp") {
  console.log(new Date().toISOString());
  process.exit(0);
}

// -- Shared: require a file argument ----------------------------------------
if (!file) {
  console.error(
    "Usage: node task-helper.js {timestamp|archive|summary} [file]"
  );
  process.exit(1);
}

const resolved = path.resolve(file);
if (!fs.existsSync(resolved)) {
  console.error("Error: file not found: " + resolved);
  process.exit(1);
}

function parseFrontmatter(filePath) {
  const content = fs.readFileSync(filePath, "utf-8");
  const m = content.match(/^---\s*\r?\n([\s\S]*?)\r?\n---\s*\r?\n?([\s\S]*)$/);
  if (!m) {
    console.error("No frontmatter found");
    process.exit(1);
  }
  return { data: JSON.parse(m[1]), markdown: m[2] };
}

// -- archive -----------------------------------------------------------------
if (cmd === "archive") {
  const { data, markdown } = parseFrontmatter(resolved);
  const done = data.tasks.filter((t) => t.status === "done");

  if (done.length === 0) {
    console.log("No done tasks to archive.");
    process.exit(0);
  }

  data.tasks = data.tasks.filter((t) => t.status !== "done");

  const lines = done
    .map((t) => "- [x] " + t.title + " (" + (t.updatedAt || "unknown") + ")")
    .join("\n");

  let body;
  if (markdown.includes("## Archived Tasks")) {
    body = markdown.replace(/(## Archived Tasks)/, "$1\n" + lines);
  } else {
    body = markdown.trimEnd() + "\n\n## Archived Tasks\n" + lines;
  }

  const out =
    "---\n" + JSON.stringify(data, null, 2) + "\n---\n\n" + body + "\n";
  fs.writeFileSync(resolved, out, "utf-8");
  console.log("Archived " + done.length + " done task(s).");
  process.exit(0);
}

// -- summary -----------------------------------------------------------------
if (cmd === "summary") {
  const { data } = parseFrontmatter(resolved);
  data.tasks = data.tasks.filter((t) => t.status !== "done");
  console.log(JSON.stringify(data, null, 2));
  process.exit(0);
}

console.error("Unknown command: " + cmd);
console.error("Usage: node task-helper.js {timestamp|archive|summary} [file]");
process.exit(1);
