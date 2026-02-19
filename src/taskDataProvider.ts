import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { ProjectFile, ProjectData, Task } from './types';

const MAX_FILE_SIZE = 1024 * 1024; // 1 MB

// Builds a placeholder entry for files that couldn't be parsed
function errorEntry(filePath: string, reason: string): ProjectFile {
  return {
    filePath,
    fileName: path.basename(filePath),
    data: { projectName: path.basename(filePath), tasks: [] },
    context: '',
    parseError: reason,
  };
}

// Reads a .md file and pulls out the JSON frontmatter + markdown body
export function parseTaskFile(filePath: string): ProjectFile {
  try {
    const stat = fs.statSync(filePath);
    if (stat.size > MAX_FILE_SIZE) {
      return errorEntry(filePath, `File too large (${(stat.size / 1024).toFixed(0)} KB — limit is 1 MB)`);
    }

    const content = fs.readFileSync(filePath, 'utf-8');
    const fileName = path.basename(filePath);

    // Grab everything between the --- markers as JSON, rest is markdown
    const frontmatterMatch = content.match(/^---\s*\r?\n([\s\S]*?)\r?\n---\s*\r?\n?([\s\S]*)$/);
    if (!frontmatterMatch) {
      return errorEntry(filePath, 'Missing or malformed --- frontmatter delimiters');
    }

    const jsonStr = frontmatterMatch[1].trim();
    const markdownBody = frontmatterMatch[2].trim();

    let data: ProjectData;
    try {
      data = JSON.parse(jsonStr);
    } catch (jsonErr: any) {
      return errorEntry(filePath, `Invalid JSON in frontmatter: ${jsonErr.message}`);
    }

    if (!data.projectName || typeof data.projectName !== 'string') {
      return errorEntry(filePath, 'Missing or invalid "projectName" in frontmatter');
    }
    if (!Array.isArray(data.tasks)) {
      return errorEntry(filePath, 'Missing or invalid "tasks" array in frontmatter');
    }

    return { filePath, fileName, data, context: markdownBody };
  } catch (err: any) {
    return errorEntry(filePath, `Cannot read file: ${err.message}`);
  }
}

// Loads every .md file in the folder and parses them
export function loadAllProjects(folder: string): ProjectFile[] {
  if (!fs.existsSync(folder)) {
    return [];
  }

  const files = fs.readdirSync(folder).filter(f => f.endsWith('.md') && !f.startsWith('_'));
  const projects: ProjectFile[] = [];

  for (const file of files) {
    const filePath = path.join(folder, file);
    projects.push(parseTaskFile(filePath));
  }

  return projects;
}

// Writes the project back to disk (JSON frontmatter + markdown body)
export function saveTaskFile(project: ProjectFile): void {
  const json = JSON.stringify(project.data, null, 2);
  const content = `---\n${json}\n---\n\n${project.context}\n`;
  fs.writeFileSync(project.filePath, content, 'utf-8');
}

// Removes a task from a project file and saves it back to disk
export function deleteTask(filePath: string, taskId: string): ProjectFile | null {
  const project = parseTaskFile(filePath);
  if (project.parseError) {
    return null;
  }
  project.data.tasks = project.data.tasks.filter(t => t.id !== taskId);
  saveTaskFile(project);
  return project;
}

export function addTask(filePath: string, title: string): ProjectFile | null {
  const project = parseTaskFile(filePath);
  if (project.parseError) {
    return null;
  }
  // Find next ID
  let maxNum = 0;
  for (const t of project.data.tasks) {
    const match = t.id.match(/^t(\d+)$/);
    if (match) { maxNum = Math.max(maxNum, parseInt(match[1], 10)); }
  }
  const now = new Date().toISOString();
  project.data.tasks.push({
    id: `t${maxNum + 1}`,
    title,
    status: 'todo',
    createdAt: now,
    updatedAt: now,
  });
  saveTaskFile(project);
  return project;
}

export function setTaskPriority(filePath: string, taskId: string, newPriority: Task['priority']): ProjectFile | null {
  const project = parseTaskFile(filePath);
  if (project.parseError) {
    return null;
  }
  const task = project.data.tasks.find(t => t.id === taskId);
  if (!task) {
    return null;
  }
  task.priority = newPriority;
  task.updatedAt = new Date().toISOString();
  saveTaskFile(project);
  return project;
}

export function setTaskStatus(filePath: string, taskId: string, newStatus: Task['status']): ProjectFile | null {
  const project = parseTaskFile(filePath);
  if (project.parseError) {
    return null;
  }
  const task = project.data.tasks.find(t => t.id === taskId);
  if (!task) {
    return null;
  }
  task.status = newStatus;
  task.updatedAt = new Date().toISOString();
  saveTaskFile(project);
  return project;
}

export function getActiveTask(project: ProjectFile): Task | null {
  return project.data.tasks.find(t => t.status === 'doing') || null;
}

export function getTaskStats(project: ProjectFile): { done: number; total: number } {
  const total = project.data.tasks.length;
  const done = project.data.tasks.filter(t => t.status === 'done').length;
  return { done, total };
}

// Watches the tasks folder for any .md file changes
export function watchFolder(
  folder: string,
  onChange: (uri: vscode.Uri) => void,
  onCreate: (uri: vscode.Uri) => void,
  onDelete: (uri: vscode.Uri) => void
): vscode.FileSystemWatcher {
  const pattern = new vscode.RelativePattern(vscode.Uri.file(folder), '**/*.md');
  const watcher = vscode.workspace.createFileSystemWatcher(pattern);

  watcher.onDidChange(onChange);
  watcher.onDidCreate(onCreate);
  watcher.onDidDelete(onDelete);

  return watcher;
}
