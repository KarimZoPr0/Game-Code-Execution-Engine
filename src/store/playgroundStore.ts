import { create } from 'zustand';
import { Project, ProjectFile, OpenTab, ConsoleMessage, Collaborator, BuildPhase, BuildLogEntry } from '@/types/playground';
import { submitBuild as apiSubmitBuild, subscribeToBuildEvents, getBuildResult, getPreviewUrl } from '@/lib/api';
import * as FlexLayout from 'flexlayout-react';

const defaultMainC = `#include <SDL2/SDL.h>
#include <emscripten.h>
#include <stdbool.h>

// Window dimensions
#define SCREEN_WIDTH 640
#define SCREEN_HEIGHT 480

// Game state
typedef struct {
    SDL_Window* window;
    SDL_Renderer* renderer;
    bool running;
    // Square position and velocity
    float x, y;
    float vx, vy;
    int size;
} GameState;

GameState game;

void init() {
    SDL_Init(SDL_INIT_VIDEO);
    
    game.window = SDL_CreateWindow(
        "Nexus Engine - SDL Demo",
        SDL_WINDOWPOS_CENTERED,
        SDL_WINDOWPOS_CENTERED,
        SCREEN_WIDTH,
        SCREEN_HEIGHT,
        0
    );
    
    game.renderer = SDL_CreateRenderer(game.window, -1, SDL_RENDERER_ACCELERATED);
    game.running = true;
    
    // Initialize square in center
    game.size = 50;
    game.x = (SCREEN_WIDTH - game.size) / 2.0f;
    game.y = (SCREEN_HEIGHT - game.size) / 2.0f;
    game.vx = 3.0f;
    game.vy = 2.0f;
}

void handle_events() {
    SDL_Event event;
    while (SDL_PollEvent(&event)) {
        switch (event.type) {
            case SDL_QUIT:
                game.running = false;
                break;
            case SDL_KEYDOWN:
                // Press R to reset position
                if (event.key.keysym.sym == SDLK_r) {
                    game.x = (SCREEN_WIDTH - game.size) / 2.0f;
                    game.y = (SCREEN_HEIGHT - game.size) / 2.0f;
                }
                break;
        }
    }
}

void update() {
    // Move the square
    game.x += game.vx;
    game.y += game.vy;
    
    // Bounce off walls
    if (game.x <= 0 || game.x + game.size >= SCREEN_WIDTH) {
        game.vx = -game.vx;
        game.x = game.x <= 0 ? 0 : SCREEN_WIDTH - game.size;
    }
    if (game.y <= 0 || game.y + game.size >= SCREEN_HEIGHT) {
        game.vy = -game.vy;
        game.y = game.y <= 0 ? 0 : SCREEN_HEIGHT - game.size;
    }
}

void render() {
    // Clear with dark blue background
    SDL_SetRenderDrawColor(game.renderer, 30, 41, 59, 255);
    SDL_RenderClear(game.renderer);
    
    // Draw the bouncing square (indigo color)
    SDL_SetRenderDrawColor(game.renderer, 99, 102, 241, 255);
    SDL_Rect rect = {
        (int)game.x,
        (int)game.y,
        game.size,
        game.size
    };
    SDL_RenderFillRect(game.renderer, &rect);
    
    // Present
    SDL_RenderPresent(game.renderer);
}

void main_loop() {
    handle_events();
    update();
    render();
}

int main(int argc, char* argv[]) {
    init();
    
    // Use emscripten's main loop for web builds
    emscripten_set_main_loop(main_loop, 60, 1);
    
    // Cleanup (won't reach here in web build)
    SDL_DestroyRenderer(game.renderer);
    SDL_DestroyWindow(game.window);
    SDL_Quit();
    
    return 0;
}`;

const defaultProject: Project = {
  id: 'default-project',
  name: 'My SDL Game',
  files: [
    { id: 'main-c', name: 'main.c', content: defaultMainC, language: 'c', isFolder: false },
  ],
  createdAt: new Date(),
  updatedAt: new Date(),
};

