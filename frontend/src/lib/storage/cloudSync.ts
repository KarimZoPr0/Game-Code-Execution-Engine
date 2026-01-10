import { supabase } from '@/integrations/supabase/client';
import { Project, ProjectFile } from '@/types/playground';
import { Json } from '@/integrations/supabase/types';

// ============ Projects Sync ============

export async function fetchCloudProjects(userId: string): Promise<Project[]> {
  const { data, error } = await supabase
    .from('projects')
    .select('*')
    .eq('user_id', userId);

  if (error) {
    console.error('Error fetching cloud projects:', error);
    return [];
  }

  return data.map((p) => ({
    id: p.local_id,
    name: p.name,
    files: p.files as unknown as ProjectFile[],
    createdAt: new Date(p.created_at),
    updatedAt: new Date(p.updated_at),
  }));
}

export async function syncProjectToCloud(userId: string, project: Project): Promise<void> {
  const { error } = await supabase
    .from('projects')
    .upsert(
      {
        user_id: userId,
        local_id: project.id,
        name: project.name,
        files: project.files as unknown as Json,
        updated_at: project.updatedAt.toISOString(),
      },
      {
        onConflict: 'user_id,local_id',
      }
    );

  if (error) {
    console.error('Error syncing project to cloud:', error);
    throw error;
  }
}

export async function deleteCloudProject(userId: string, localId: string): Promise<void> {
  const { error } = await supabase
    .from('projects')
    .delete()
    .eq('user_id', userId)
    .eq('local_id', localId);

  if (error) {
    console.error('Error deleting cloud project:', error);
    throw error;
  }
}

// ============ Excalidraw Sync ============

export async function fetchCloudExcalidrawDrawing(userId: string, projectId: string): Promise<unknown | null> {
  const { data, error } = await supabase
    .from('excalidraw_drawings')
    .select('data')
    .eq('user_id', userId)
    .eq('project_id', projectId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null; // No rows found
    console.error('Error fetching cloud drawing:', error);
    return null;
  }

  return data.data;
}

export async function syncExcalidrawToCloud(userId: string, projectId: string, data: unknown): Promise<void> {
  const { error } = await supabase
    .from('excalidraw_drawings')
    .upsert(
      {
        user_id: userId,
        project_id: projectId,
        data: data as Json,
      },
      {
        onConflict: 'user_id,project_id',
      }
    );

  if (error) {
    console.error('Error syncing drawing to cloud:', error);
    throw error;
  }
}

export async function fetchAllCloudExcalidrawDrawings(userId: string): Promise<Map<string, unknown>> {
  const { data, error } = await supabase
    .from('excalidraw_drawings')
    .select('project_id, data')
    .eq('user_id', userId);

  if (error) {
    console.error('Error fetching cloud drawings:', error);
    return new Map();
  }

  return new Map(data.map((d) => [d.project_id, d.data]));
}

// ============ Merge Logic ============

export function mergeProjects(local: Project[], cloud: Project[]): Project[] {
  const merged = new Map<string, Project>();

  // Add all local projects
  for (const project of local) {
    merged.set(project.id, project);
  }

  // Merge cloud projects (newer wins)
  for (const cloudProject of cloud) {
    const localProject = merged.get(cloudProject.id);
    
    if (!localProject) {
      // Cloud-only project, add it
      merged.set(cloudProject.id, cloudProject);
    } else {
      // Both exist, keep newer
      if (cloudProject.updatedAt > localProject.updatedAt) {
        merged.set(cloudProject.id, cloudProject);
      }
    }
  }

  return Array.from(merged.values());
}
