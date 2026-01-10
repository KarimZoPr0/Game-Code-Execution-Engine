import { useEffect, useRef, useCallback, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { usePlaygroundStore } from '@/store/playgroundStore';
import {
  fetchCloudProjects,
  syncProjectToCloud,
  mergeProjects,
} from '@/lib/storage/cloudSync';
import { saveAllProjects } from '@/lib/storage/indexedDB';

export type SyncStatus = 'idle' | 'syncing' | 'synced' | 'error';

export function useCloudSync() {
  const { user } = useAuth();
  const { projects, currentProject } = usePlaygroundStore();
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('idle');
  const syncTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSyncedRef = useRef<string>('');

  // Sync current project to cloud (debounced)
  const syncCurrentProject = useCallback(async () => {
    if (!user || !currentProject) return;

    const projectKey = `${currentProject.id}-${currentProject.updatedAt.getTime()}`;
    if (projectKey === lastSyncedRef.current) return;

    setSyncStatus('syncing');
    try {
      await syncProjectToCloud(user.id, currentProject);
      lastSyncedRef.current = projectKey;
      setSyncStatus('synced');
    } catch (error) {
      console.error('Sync error:', error);
      setSyncStatus('error');
    }
  }, [user, currentProject]);

  // Debounced sync on project change
  useEffect(() => {
    if (!user || !currentProject) return;

    if (syncTimeoutRef.current) {
      clearTimeout(syncTimeoutRef.current);
    }

    syncTimeoutRef.current = setTimeout(() => {
      syncCurrentProject();
    }, 2000); // 2 second debounce

    return () => {
      if (syncTimeoutRef.current) {
        clearTimeout(syncTimeoutRef.current);
      }
    };
  }, [user, currentProject, syncCurrentProject]);

  // Initial sync on login
  useEffect(() => {
    if (!user) {
      setSyncStatus('idle');
      return;
    }

    const initialSync = async () => {
      setSyncStatus('syncing');
      try {
        const cloudProjects = await fetchCloudProjects(user.id);
        const localProjects = usePlaygroundStore.getState().projects;
        const merged = mergeProjects(localProjects, cloudProjects);
        
        // Save merged projects to local storage
        await saveAllProjects(merged);
        
        // Update store with merged projects
        usePlaygroundStore.setState({ projects: merged });
        
        // If current project was updated from cloud, refresh it
        const currentId = usePlaygroundStore.getState().currentProject?.id;
        if (currentId) {
          const updatedCurrent = merged.find((p) => p.id === currentId);
          if (updatedCurrent) {
            usePlaygroundStore.setState({ currentProject: updatedCurrent });
          }
        }

        setSyncStatus('synced');
      } catch (error) {
        console.error('Initial sync error:', error);
        setSyncStatus('error');
      }
    };

    initialSync();
  }, [user]);

  return { syncStatus, syncNow: syncCurrentProject };
}
