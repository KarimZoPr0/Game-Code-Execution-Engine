import { ProjectFile } from '@/types/playground';
import { ExportedProject } from './projectExport';

export class ProjectImportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ProjectImportError';
  }
}

export function validateExportedProject(data: unknown): data is ExportedProject {
  if (!data || typeof data !== 'object') return false;
  
  const obj = data as Record<string, unknown>;
  
  if (obj.version !== 1) return false;
  if (typeof obj.exportedAt !== 'string') return false;
  if (!obj.project || typeof obj.project !== 'object') return false;
  
  const project = obj.project as Record<string, unknown>;
  if (typeof project.name !== 'string') return false;
  if (!Array.isArray(project.files)) return false;
  
  return true;
}

export async function parseProjectFile(file: File): Promise<ExportedProject> {
  if (!file.name.endsWith('.codeforge') && !file.name.endsWith('.json')) {
    throw new ProjectImportError('Invalid file type. Please select a .codeforge or .json file.');
  }

  const text = await file.text();
  
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new ProjectImportError('Invalid JSON format. The file appears to be corrupted.');
  }
  
  if (!validateExportedProject(data)) {
    throw new ProjectImportError('Invalid project format. The file does not contain a valid CodeForge project.');
  }
  
  return data;
}

// Generate new unique IDs for all files to avoid conflicts
export function regenerateFileIds(files: ProjectFile[]): ProjectFile[] {
  const generateId = () => `file-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  
  const processFile = (file: ProjectFile): ProjectFile => ({
    ...file,
    id: generateId(),
    children: file.children ? file.children.map(processFile) : undefined,
  });
  
  return files.map(processFile);
}
