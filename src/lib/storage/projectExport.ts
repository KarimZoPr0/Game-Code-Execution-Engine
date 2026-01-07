import { Project, ProjectFile } from '@/types/playground';
import JSZip from 'jszip';

// Add files to ZIP recursively
function addFilesToZip(zip: JSZip, files: ProjectFile[], parentPath = ''): void {
  for (const file of files) {
    const filePath = parentPath ? `${parentPath}/${file.name}` : file.name;
    
    if (file.isFolder) {
      const folder = zip.folder(filePath);
      if (folder && file.children) {
        addFilesToZip(zip, file.children, filePath);
      }
    } else {
      zip.file(filePath, file.content || '');
    }
  }
}

export async function downloadProjectAsZip(project: Project): Promise<void> {
  const zip = new JSZip();
  
  // Create project folder
  const projectFolder = zip.folder(project.name.replace(/[^a-z0-9]/gi, '_'));
  if (!projectFolder) {
    throw new Error('Failed to create project folder in ZIP');
  }
  
  // Add all files
  addFilesToZip(projectFolder, project.files);
  
  // Generate ZIP
  const blob = await zip.generateAsync({ type: 'blob' });
  const url = URL.createObjectURL(blob);
  
  const a = document.createElement('a');
  a.href = url;
  a.download = `${project.name.replace(/[^a-z0-9]/gi, '_')}.zip`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
