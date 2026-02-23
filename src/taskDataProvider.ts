import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { jsonrepair } from 'jsonrepair';
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
    let repaired = false;
    try {
      data = JSON.parse(jsonStr);
    } catch {
      // Attempt to repair broken JSON (missing commas, trailing commas, etc.)
      try {
        const fixed = jsonrepair(jsonStr);
        data = JSON.parse(fixed);
        repaired = true;
      } catch (repairErr: any) {
        return errorEntry(filePath, `Invalid JSON in frontmatter (repair failed): ${repairErr.message}`);
      }
    }

    if (!data.projectName || typeof data.projectName !== 'string') {
      return errorEntry(filePath, 'Missing or invalid "projectName" in frontmatter');
    }
    if (!Array.isArray(data.tasks)) {
      return errorEntry(filePath, 'Missing or invalid "tasks" array in frontmatter');
    }

    const result: ProjectFile = { filePath, fileName, data, context: markdownBody };

    // Write the repaired JSON back so the file stays clean
    if (repaired) {
      saveTaskFile(result);
    }

    return result;
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

export function setTaskType(filePath: string, taskId: string, newType: Task['type']): ProjectFile | null {
  const project = parseTaskFile(filePath);
  if (project.parseError) {
    return null;
  }
  const task = project.data.tasks.find(t => t.id === taskId);
  if (!task) {
    return null;
  }
  task.type = newType;
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

export function clearDoneTasks(filePath: string): ProjectFile | null {
  const project = parseTaskFile(filePath);
  if (project.parseError) {
    return null;
  }
  const before = project.data.tasks.length;
  project.data.tasks = project.data.tasks.filter(t => t.status !== 'done');
  if (project.data.tasks.length === before) {
    return null; // nothing changed
  }
  saveTaskFile(project);
  return project;
}

export function getActiveTask(project: ProjectFile): Task | null {
  return project.data.tasks.find(t => t.status === 'doing' && !t.id.startsWith('_')) || null;
}

export function getTaskStats(project: ProjectFile): { done: number; total: number } {
  const visible = project.data.tasks.filter(t => !t.id.startsWith('_'));
  const total = visible.length;
  const done = visible.filter(t => t.status === 'done').length;
  return { done, total };
}

// Scaffolds a new task file for a workspace, auto-detecting project name
export async function scaffoldProjectFile(tasksFolder: string, workspacePath: string): Promise<string | null> {
  let projectName = path.basename(workspacePath);

  // Try to pull a nicer name from package.json
  const pkgPath = path.join(workspacePath, 'package.json');
  try {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
    if (pkg.name && typeof pkg.name === 'string') {
      // Convert slug to title case: "my-cool-project" → "My Cool Project"
      projectName = pkg.name
        .replace(/[-_]/g, ' ')
        .replace(/\b\w/g, (c: string) => c.toUpperCase());
    }
  } catch {
    // No package.json or invalid — use folder name
  }

  // Slugify for the filename: "My Cool Project" → "my-cool-project.md"
  const slug = projectName.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
  let fileName = `${slug}.md`;

  // Avoid collisions
  let counter = 1;
  while (fs.existsSync(path.join(tasksFolder, fileName))) {
    fileName = `${slug}-${counter}.md`;
    counter++;
  }

  const now = new Date().toISOString();
  const data = {
    projectName,
    projectPath: workspacePath.replace(/\\/g, '/'),
    tasks: [
      {
        id: '_template',
        title: 'Example: this task is hidden from the UI — use it as a reference for optional fields',
        status: 'todo',
        priority: 'medium',
        type: 'feature',
        description: 'A longer description of what needs to be done, with acceptance criteria or context',
        createdAt: now,
        updatedAt: now,
        grepKeywords: ['functionName', 'ClassName', 'configKey'],
        relatedDocuments: ['src/example/file.ts', 'src/utils/helper.ts'],
      },
    ],
  };
  const json = JSON.stringify(data, null, 2);
  const content = `---\n${json}\n---\n\n## Project Context\n\nAdd project context here: tech stack, architecture, key directories.\nThis is not displayed in the task panel — it exists as context for AI assistants.\n`;

  const filePath = path.join(tasksFolder, fileName);
  fs.writeFileSync(filePath, content, 'utf-8');
  return filePath;
}

// Updates the projectPath in an existing task file (e.g. after a folder move)
export function updateProjectPath(filePath: string, newPath: string): ProjectFile | null {
  const project = parseTaskFile(filePath);
  if (project.parseError) {
    return null;
  }
  project.data.projectPath = newPath.replace(/\\/g, '/');
  saveTaskFile(project);
  return project;
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