interface PlaygroundState {
  projects: Project[];
  currentProject: Project | null;
  openTabs: OpenTab[];
  activeTabId: string | null;
  consoleMessages: ConsoleMessage[];
  collaborators: Collaborator[];
  isBuilding: boolean;
  
  // Build state
  lastBuildId: string | null;
  lastPreviewUrl: string | null;
  buildPhase: BuildPhase;
  buildLogs: BuildLogEntry[];
  buildError: string | null;
  pendingHotReload: boolean;
  
  // Layout model reference
  layoutModel: FlexLayout.Model | null;
  
  // Actions
  setCurrentProject: (project: Project) => void;
  createProject: (name: string) => void;
  openFile: (file: ProjectFile) => void;
  closeTab: (tabId: string) => void;
  setActiveTab: (tabId: string) => void;
  updateFileContent: (tabId: string, content: string) => void;
  addConsoleMessage: (type: ConsoleMessage['type'], message: string) => void;
  clearConsole: () => void;
  
  // Build actions
  submitBuild: (runAfterBuild?: boolean) => Promise<void>;
  addBuildLog: (type: BuildLogEntry['type'], message: string) => void;
  clearBuildLogs: () => void;
  syncTabsToProject: () => void;
  clearPendingHotReload: () => void;
  
  // Layout actions
  setLayoutModel: (model: FlexLayout.Model) => void;
  ensureEditorVisible: () => void;
  
  addCollaborator: (collaborator: Collaborator) => void;
  removeCollaborator: (id: string) => void;
  updateCollaboratorCursor: (id: string, cursor: { x: number; y: number }) => void;
  
  // File operations
  renameFile: (id: string, newName: string) => void;
  moveFiles: (dragIds: string[], parentId: string | null, index: number) => void;
  createFile: (parentId: string | null, index: number, type: 'file' | 'folder') => ProjectFile | null;
  deleteFiles: (ids: string[]) => void;
}

// Helper to flatten file tree
const flattenFiles = (files: ProjectFile[], parentPath = ''): { path: string; content: string; name: string }[] => {
  const result: { path: string; content: string; name: string }[] = [];
  for (const file of files) {
    const filePath = parentPath ? `${parentPath}/${file.name}` : file.name;
    if (!file.isFolder) {
      result.push({ path: filePath, content: file.content, name: file.name });
    }
    if (file.children) {
      result.push(...flattenFiles(file.children, filePath));
    }
  }
  return result;
};

