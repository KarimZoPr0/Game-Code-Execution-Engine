import { useEffect, useRef, useCallback } from 'react';
import { usePlaygroundStore, defaultProjects } from '@/store/playgroundStore';
import {
  getAllProjects,
  saveAllProjects,
} from '@/lib/storage/indexedDB';
import {
  getStoredTabs,
  getActiveTabId,
  getCurrentProjectId,
  saveCurrentProjectId,
  getLastBuild,
  saveLastBuild,
} from '@/lib/storage/localStorage';
import { Project, OpenTab } from '@/types/playground';

// Helper to find file in tree
const findFileInTree = (files: Project['files'], fileId: string): Project['files'][0] | undefined => {
  for (const f of files) {
    if (f.id === fileId) return f;
    if (f.children) {
      const found = findFileInTree(f.children, fileId);
      if (found) return found;
    }
  }
  return undefined;
};

export function useLocalPersistence() {
  const initialized = useRef(false);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const {
    projects,
    currentProject,
    lastBuildId,
    lastPreviewUrl,
  } = usePlaygroundStore();

  // Load persisted state on mount
  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;

    const loadPersistedState = async () => {
      try {
        // Check if templates are already loaded (to avoid overwriting them)
        const currentState = usePlaygroundStore.getState();
        const templatesAlreadyLoaded = currentState.templatesLoaded;

        // Load projects from IndexedDB
        let loadedProjects = await getAllProjects();

        // If templates are already loaded, merge them with persisted projects
        let finalProjects = loadedProjects;
        if (templatesAlreadyLoaded && currentState.projects.length > 0) {
          // Templates are loaded - keep them and merge with any user-created projects
          // Filter out template projects from persisted data to avoid duplicates
          const templateIds = new Set(currentState.projects.map(p => p.id));
          const userProjects = loadedProjects.filter(p => !templateIds.has(p.id));
          finalProjects = [...currentState.projects, ...userProjects];
        } else if (loadedProjects.length === 0) {
          // No persisted projects - use default projects as fallback
          finalProjects = defaultProjects.map(p => ({
            ...p,
            createdAt: new Date(),
            updatedAt: new Date(),
          }));
          await saveAllProjects(finalProjects);
        }

        // Get saved current project ID
        const savedProjectId = getCurrentProjectId();
        const currentProj = finalProjects.find((p) => p.id === savedProjectId) || finalProjects[0];

        // Load saved tabs for THIS project (per-project tabs)
        const savedTabs = getStoredTabs(currentProj.id);
        const restoredTabs: OpenTab[] = [];

        for (const tab of savedTabs) {
          const file = findFileInTree(currentProj.files, tab.fileId);
          if (file && !file.isFolder) {
            restoredTabs.push({
              id: tab.id,
              fileId: tab.fileId,
              fileName: file.name,
              content: file.content,
              language: file.language,
              isDirty: false,
            });
          }
        }

        // Restore active tab for THIS project
        const savedActiveTabId = getActiveTabId(currentProj.id);
        const activeTab = restoredTabs.find((t) => t.id === savedActiveTabId);

        // Load last build info
        const lastBuild = getLastBuild();
        const buildState = lastBuild && lastBuild.projectId === currentProj.id
          ? { lastBuildId: lastBuild.buildId, lastPreviewUrl: lastBuild.previewUrl }
          : {};

        // Update store - preserve templatesLoaded flag
        usePlaygroundStore.setState({
          projects: finalProjects,
          currentProject: currentProj,
          openTabs: restoredTabs,
          activeTabId: activeTab?.id || (restoredTabs.length > 0 ? restoredTabs[0].id : null),
          templatesLoaded: templatesAlreadyLoaded || currentState.templatesLoaded,
          ...buildState,
        });
      } catch (error) {
        console.error('Error loading persisted state:', error);
      }
    };

    loadPersistedState();
  }, []);

  // Debounced save projects
  const saveProjectsDebounced = useCallback(() => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    saveTimeoutRef.current = setTimeout(async () => {
      try {
        // Only save user-created projects, not template projects
        // Template projects are those from src/templates (with known IDs)
        const knownTemplateIds = new Set([
          'simple-sdl-demo',
          'live-coding-demo',
          'multiplayer-pong'
        ]);

        const userProjects = projects.filter(p => !knownTemplateIds.has(p.id));
        await saveAllProjects(userProjects);
      } catch (error) {
        console.error('Error saving projects:', error);
      }
    }, 500);
  }, [projects]);

  // Save projects when they change
  useEffect(() => {
    if (!initialized.current) return;
    saveProjectsDebounced();
  }, [projects, saveProjectsDebounced]);

  // Save current project ID
  useEffect(() => {
    if (!initialized.current || !currentProject) return;
    saveCurrentProjectId(currentProject.id);
  }, [currentProject?.id]);

  // Save last build info
  useEffect(() => {
    if (!initialized.current || !lastBuildId || !lastPreviewUrl || !currentProject) return;
    saveLastBuild({
      buildId: lastBuildId,
      previewUrl: lastPreviewUrl,
      projectId: currentProject.id,
      timestamp: Date.now(),
    });
  }, [lastBuildId, lastPreviewUrl, currentProject?.id]);

  return null;
}
