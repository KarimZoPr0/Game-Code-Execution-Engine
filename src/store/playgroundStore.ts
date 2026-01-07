import { create } from "zustand";
import * as FlexLayout from "flexlayout-react";
import {
  Project,
  ProjectFile,
  OpenTab,
  ConsoleMessage,
  Collaborator,
  BuildPhase,
  BuildLogEntry,
} from "@/types/playground";
import { submitBuild as apiSubmitBuild, subscribeToBuild, getPreviewUrl } from "@/lib/api";
import { saveTabs, saveActiveTabId, getStoredTabs, getActiveTabId } from "@/lib/storage/localStorage";
import { deleteProject as deleteFromIndexedDB, deleteExcalidrawDrawing, saveProject as saveToIndexedDB, saveExcalidrawDrawing } from "@/lib/storage/indexedDB";
import { deleteCloudProject, syncProjectToCloud, syncExcalidrawToCloud } from "@/lib/storage/cloudSync";
import { supabase } from "@/integrations/supabase/client";
import { regenerateFileIds } from "@/lib/storage/projectImport";

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
  id: "default-project",
  name: "My SDL Game",
  files: [{ id: "main-c", name: "main.c", content: defaultMainC, language: "c", isFolder: false }],
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

  // Layout
  layoutModel: FlexLayout.Model | null;

  // Actions
  setCurrentProject: (project: Project) => void;
  createProject: (name: string) => void;
  openFile: (file: ProjectFile) => void;
  closeTab: (tabId: string) => void;
  setActiveTab: (tabId: string) => void;
  updateFileContent: (tabId: string, content: string) => void;
  addConsoleMessage: (type: ConsoleMessage["type"], message: string) => void;
  clearConsole: () => void;

  // Build actions
  submitBuild: (runAfterBuild?: boolean) => Promise<void>;
  addBuildLog: (type: BuildLogEntry["type"], message: string) => void;
  clearBuildLogs: () => void;
  syncTabsToProject: () => void;
  clearPendingHotReload: () => void;

  // Layout actions
  setLayoutModel: (model: FlexLayout.Model) => void;
  ensureEditorVisible: () => void;

  // Collaborators
  addCollaborator: (collaborator: Collaborator) => void;
  removeCollaborator: (id: string) => void;
  updateCollaboratorCursor: (id: string, cursor: { x: number; y: number }) => void;

  // File operations
  renameFile: (id: string, newName: string) => void;
  moveFiles: (dragIds: string[], parentId: string | null, index: number) => void;
  createFile: (parentId: string | null, index: number, type: "file" | "folder") => ProjectFile | null;
  deleteFiles: (ids: string[]) => void;

  // Tab persistence helpers
  loadTabsForProject: (projectId: string, files: ProjectFile[]) => void;
  saveCurrentTabs: () => void;

  // Project management
  deleteProject: (projectId: string) => Promise<void>;
  importProject: (name: string, files: ProjectFile[], excalidrawData?: unknown) => Promise<Project>;
}

/** Flatten file tree into compiler payload */
const flattenFiles = (files: ProjectFile[], parentPath = ""): { path: string; content: string; name: string }[] => {
  const out: { path: string; content: string; name: string }[] = [];
  for (const file of files) {
    const filePath = parentPath ? `${parentPath}/${file.name}` : file.name;
    if (!file.isFolder) out.push({ path: filePath, content: file.content, name: file.name });
    if (file.children) out.push(...flattenFiles(file.children, filePath));
  }
  return out;
};

const nowId = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

/** Normalize backend phases to UI phases */
const normalizePhase = (phase?: string): BuildPhase => {
  if (!phase) return "queued";
  const p = phase.toLowerCase();

  if (p === "init" || p === "queued" || p.includes("wait")) return "queued";
  if (p === "compile" || p === "compiling") return "compiling";
  if (p === "link" || p === "linking") return "linking";
  if (p === "success" || p === "complete" || p === "done") return "success";
  if (p === "error" || p === "failed" || p === "failure") return "error";
  if (p === "idle") return "idle";

  return "building";
};

