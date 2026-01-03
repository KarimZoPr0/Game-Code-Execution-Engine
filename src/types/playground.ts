export interface ProjectFile {
  id: string;
  name: string;
  content: string;
  language: string;
  isFolder: boolean;
  children?: ProjectFile[];
  parentId?: string;
}

export interface Project {
  id: string;
  name: string;
  files: ProjectFile[];
  createdAt: Date;
  updatedAt: Date;
}

export interface OpenTab {
  id: string;
  fileId: string;
  fileName: string;
  content: string;
  language: string;
  isDirty: boolean;
}

export interface ConsoleMessage {
  id: string;
  type: 'info' | 'error' | 'warning' | 'success';
  message: string;
  timestamp: Date;
}

export interface Collaborator {
  id: string;
  name: string;
  color: string;
  cursor?: { x: number; y: number };
  activeFile?: string;
}

export type PanelType = 'editor' | 'preview' | 'console' | 'filetree' | 'tldraw';

export type BuildPhase = 'idle' | 'queued' | 'compiling' | 'linking' | 'success' | 'error';

export interface BuildLogEntry {
  id: string;
  type: 'stdout' | 'stderr' | 'status';
  message: string;
  timestamp: Date;
}
