import { Project, ProjectFile } from '@/types/playground';
import { getExcalidrawDrawing } from './indexedDB';

export interface ExportedProject {
  version: 1;
  exportedAt: string;
  project: {
    name: string;
    files: ProjectFile[];
  };
  excalidrawData?: unknown;
}

export function createExportData(project: Project, excalidrawData?: unknown): ExportedProject {
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    project: {
      name: project.name,
      files: project.files,
    },
    excalidrawData,
  };
}

export function exportProjectToBlob(project: Project, excalidrawData?: unknown): Blob {
  const data = createExportData(project, excalidrawData);
  const json = JSON.stringify(data, null, 2);
  return new Blob([json], { type: 'application/json' });
}

export async function downloadProject(project: Project): Promise<void> {
  // Fetch Excalidraw data if available
  let excalidrawData: unknown;
  try {
    excalidrawData = await getExcalidrawDrawing(project.id);
  } catch (e) {
    console.warn('Could not fetch Excalidraw data:', e);
  }

  const blob = exportProjectToBlob(project, excalidrawData);
  const url = URL.createObjectURL(blob);
  
  const a = document.createElement('a');
  a.href = url;
  a.download = `${project.name.replace(/[^a-z0-9]/gi, '_')}.codeforge`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
