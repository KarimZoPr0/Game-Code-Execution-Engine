import { ProjectFile } from '@/types/playground';

export class ProjectImportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ProjectImportError';
  }
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

// Get language from file extension
function getLanguageFromExtension(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase() || '';
  switch (ext) {
    case 'c':
    case 'h':
      return 'c';
    case 'cpp':
    case 'cc':
    case 'hpp':
      return 'cpp';
    case 'js':
      return 'javascript';
    case 'ts':
      return 'typescript';
    case 'json':
      return 'json';
    case 'md':
      return 'markdown';
    case 'txt':
      return 'plaintext';
    default:
      return 'plaintext';
  }
}

// Parse files from FileList (webkitdirectory or multiple files)
export async function parseLocalFiles(files: FileList): Promise<{ name: string; files: ProjectFile[] }> {
  if (files.length === 0) {
    throw new ProjectImportError('No files selected.');
  }

  const generateId = () => `file-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  
  // Build file tree from paths
  const fileTree: Map<string, ProjectFile> = new Map();
  const rootFiles: ProjectFile[] = [];
  
  // Determine project name from common root folder
  let projectName = 'Imported Project';
  const firstPath = files[0].webkitRelativePath || files[0].name;
  if (firstPath.includes('/')) {
    projectName = firstPath.split('/')[0];
  }

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const relativePath = file.webkitRelativePath || file.name;
    const pathParts = relativePath.split('/');
    
    // Skip the root folder name if using webkitdirectory
    const startIndex = file.webkitRelativePath ? 1 : 0;
    
    // Read file content
    let content = '';
    try {
      content = await file.text();
    } catch (e) {
      console.warn(`Could not read file ${file.name}:`, e);
      continue;
    }

    // Build folder structure
    let currentLevel = rootFiles;
    let currentPath = '';
    
    for (let j = startIndex; j < pathParts.length - 1; j++) {
      const folderName = pathParts[j];
      currentPath = currentPath ? `${currentPath}/${folderName}` : folderName;
      
      let folder = fileTree.get(currentPath);
      if (!folder) {
        folder = {
          id: generateId(),
          name: folderName,
          content: '',
          language: '',
          isFolder: true,
          children: [],
        };
        fileTree.set(currentPath, folder);
        currentLevel.push(folder);
      }
      currentLevel = folder.children!;
    }

    // Add the file
    const fileName = pathParts[pathParts.length - 1];
    const projectFile: ProjectFile = {
      id: generateId(),
      name: fileName,
      content,
      language: getLanguageFromExtension(fileName),
      isFolder: false,
    };
    currentLevel.push(projectFile);
  }

  return { name: projectName, files: rootFiles };
}