export const usePlaygroundStore = create<PlaygroundState>((set, get) => ({
  projects: [defaultProject],
  currentProject: defaultProject,
  openTabs: [],
  activeTabId: null,
  consoleMessages: [
    { id: '1', type: 'info', message: 'Welcome to CodeForge Playground!', timestamp: new Date() },
    { id: '2', type: 'info', message: 'Ready to build C/SDL/Raylib projects.', timestamp: new Date() },
  ],
  collaborators: [
    { id: '1', name: 'You', color: '#2dd4bf' },
  ],
  isBuilding: false,
  
  // Build state
  lastBuildId: null,
  lastPreviewUrl: null,
  buildPhase: 'idle',
  buildLogs: [],
  buildError: null,
  pendingHotReload: false,
  
  // Layout
  layoutModel: null,

  setCurrentProject: (project) => set({ currentProject: project }),

  createProject: (name) => {
    const newProject: Project = {
      id: `project-${Date.now()}`,
      name,
      files: [
        { id: `main-${Date.now()}`, name: 'main.c', content: '// Start coding here\n#include <stdio.h>\n\nint main() {\n    printf("Hello, World!\\n");\n    return 0;\n}\n', language: 'c', isFolder: false },
      ],
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    set((state) => ({
      projects: [...state.projects, newProject],
      currentProject: newProject,
      openTabs: [],
      activeTabId: null,
    }));
  },

  openFile: (file) => {
    if (file.isFolder) return;
    
    const existingTab = get().openTabs.find((tab) => tab.fileId === file.id);
    if (existingTab) {
      set({ activeTabId: existingTab.id });
      return;
    }

    const newTab: OpenTab = {
      id: `tab-${Date.now()}`,
      fileId: file.id,
      fileName: file.name,
      content: file.content,
      language: file.language,
      isDirty: false,
    };

    set((state) => ({
      openTabs: [...state.openTabs, newTab],
      activeTabId: newTab.id,
    }));
  },

  closeTab: (tabId) => {
    set((state) => {
      const newTabs = state.openTabs.filter((tab) => tab.id !== tabId);
      const newActiveId = state.activeTabId === tabId
        ? newTabs.length > 0 ? newTabs[newTabs.length - 1].id : null
        : state.activeTabId;
      return { openTabs: newTabs, activeTabId: newActiveId };
    });
  },

  setActiveTab: (tabId) => set({ activeTabId: tabId }),

  updateFileContent: (tabId, content) => {
    set((state) => ({
      openTabs: state.openTabs.map((tab) =>
        tab.id === tabId ? { ...tab, content, isDirty: true } : tab
      ),
    }));
  },

  addConsoleMessage: (type, message) => {
    const newMessage: ConsoleMessage = {
      id: `msg-${Date.now()}`,
      type,
      message,
      timestamp: new Date(),
    };
    set((state) => ({
      consoleMessages: [...state.consoleMessages, newMessage],
    }));
  },

  clearConsole: () => set({ consoleMessages: [] }),

  // Sync dirty tabs back to project files
  syncTabsToProject: () => {
    const { currentProject, openTabs } = get();
    if (!currentProject) return;

    const dirtyTabs = openTabs.filter((tab) => tab.isDirty);
    if (dirtyTabs.length === 0) return;

    const updateFileInTree = (files: ProjectFile[], fileId: string, newContent: string): ProjectFile[] => {
      return files.map((file) => {
        if (file.id === fileId) {
          return { ...file, content: newContent };
        }
        if (file.children) {
          return { ...file, children: updateFileInTree(file.children, fileId, newContent) };
        }
        return file;
      });
    };

    let updatedFiles = currentProject.files;
    for (const tab of dirtyTabs) {
      updatedFiles = updateFileInTree(updatedFiles, tab.fileId, tab.content);
    }

    const updatedProject = { ...currentProject, files: updatedFiles, updatedAt: new Date() };
    
    // Mark tabs as not dirty
    const updatedTabs = openTabs.map((tab) => ({ ...tab, isDirty: false }));

    set((state) => ({
      currentProject: updatedProject,
      projects: state.projects.map((p) => (p.id === currentProject.id ? updatedProject : p)),
      openTabs: updatedTabs,
    }));
  },

  // Build actions
  addBuildLog: (type, message) => {
    const newLog: BuildLogEntry = {
      id: `log-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      type,
      message,
      timestamp: new Date(),
    };
    set((state) => ({
      buildLogs: [...state.buildLogs, newLog],
    }));
  },

  clearBuildLogs: () => set({ buildLogs: [], buildError: null }),
  
  clearPendingHotReload: () => set({ pendingHotReload: false }),
  
  setLayoutModel: (model) => set({ layoutModel: model }),
  
  ensureEditorVisible: () => {
    const { layoutModel } = get();
    if (!layoutModel) return;
    
    // Find an editor tab
    let editorTabNode: FlexLayout.TabNode | null = null;
    let editorTabsetNode: FlexLayout.TabSetNode | null = null;
    
    layoutModel.visitNodes((node) => {
      if (node.getType() === 'tab') {
        const tabNode = node as FlexLayout.TabNode;
        if (tabNode.getComponent() === 'editor') {
          editorTabNode = tabNode;
          // Find parent tabset
          const parent = tabNode.getParent();
          if (parent && parent.getType() === 'tabset') {
            editorTabsetNode = parent as FlexLayout.TabSetNode;
          }
        }
      }
    });
    
    if (editorTabNode && editorTabsetNode) {
      // Select the editor tab
      layoutModel.doAction(FlexLayout.Actions.selectTab(editorTabNode.getId()));
    } else {
      // No editor exists, create one in the first tabset
      let firstTabset: FlexLayout.TabSetNode | null = null;
      layoutModel.visitNodes((node) => {
        if (node.getType() === 'tabset' && !firstTabset) {
          firstTabset = node as FlexLayout.TabSetNode;
        }
      });
      
      if (firstTabset) {
        layoutModel.doAction(
          FlexLayout.Actions.addNode(
            {
              type: 'tab',
              name: 'Editor',
              component: 'editor',
            },
            firstTabset.getId(),
            FlexLayout.DockLocation.CENTER,
            -1
          )
        );
      }
    }
  },

  submitBuild: async (runAfterBuild = false) => {
    const { currentProject, syncTabsToProject, addBuildLog, clearBuildLogs, addConsoleMessage } = get();
    
    if (!currentProject) {
      addConsoleMessage('error', 'No project selected');
      return;
    }

    // Sync dirty tabs first
    syncTabsToProject();

    // Clear previous build state
    clearBuildLogs();
    set({ isBuilding: true, buildPhase: 'queued', buildError: null, pendingHotReload: false });
    addConsoleMessage('info', 'Starting build...');
    addBuildLog('status', 'Build queued...');

    try {
      // Get fresh project state after sync
      const freshProject = get().currentProject;
      if (!freshProject) throw new Error('Project not found');

      // Flatten files
      const allFiles = flattenFiles(freshProject.files);
      
      // Filter source files
      const cFiles = allFiles.filter((f) => f.name.endsWith('.c'));
      const cppFiles = allFiles.filter((f) => f.name.endsWith('.cpp') || f.name.endsWith('.cc'));
      const headerFiles = allFiles.filter((f) => f.name.endsWith('.h') || f.name.endsWith('.hpp'));

      if (cFiles.length === 0 && cppFiles.length === 0) {
        throw new Error('No C or C++ source files found');
      }

      // Determine language and entry file
      const language = cppFiles.length > 0 ? 'cpp' : 'c';
      const sourceFiles = language === 'cpp' ? cppFiles : cFiles;
      
      // Find main file (prefer main.c or main.cpp)
      const mainFile = sourceFiles.find((f) => f.name === 'main.c' || f.name === 'main.cpp') || sourceFiles[0];

      // Build request with all source and header files
      const filesToSend = [...sourceFiles, ...headerFiles].map((f) => ({
        path: f.path,
        content: f.content,
      }));

      addBuildLog('status', `Submitting ${filesToSend.length} files...`);

      // Submit build
      const response = await apiSubmitBuild({
        files: filesToSend,
        entry: mainFile.path,
        language: language as 'c' | 'cpp',
      });

      set({ lastBuildId: response.buildId });
      addBuildLog('status', `Build ID: ${response.buildId}`);

      // Subscribe to build events
      subscribeToBuildEvents(
        response.buildId,
        (event) => {
          const { addBuildLog, addConsoleMessage } = get();

          if (event.type === 'status' && event.phase) {
            set({ buildPhase: event.phase as BuildPhase });
            addBuildLog('status', event.phase);
          } else if (event.type === 'log' && event.message) {
            const logType = event.stream === 'stderr' ? 'stderr' : 'stdout';
            addBuildLog(logType, event.message);
          } else if (event.type === 'done') {
            if (event.success) {
              const previewUrl = event.previewUrl || getPreviewUrl(response.buildId);
              set({ 
                isBuilding: false, 
                buildPhase: 'success', 
                lastPreviewUrl: previewUrl,
                pendingHotReload: runAfterBuild,
              });
              addBuildLog('status', 'Build completed successfully!');
              addConsoleMessage('success', 'Build completed successfully!');
            } else {
              set({ isBuilding: false, buildPhase: 'error', buildError: 'Build failed' });
              addBuildLog('stderr', 'Build failed');
              addConsoleMessage('error', 'Build failed');
            }
          } else if (event.type === 'error') {
            set({ isBuilding: false, buildPhase: 'error', buildError: event.message || 'Unknown error' });
            addBuildLog('stderr', event.message || 'Build error');
            addConsoleMessage('error', event.message || 'Build error');
          }
        },
        (error) => {
          console.error('Build event stream error:', error);
          set({ isBuilding: false, buildPhase: 'error', buildError: error.message });
          get().addConsoleMessage('error', `Build stream error: ${error.message}`);
        }
      );
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      set({ isBuilding: false, buildPhase: 'error', buildError: errorMessage });
      addBuildLog('stderr', errorMessage);
      addConsoleMessage('error', `Build failed: ${errorMessage}`);
    }
  },

  addCollaborator: (collaborator) => {
    set((state) => ({
      collaborators: [...state.collaborators, collaborator],
    }));
  },

  removeCollaborator: (id) => {
    set((state) => ({
      collaborators: state.collaborators.filter((c) => c.id !== id),
    }));
  },

  updateCollaboratorCursor: (id, cursor) => {
    set((state) => ({
      collaborators: state.collaborators.map((c) =>
        c.id === id ? { ...c, cursor } : c
      ),
    }));
  },

  // ============ File Operations ============

  renameFile: (id, newName) => {
    const { currentProject, openTabs } = get();
    if (!currentProject) return;

    const renameInTree = (files: ProjectFile[]): ProjectFile[] => {
      return files.map((file) => {
        if (file.id === id) {
          return { ...file, name: newName };
        }
        if (file.children) {
          return { ...file, children: renameInTree(file.children) };
        }
        return file;
      });
    };

    const updatedFiles = renameInTree(currentProject.files);
    const updatedProject = { ...currentProject, files: updatedFiles, updatedAt: new Date() };

    // Also update open tabs if the renamed file is open
    const updatedTabs = openTabs.map((tab) =>
      tab.fileId === id ? { ...tab, fileName: newName } : tab
    );

    set((state) => ({
      currentProject: updatedProject,
      projects: state.projects.map((p) => (p.id === currentProject.id ? updatedProject : p)),
      openTabs: updatedTabs,
    }));
  },

  moveFiles: (dragIds, parentId, index) => {
    const { currentProject } = get();
    if (!currentProject) return;

    // Helper to find and remove nodes from tree
    const removeFromTree = (files: ProjectFile[], ids: string[]): { remaining: ProjectFile[]; removed: ProjectFile[] } => {
      const removed: ProjectFile[] = [];
      const remaining = files
        .filter((file) => {
          if (ids.includes(file.id)) {
            removed.push(file);
            return false;
          }
          return true;
        })
        .map((file) => {
          if (file.children) {
            const result = removeFromTree(file.children, ids);
            removed.push(...result.removed);
            return { ...file, children: result.remaining };
          }
          return file;
        });
      return { remaining, removed };
    };

    // Helper to insert nodes into tree at position
    const insertIntoTree = (files: ProjectFile[], targetParentId: string | null, insertIndex: number, nodesToInsert: ProjectFile[]): ProjectFile[] => {
      if (targetParentId === null) {
        // Insert at root level
        const result = [...files];
        const safeIndex = Math.min(insertIndex, result.length);
        result.splice(safeIndex, 0, ...nodesToInsert.map((n) => ({ ...n, parentId: undefined })));
        return result;
      }

      return files.map((file) => {
        if (file.id === targetParentId && file.children) {
          const newChildren = [...file.children];
          const safeIndex = Math.min(insertIndex, newChildren.length);
          newChildren.splice(safeIndex, 0, ...nodesToInsert.map((n) => ({ ...n, parentId: targetParentId })));
          return { ...file, children: newChildren };
        }
        if (file.children) {
          return { ...file, children: insertIntoTree(file.children, targetParentId, insertIndex, nodesToInsert) };
        }
        return file;
      });
    };

    const { remaining, removed } = removeFromTree(currentProject.files, dragIds);
    const updatedFiles = insertIntoTree(remaining, parentId, index, removed);
    const updatedProject = { ...currentProject, files: updatedFiles, updatedAt: new Date() };

    set((state) => ({
      currentProject: updatedProject,
      projects: state.projects.map((p) => (p.id === currentProject.id ? updatedProject : p)),
    }));
  },

  createFile: (parentId, index, type) => {
    const { currentProject } = get();
    if (!currentProject) return null;

    const newFile: ProjectFile = {
      id: `file-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      name: type === 'folder' ? 'New Folder' : 'untitled.c',
      content: type === 'folder' ? '' : '// New file\n',
      language: type === 'folder' ? 'folder' : 'c',
      isFolder: type === 'folder',
      children: type === 'folder' ? [] : undefined,
      parentId: parentId ?? undefined,
    };

    const insertIntoTree = (files: ProjectFile[], targetParentId: string | null, insertIndex: number): ProjectFile[] => {
      if (targetParentId === null) {
        const result = [...files];
        const safeIndex = Math.min(insertIndex, result.length);
        result.splice(safeIndex, 0, newFile);
        return result;
      }

      return files.map((file) => {
        if (file.id === targetParentId && file.children) {
          const newChildren = [...file.children];
          const safeIndex = Math.min(insertIndex, newChildren.length);
          newChildren.splice(safeIndex, 0, newFile);
          return { ...file, children: newChildren };
        }
        if (file.children) {
          return { ...file, children: insertIntoTree(file.children, targetParentId, insertIndex) };
        }
        return file;
      });
    };

    const updatedFiles = insertIntoTree(currentProject.files, parentId, index);
    const updatedProject = { ...currentProject, files: updatedFiles, updatedAt: new Date() };

    set((state) => ({
      currentProject: updatedProject,
      projects: state.projects.map((p) => (p.id === currentProject.id ? updatedProject : p)),
    }));

    return newFile;
  },

  deleteFiles: (ids) => {
    const { currentProject, openTabs } = get();
    if (!currentProject) return;

    // Collect all IDs to delete (including children of folders)
    const collectAllIds = (files: ProjectFile[], targetIds: string[]): string[] => {
      const allIds: string[] = [];
      const traverse = (file: ProjectFile) => {
        if (targetIds.includes(file.id)) {
          allIds.push(file.id);
          if (file.children) {
            file.children.forEach(traverse);
          }
        } else if (file.children) {
          file.children.forEach(traverse);
        }
      };
      files.forEach(traverse);
      return [...new Set([...targetIds, ...allIds])];
    };

    const allIdsToDelete = collectAllIds(currentProject.files, ids);

    const removeFromTree = (files: ProjectFile[]): ProjectFile[] => {
      return files
        .filter((file) => !allIdsToDelete.includes(file.id))
        .map((file) => {
          if (file.children) {
            return { ...file, children: removeFromTree(file.children) };
          }
          return file;
        });
    };

    const updatedFiles = removeFromTree(currentProject.files);
    const updatedProject = { ...currentProject, files: updatedFiles, updatedAt: new Date() };

    // Close any tabs for deleted files
    const remainingTabs = openTabs.filter((tab) => !allIdsToDelete.includes(tab.fileId));
    const newActiveTabId = remainingTabs.length > 0 ? remainingTabs[remainingTabs.length - 1].id : null;

    set((state) => ({
      currentProject: updatedProject,
      projects: state.projects.map((p) => (p.id === currentProject.id ? updatedProject : p)),
      openTabs: remainingTabs,
      activeTabId: state.activeTabId && allIdsToDelete.includes(
        openTabs.find((t) => t.id === state.activeTabId)?.fileId || ''
      ) ? newActiveTabId : state.activeTabId,
    }));
  },
}));