/** Check if a message indicates build success */
const isSuccessMessage = (message?: string): boolean => {
  if (!message) return false;
  const m = message.toLowerCase();
  return m === "success" || m.includes("build successful") || m.includes("build complete");
};

// Helper to find file in tree
const findFileInTree = (files: ProjectFile[], fileId: string): ProjectFile | undefined => {
  for (const f of files) {
    if (f.id === fileId) return f;
    if (f.children) {
      const found = findFileInTree(f.children, fileId);
      if (found) return found;
    }
  }
  return undefined;
};

// ---- Module-scoped variables ----
let unsubscribeCurrentBuild: null | (() => void) = null;
let buildWatchdog: null | ReturnType<typeof setTimeout> = null;
let activeBuildId: string | null = null;
let autoSaveTimeout: ReturnType<typeof setTimeout> | null = null;

const clearBuildWatchdog = () => {
  if (buildWatchdog) {
    clearTimeout(buildWatchdog);
    buildWatchdog = null;
  }
};

const startBuildWatchdog = (onTimeout: () => void, ms: number) => {
  clearBuildWatchdog();
  buildWatchdog = setTimeout(onTimeout, ms);
};

export const usePlaygroundStore = create<PlaygroundState>((set, get) => ({
  projects: [defaultProject],
  currentProject: defaultProject,
  openTabs: [],
  activeTabId: null,
  consoleMessages: [
    { id: "1", type: "info", message: "Welcome to CodeForge Playground!", timestamp: new Date() },
    { id: "2", type: "info", message: "Ready to build C/SDL/Raylib projects.", timestamp: new Date() },
  ],
  collaborators: [{ id: "1", name: "You", color: "#2dd4bf" }],
  isBuilding: false,

  // Build state
  lastBuildId: null,
  lastPreviewUrl: null,
  buildPhase: "idle",
  buildLogs: [],
  buildError: null,
  pendingHotReload: false,

  // Layout
  layoutModel: null,

  setCurrentProject: (project) => {
    const { currentProject, openTabs, activeTabId, saveCurrentTabs, loadTabsForProject } = get();
    
    // Save current project's tabs before switching
    if (currentProject) {
      saveCurrentTabs();
    }
    
    // Switch project and load its tabs
    set({ currentProject: project, openTabs: [], activeTabId: null });
    loadTabsForProject(project.id, project.files);
  },

  loadTabsForProject: (projectId, files) => {
    const savedTabs = getStoredTabs(projectId);
    const restoredTabs: OpenTab[] = [];

    for (const tab of savedTabs) {
      const file = findFileInTree(files, tab.fileId);
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

    const savedActiveTabId = getActiveTabId(projectId);
    const activeTab = restoredTabs.find((t) => t.id === savedActiveTabId);

    set({
      openTabs: restoredTabs,
      activeTabId: activeTab?.id || (restoredTabs.length > 0 ? restoredTabs[0].id : null),
    });
  },

  saveCurrentTabs: () => {
    const { currentProject, openTabs, activeTabId } = get();
    if (!currentProject) return;

    saveTabs(
      currentProject.id,
      openTabs.map((t) => ({
        id: t.id,
        fileId: t.fileId,
        fileName: t.fileName,
        language: t.language,
      }))
    );
    saveActiveTabId(currentProject.id, activeTabId);
  },

  createProject: (name) => {
    const { saveCurrentTabs } = get();
    
    // Save current tabs before switching
    saveCurrentTabs();

    const projectId = `project-${Date.now()}`;
    const mainId = `main-${Date.now()}`;
    const newProject: Project = {
      id: projectId,
      name,
      files: [
        {
          id: mainId,
          name: "main.c",
          content:
            '// Start coding here\n#include <stdio.h>\n\nint main() {\n  printf("Hello, World!\\n");\n  return 0;\n}\n',
          language: "c",
          isFolder: false,
        },
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

    const { openTabs, currentProject } = get();
    const existing = openTabs.find((t) => t.fileId === file.id);
    if (existing) {
      set({ activeTabId: existing.id });
      return;
    }

    const tab: OpenTab = {
      id: nowId("tab"),
      fileId: file.id,
      fileName: file.name,
      content: file.content,
      language: file.language,
      isDirty: false,
    };

    set((state) => ({ openTabs: [...state.openTabs, tab], activeTabId: tab.id }));

    // Save tabs for current project
    if (currentProject) {
      const newTabs = [...openTabs, tab];
      saveTabs(
        currentProject.id,
        newTabs.map((t) => ({
          id: t.id,
          fileId: t.fileId,
          fileName: t.fileName,
          language: t.language,
        }))
      );
      saveActiveTabId(currentProject.id, tab.id);
    }
  },

  closeTab: (tabId) => {
    const { currentProject } = get();
    
    set((state) => {
      const tabs = state.openTabs.filter((t) => t.id !== tabId);
      const active = state.activeTabId === tabId ? (tabs.length ? tabs[tabs.length - 1].id : null) : state.activeTabId;
      return { openTabs: tabs, activeTabId: active };
    });

    // Save tabs for current project
    if (currentProject) {
      const { openTabs, activeTabId } = get();
      saveTabs(
        currentProject.id,
        openTabs.map((t) => ({
          id: t.id,
          fileId: t.fileId,
          fileName: t.fileName,
          language: t.language,
        }))
      );
      saveActiveTabId(currentProject.id, activeTabId);
    }
  },

  setActiveTab: (tabId) => {
    const { currentProject } = get();
    set({ activeTabId: tabId });
    
    if (currentProject) {
      saveActiveTabId(currentProject.id, tabId);
    }
  },

  updateFileContent: (tabId, content) => {
    set((state) => ({
      openTabs: state.openTabs.map((t) => (t.id === tabId ? { ...t, content, isDirty: true } : t)),
    }));

    // Debounced auto-save (1 second after last keystroke)
    if (autoSaveTimeout) clearTimeout(autoSaveTimeout);
    autoSaveTimeout = setTimeout(() => {
      get().syncTabsToProject();
    }, 1000);
  },

  addConsoleMessage: (type, message) => {
    const msg: ConsoleMessage = { id: nowId("msg"), type, message, timestamp: new Date() };
    set((state) => ({ consoleMessages: [...state.consoleMessages, msg] }));
  },

  clearConsole: () => set({ consoleMessages: [] }),

  syncTabsToProject: () => {
    const { currentProject, openTabs } = get();
    if (!currentProject) return;

    const dirtyTabs = openTabs.filter((t) => t.isDirty);
    if (dirtyTabs.length === 0) return;

    const updateTree = (files: ProjectFile[], fileId: string, newContent: string): ProjectFile[] =>
      files.map((f) => {
        if (f.id === fileId) return { ...f, content: newContent };
        if (f.children) return { ...f, children: updateTree(f.children, fileId, newContent) };
        return f;
      });

    let updatedFiles = currentProject.files;
    for (const t of dirtyTabs) updatedFiles = updateTree(updatedFiles, t.fileId, t.content);

    const updatedProject = { ...currentProject, files: updatedFiles, updatedAt: new Date() };
    const cleanedTabs = openTabs.map((t) => ({ ...t, isDirty: false }));

    set((state) => ({
      currentProject: updatedProject,
      projects: state.projects.map((p) => (p.id === currentProject.id ? updatedProject : p)),
      openTabs: cleanedTabs,
    }));
  },

  addBuildLog: (type, message) => {
    const log: BuildLogEntry = { id: nowId("log"), type, message, timestamp: new Date() };
    set((state) => ({ buildLogs: [...state.buildLogs, log] }));
  },

  clearBuildLogs: () => set({ buildLogs: [], buildError: null }),

  clearPendingHotReload: () => set({ pendingHotReload: false }),

  setLayoutModel: (model) => set({ layoutModel: model }),

  ensureEditorVisible: () => {
    const { layoutModel } = get();
    if (!layoutModel) return;

    let editorTabNode: FlexLayout.TabNode | null = null;
    let editorTabsetNode: FlexLayout.TabSetNode | null = null;

    layoutModel.visitNodes((node) => {
      if (node.getType() !== "tab") return;
      const tabNode = node as FlexLayout.TabNode;
      if (tabNode.getComponent() !== "editor") return;
      editorTabNode = tabNode;

      const parent = tabNode.getParent();
      if (parent && parent.getType() === "tabset") editorTabsetNode = parent as FlexLayout.TabSetNode;
    });

    if (editorTabNode && editorTabsetNode) {
      layoutModel.doAction(FlexLayout.Actions.selectTab(editorTabNode.getId()));
      return;
    }

    // Create one in first tabset
    let firstTabset: FlexLayout.TabSetNode | null = null;
    layoutModel.visitNodes((node) => {
      if (!firstTabset && node.getType() === "tabset") firstTabset = node as FlexLayout.TabSetNode;
    });

    if (firstTabset) {
      layoutModel.doAction(
        FlexLayout.Actions.addNode(
          { type: "tab", name: "Editor", component: "editor" },
          firstTabset.getId(),
          FlexLayout.DockLocation.CENTER,
          -1,
        ),
      );
    }
  },

  submitBuild: async (runAfterBuild = false) => {
    const { currentProject, syncTabsToProject, addBuildLog, clearBuildLogs, addConsoleMessage } = get();

    if (!currentProject) {
      addConsoleMessage("error", "No project selected");
      return;
    }

    // Kill previous stream + watchdog
    unsubscribeCurrentBuild?.();
    unsubscribeCurrentBuild = null;
    clearBuildWatchdog();

    // Sync dirty tabs first
    syncTabsToProject();

    // Reset build UI state
    clearBuildLogs();
    set({ isBuilding: true, buildPhase: "queued", buildError: null, pendingHotReload: false });
    addConsoleMessage("info", "Starting build...");
    addBuildLog("status", "Build queued...");

    try {
      const freshProject = get().currentProject;
      if (!freshProject) throw new Error("Project not found");

      const allFiles = flattenFiles(freshProject.files);

      const cFiles = allFiles.filter((f) => f.name.endsWith(".c"));
      const cppFiles = allFiles.filter((f) => f.name.endsWith(".cpp") || f.name.endsWith(".cc"));
      const headerFiles = allFiles.filter((f) => f.name.endsWith(".h") || f.name.endsWith(".hpp"));

      if (cFiles.length === 0 && cppFiles.length === 0) {
        throw new Error("No C or C++ source files found");
      }

      const language = cppFiles.length > 0 ? "cpp" : "c";
      const sourceFiles = language === "cpp" ? cppFiles : cFiles;

      const mainFile = sourceFiles.find((f) => f.name === "main.c" || f.name === "main.cpp") ?? sourceFiles[0];

      const filesToSend = [...sourceFiles, ...headerFiles].map((f) => ({ path: f.path, content: f.content }));

      addBuildLog("status", `Submitting ${filesToSend.length} files...`);

      const response = await apiSubmitBuild({
        files: filesToSend,
        entry: mainFile.path,
        language: language as "c" | "cpp",
      });

      activeBuildId = response.buildId;

      set({ lastBuildId: response.buildId });
      addBuildLog("status", `Build ID: ${response.buildId}`);

      // Watchdog: if we never receive any events, unlock UI (increased to 30s for polling fallback)
      startBuildWatchdog(() => {
        if (activeBuildId !== response.buildId) return;

        unsubscribeCurrentBuild?.();
        unsubscribeCurrentBuild = null;

        set({ isBuilding: false, buildPhase: "error", buildError: "Build timed out (no events received)" });
        get().addBuildLog("stderr", "Build timed out (no events received)");
        get().addConsoleMessage("error", "Build timed out (no events received)");
      }, 30_000);

      // Use hybrid SSE + polling subscriber for Cloudflare compatibility
      unsubscribeCurrentBuild = subscribeToBuild(
        response.buildId,
        (event) => {
          if (activeBuildId !== response.buildId) return;

          // Refresh watchdog
          startBuildWatchdog(() => {
            if (activeBuildId !== response.buildId) return;
            unsubscribeCurrentBuild?.();
            unsubscribeCurrentBuild = null;
            set({ isBuilding: false, buildPhase: "error", buildError: "Build stalled (no events for 30s)" });
            get().addBuildLog("stderr", "Build stalled");
            get().addConsoleMessage("error", "Build stalled");
          }, 30_000);

          const phase = normalizePhase(event.phase);
          const messageIndicatesSuccess = isSuccessMessage(event.message);
          
          // Check for done event type (SSE stream completion)
          if (event.type === "done" || phase === "success" || messageIndicatesSuccess) {
            clearBuildWatchdog();
            unsubscribeCurrentBuild?.();
            unsubscribeCurrentBuild = null;

            const previewUrl = getPreviewUrl(response.buildId);
            set({ isBuilding: false, lastPreviewUrl: previewUrl, buildPhase: "success", pendingHotReload: runAfterBuild });
            get().addBuildLog("status", "Build successful!");
            get().addConsoleMessage("success", `Build complete. Preview: ${previewUrl}`);
            return;
          }
          
          set({ buildPhase: phase });

          if (event.message) {
            const isErr = phase === "error";
            get().addBuildLog(isErr ? "stderr" : "stdout", event.message);
            get().addConsoleMessage(isErr ? "error" : "info", event.message);
          }

          if (phase === "error") {
            clearBuildWatchdog();
            unsubscribeCurrentBuild?.();
            unsubscribeCurrentBuild = null;

            set({ isBuilding: false, buildError: event.message || "Build failed" });
            get().addBuildLog("stderr", event.message || "Build failed");
            get().addConsoleMessage("error", event.message || "Build failed");
          }
        },
        (err) => {
          if (activeBuildId !== response.buildId) return;
          clearBuildWatchdog();
          unsubscribeCurrentBuild = null;

          set({ isBuilding: false, buildPhase: "error", buildError: err.message });
          get().addBuildLog("stderr", `SSE error: ${err.message}`);
          get().addConsoleMessage("error", `Build stream error: ${err.message}`);
        },
      );
    } catch (err: unknown) {
      clearBuildWatchdog();
      const message = err instanceof Error ? err.message : String(err);
      set({ isBuilding: false, buildPhase: "error", buildError: message });
      addBuildLog("stderr", message);
      addConsoleMessage("error", message);
    }
  },

  addCollaborator: (collaborator) => {
    set((state) => ({ collaborators: [...state.collaborators, collaborator] }));
  },

  removeCollaborator: (id) => {
    set((state) => ({ collaborators: state.collaborators.filter((c) => c.id !== id) }));
  },

  updateCollaboratorCursor: (id, cursor) => {
    set((state) => ({
      collaborators: state.collaborators.map((c) => (c.id === id ? { ...c, cursor } : c)),
    }));
  },

  renameFile: (id, newName) => {
    const { currentProject, openTabs } = get();
    if (!currentProject) return;

    const rename = (files: ProjectFile[]): ProjectFile[] =>
      files.map((f) => {
        if (f.id === id) {
          const ext = newName.split(".").pop() || "";
          const lang = ext === "c" || ext === "h" ? "c" : ext === "cpp" || ext === "cc" || ext === "hpp" ? "cpp" : f.language;
          return { ...f, name: newName, language: lang };
        }
        if (f.children) return { ...f, children: rename(f.children) };
        return f;
      });

    const updatedFiles = rename(currentProject.files);
    const updatedProject = { ...currentProject, files: updatedFiles, updatedAt: new Date() };

    // Update tab names
    const updatedTabs = openTabs.map((t) => {
      if (t.fileId === id) {
        const ext = newName.split(".").pop() || "";
        const lang = ext === "c" || ext === "h" ? "c" : ext === "cpp" || ext === "cc" || ext === "hpp" ? "cpp" : t.language;
        return { ...t, fileName: newName, language: lang };
      }
      return t;
    });

    set((state) => ({
      currentProject: updatedProject,
      projects: state.projects.map((p) => (p.id === currentProject.id ? updatedProject : p)),
      openTabs: updatedTabs,
    }));
  },

  moveFiles: (dragIds, parentId, index) => {
    const { currentProject } = get();
    if (!currentProject) return;

    const removeFiles = (files: ProjectFile[], ids: string[]): [ProjectFile[], ProjectFile[]] => {
      const removed: ProjectFile[] = [];
      const remaining = files.filter((f) => {
        if (ids.includes(f.id)) {
          removed.push(f);
          return false;
        }
        return true;
      });

      return [
        remaining.map((f) => {
          if (f.children) {
            const [childRemaining, childRemoved] = removeFiles(f.children, ids);
            removed.push(...childRemoved);
            return { ...f, children: childRemaining };
          }
          return f;
        }),
        removed,
      ];
    };

    const insertFiles = (files: ProjectFile[], target: string | null, idx: number, toInsert: ProjectFile[]): ProjectFile[] => {
      if (target === null) {
        const result = [...files];
        result.splice(idx, 0, ...toInsert);
        return result;
      }

      return files.map((f) => {
        if (f.id === target && f.isFolder) {
          const children = f.children ? [...f.children] : [];
          children.splice(idx, 0, ...toInsert);
          return { ...f, children };
        }
        if (f.children) {
          return { ...f, children: insertFiles(f.children, target, idx, toInsert) };
        }
        return f;
      });
    };

    const [remaining, removed] = removeFiles(currentProject.files, dragIds);
    const updated = insertFiles(remaining, parentId, index, removed);
    const updatedProject = { ...currentProject, files: updated, updatedAt: new Date() };

    set((state) => ({
      currentProject: updatedProject,
      projects: state.projects.map((p) => (p.id === currentProject.id ? updatedProject : p)),
    }));
  },

  createFile: (parentId, index, type) => {
    const { currentProject } = get();
    if (!currentProject) return null;

    const newFile: ProjectFile = {
      id: nowId(type),
      name: type === "folder" ? "New Folder" : "untitled.c",
      content: type === "folder" ? "" : "// New file\n",
      language: type === "folder" ? "" : "c",
      isFolder: type === "folder",
      children: type === "folder" ? [] : undefined,
    };

    const insertFile = (files: ProjectFile[], target: string | null, idx: number): ProjectFile[] => {
      if (target === null) {
        const result = [...files];
        result.splice(idx, 0, newFile);
        return result;
      }

      return files.map((f) => {
        if (f.id === target && f.isFolder) {
          const children = f.children ? [...f.children] : [];
          children.splice(idx, 0, newFile);
          return { ...f, children };
        }
        if (f.children) {
          return { ...f, children: insertFile(f.children, target, idx) };
        }
        return f;
      });
    };

    const updated = insertFile(currentProject.files, parentId, index);
    const updatedProject = { ...currentProject, files: updated, updatedAt: new Date() };

    set((state) => ({
      currentProject: updatedProject,
      projects: state.projects.map((p) => (p.id === currentProject.id ? updatedProject : p)),
    }));

    return newFile;
  },

  deleteFiles: (ids) => {
    const { currentProject, openTabs } = get();
    if (!currentProject) return;

    const collectIds = (files: ProjectFile[], targetIds: string[]): string[] => {
      const all: string[] = [];
      for (const f of files) {
        if (targetIds.includes(f.id)) {
          all.push(f.id);
          if (f.children) {
            all.push(...collectIds(f.children, f.children.map((c) => c.id)));
          }
        } else if (f.children) {
          all.push(...collectIds(f.children, targetIds));
        }
      }
      return all;
    };

    const allIds = collectIds(currentProject.files, ids);

    const removeFiles = (files: ProjectFile[]): ProjectFile[] =>
      files
        .filter((f) => !allIds.includes(f.id))
        .map((f) => (f.children ? { ...f, children: removeFiles(f.children) } : f));

    const updated = removeFiles(currentProject.files);
    const updatedProject = { ...currentProject, files: updated, updatedAt: new Date() };

    // Close tabs for deleted files
    const remainingTabs = openTabs.filter((t) => !allIds.includes(t.fileId));
    const newActiveId =
      remainingTabs.length > 0
        ? allIds.includes(get().activeTabId || "") ? remainingTabs[remainingTabs.length - 1].id : get().activeTabId
        : null;

    set((state) => ({
      currentProject: updatedProject,
      projects: state.projects.map((p) => (p.id === currentProject.id ? updatedProject : p)),
      openTabs: remainingTabs,
      activeTabId: newActiveId,
    }));
  },

  deleteProject: async (projectId) => {
    const { projects, currentProject, saveCurrentTabs } = get();
    
    // Prevent deleting the last project
    if (projects.length <= 1) {
      console.warn('Cannot delete the last project');
      return;
    }

    // Save current tabs before switching
    saveCurrentTabs();

    // Remove from local state
    const remainingProjects = projects.filter((p) => p.id !== projectId);
    
    // If deleting current project, switch to another
    const needsSwitch = currentProject?.id === projectId;
    const newCurrentProject = needsSwitch ? remainingProjects[0] : currentProject;

    set({
      projects: remainingProjects,
      currentProject: newCurrentProject,
      openTabs: needsSwitch ? [] : get().openTabs,
      activeTabId: needsSwitch ? null : get().activeTabId,
    });

    // Load tabs for new project if switched
    if (needsSwitch && newCurrentProject) {
      get().loadTabsForProject(newCurrentProject.id, newCurrentProject.files);
    }

    // Delete from IndexedDB
    try {
      await deleteFromIndexedDB(projectId);
      await deleteExcalidrawDrawing(projectId);
    } catch (e) {
      console.error('Error deleting from IndexedDB:', e);
    }

    // Delete from cloud if authenticated
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        await deleteCloudProject(user.id, projectId);
      }
    } catch (e) {
      console.error('Error deleting from cloud:', e);
    }
  },

  importProject: async (name, files, excalidrawData) => {
    const { projects, saveCurrentTabs } = get();

    // Save current tabs before switching
    saveCurrentTabs();

    // Generate unique name if duplicate
    let finalName = name;
    let counter = 1;
    while (projects.some((p) => p.name === finalName)) {
      counter++;
      finalName = `${name} (${counter})`;
    }

    // Regenerate file IDs to avoid conflicts
    const newFiles = regenerateFileIds(files);

    const projectId = `project-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    const newProject: Project = {
      id: projectId,
      name: finalName,
      files: newFiles,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    set((state) => ({
      projects: [...state.projects, newProject],
      currentProject: newProject,
      openTabs: [],
      activeTabId: null,
    }));

    // Save to IndexedDB
    try {
      await saveToIndexedDB(newProject);
      if (excalidrawData) {
        await saveExcalidrawDrawing(projectId, excalidrawData);
      }
    } catch (e) {
      console.error('Error saving to IndexedDB:', e);
    }

    // Sync to cloud if authenticated
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        await syncProjectToCloud(user.id, newProject);
        if (excalidrawData) {
          await syncExcalidrawToCloud(user.id, projectId, excalidrawData);
        }
      }
    } catch (e) {
      console.error('Error syncing to cloud:', e);
    }

    return newProject;
  },
}));
