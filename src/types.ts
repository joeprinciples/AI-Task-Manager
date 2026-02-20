export interface Task {
  id: string;
  title: string;
  status: 'doing' | 'todo' | 'done';
  priority?: 'high' | 'medium' | 'low';
  type?: 'bug' | 'feature' | 'task';
  description?: string;
  createdAt: string;
  updatedAt: string;
  grepKeywords?: string[];
  relatedDocuments?: string[];
}

export interface ProjectData {
  projectName: string;
  projectPath?: string;
  tasks: Task[];
}

export interface ProjectFile {
  filePath: string;
  fileName: string;
  data: ProjectData;
  context: string;
  parseError?: string;
}
