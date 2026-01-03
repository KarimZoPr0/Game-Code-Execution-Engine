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
import { submitBuild as apiSubmitBuild, subscribeToBuildEvents, getPreviewUrl } from "@/lib/api";

/**
 * Fixes + improvements (no feature loss):
 * - Prevents “Queued…” / stuck builds when building frequently:
 *   - Always unsubscribes previous SSE stream before starting a new build.
 *   - Adds a build watchdog timeout (if no events arrive, fail + unlock UI).
 *   - Ignores stale events from older builds (race-proof).
 * - Normalizes backend phases (init/compile/done/etc) to UI phases.
 * - Keeps existing file ops, tabs, console, collaborators, layout logic.
 */

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

  // backend examples: init, compile, building, done, cancelled
  if (p === "init" || p === "queued" || p.includes("wait")) return "queued";
  if (p === "compile" || p === "compiling") return "compiling";
  if (p === "link" || p === "linking") return "linking";
  if (p === "success") return "success";
  if (p === "error" || p === "failed") return "error";
  if (p === "idle") return "idle";

  // fallback
  return "building";
};

// ---- IMPORTANT: These are module-scoped to survive store re-renders ----
let unsubscribeCurrentBuild: null | (() => void) = null;
let buildWatchdog: null | ReturnType<typeof setTimeout> = null;
let activeBuildId: string | null = null;

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

  setCurrentProject: (project) => set({ currentProject: project }),

  createProject: (name) => {
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

    const existing = get().openTabs.find((t) => t.fileId === file.id);
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
  },

  closeTab: (tabId) => {
    set((state) => {
      const tabs = state.openTabs.filter((t) => t.id !== tabId);
      const active = state.activeTabId === tabId ? (tabs.length ? tabs[tabs.length - 1].id : null) : state.activeTabId;
      return { openTabs: tabs, activeTabId: active };
    });
  },

  setActiveTab: (tabId) => set({ activeTabId: tabId }),

  updateFileContent: (tabId, content) => {
    set((state) => ({
      openTabs: state.openTabs.map((t) => (t.id === tabId ? { ...t, content, isDirty: true } : t)),
    }));
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

    // Kill previous stream + watchdog (FIX for frequent builds)
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

      // Track current build as "active" so stale events can't mess with state
      activeBuildId = response.buildId;

      set({ lastBuildId: response.buildId });
      addBuildLog("status", `Build ID: ${response.buildId}`);

      // Watchdog: if we never receive any events (SSE stall), unlock UI
      startBuildWatchdog(() => {
        // Only fail if this build is still the active one
        if (activeBuildId !== response.buildId) return;

        unsubscribeCurrentBuild?.();
        unsubscribeCurrentBuild = null;

        set({ isBuilding: false, buildPhase: "error", buildError: "Build timed out (no events received)" });
        get().addBuildLog("stderr", "Build timed out (no events received)");
        get().addConsoleMessage("error", "Build timed out (no events received)");
      }, 20_000);

      unsubscribeCurrentBuild = subscribeToBuildEvents(
        response.buildId,
        (event) => {
          // Ignore any event from older builds
          if (activeBuildId !== response.buildId) return;

          // Any event means stream is alive -> refresh watchdog
          startBuildWatchdog(() => {
            if (activeBuildId !== response.buildId) return;

            unsubscribeCurrentBuild?.();
            unsubscribeCurrentBuild = null;

            set({ isBuilding: false, buildPhase: "error", buildError: "Build timed out (stalled)" });
            get().addBuildLog("stderr", "Build timed out (stalled)");
            get().addConsoleMessage("error", "Build timed out (stalled)");
          }, 20_000);

          const { addBuildLog, addConsoleMessage } = get();

          if (event.type === "status") {
            const phase = normalizePhase(event.phase ?? event.message);
            set({ buildPhase: phase });
            if (event.phase) addBuildLog("status", event.phase);
            else if (event.message) addBuildLog("status", event.message);
            return;
          }

          if (event.type === "log" && event.message) {
            const logType = event.stream === "stderr" ? "stderr" : "stdout";
            addBuildLog(logType, event.message);
            return;
          }

          if (event.type === "error") {
            clearBuildWatchdog();
            unsubscribeCurrentBuild?.();
            unsubscribeCurrentBuild = null;

            set({
              isBuilding: false,
              buildPhase: "error",
              buildError: event.message || "Unknown error",
            });
            addBuildLog("stderr", event.message || "Build error");
            addConsoleMessage("error", event.message || "Build error");
            return;
          }

          if (event.type === "done") {
            clearBuildWatchdog();
            unsubscribeCurrentBuild?.();
            unsubscribeCurrentBuild = null;

            if (event.success) {
              const previewUrl = getPreviewUrl(response.buildId);
              set({
                isBuilding: false,
                buildPhase: "success",
                lastPreviewUrl: previewUrl,
                pendingHotReload: runAfterBuild,
              });
              addBuildLog("status", "Build completed successfully!");
              addConsoleMessage("success", "Build completed successfully!");
            } else {
              set({
                isBuilding: false,
                buildPhase: "error",
                buildError: event.message || "Build failed",
              });
              addBuildLog("stderr", event.message || "Build failed");
              addConsoleMessage("error", event.message || "Build failed");
            }
          }
        },
        (error) => {
          // Ignore errors for stale builds
          if (activeBuildId !== response.buildId) return;

          clearBuildWatchdog();
          unsubscribeCurrentBuild?.();
          unsubscribeCurrentBuild = null;

          set({ isBuilding: false, buildPhase: "error", buildError: error.message });
          get().addConsoleMessage("error", `Build stream error: ${error.message}`);
          get().addBuildLog("stderr", `Build stream error: ${error.message}`);
        },
      );
    } catch (err) {
      clearBuildWatchdog();
      unsubscribeCurrentBuild?.();
      unsubscribeCurrentBuild = null;

      const msg = err instanceof Error ? err.message : "Unknown error";
      set({ isBuilding: false, buildPhase: "error", buildError: msg });
      get().addBuildLog("stderr", msg);
      get().addConsoleMessage("error", `Build failed: ${msg}`);
    }
  },

  addCollaborator: (collaborator) => set((state) => ({ collaborators: [...state.collaborators, collaborator] })),

  removeCollaborator: (id) => set((state) => ({ collaborators: state.collaborators.filter((c) => c.id !== id) })),

  updateCollaboratorCursor: (id, cursor) =>
    set((state) => ({
      collaborators: state.collaborators.map((c) => (c.id === id ? { ...c, cursor } : c)),
    })),

  // ============ File Operations ============

  renameFile: (id, newName) => {
    const { currentProject, openTabs } = get();
    if (!currentProject) return;

    const renameInTree = (files: ProjectFile[]): ProjectFile[] =>
      files.map((file) => {
        if (file.id === id) return { ...file, name: newName };
        if (file.children) return { ...file, children: renameInTree(file.children) };
        return file;
      });

    const updatedFiles = renameInTree(currentProject.files);
    const updatedProject = { ...currentProject, files: updatedFiles, updatedAt: new Date() };

    const updatedTabs = openTabs.map((tab) => (tab.fileId === id ? { ...tab, fileName: newName } : tab));

    set((state) => ({
      currentProject: updatedProject,
      projects: state.projects.map((p) => (p.id === currentProject.id ? updatedProject : p)),
      openTabs: updatedTabs,
    }));
  },

  moveFiles: (dragIds, parentId, index) => {
    const { currentProject } = get();
    if (!currentProject) return;

    const removeFromTree = (
      files: ProjectFile[],
      ids: string[],
    ): { remaining: ProjectFile[]; removed: ProjectFile[] } => {
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
          if (!file.children) return file;
          const res = removeFromTree(file.children, ids);
          removed.push(...res.removed);
          return { ...file, children: res.remaining };
        });
      return { remaining, removed };
    };

    const insertIntoTree = (
      files: ProjectFile[],
      targetParentId: string | null,
      insertIndex: number,
      nodesToInsert: ProjectFile[],
    ): ProjectFile[] => {
      if (targetParentId === null) {
        const result = [...files];
        result.splice(
          Math.min(insertIndex, result.length),
          0,
          ...nodesToInsert.map((n) => ({ ...n, parentId: undefined })),
        );
        return result;
      }

      return files.map((file) => {
        if (file.id === targetParentId && file.children) {
          const children = [...file.children];
          children.splice(
            Math.min(insertIndex, children.length),
            0,
            ...nodesToInsert.map((n) => ({ ...n, parentId: targetParentId })),
          );
          return { ...file, children };
        }
        if (file.children)
          return { ...file, children: insertIntoTree(file.children, targetParentId, insertIndex, nodesToInsert) };
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
      id: nowId("file"),
      name: type === "folder" ? "New Folder" : "untitled.c",
      content: type === "folder" ? "" : "// New file\n",
      language: type === "folder" ? "folder" : "c",
      isFolder: type === "folder",
      children: type === "folder" ? [] : undefined,
      parentId: parentId ?? undefined,
    };

    const insertIntoTree = (
      files: ProjectFile[],
      targetParentId: string | null,
      insertIndex: number,
    ): ProjectFile[] => {
      if (targetParentId === null) {
        const result = [...files];
        result.splice(Math.min(insertIndex, result.length), 0, newFile);
        return result;
      }

      return files.map((file) => {
        if (file.id === targetParentId && file.children) {
          const children = [...file.children];
          children.splice(Math.min(insertIndex, children.length), 0, newFile);
          return { ...file, children };
        }
        if (file.children) return { ...file, children: insertIntoTree(file.children, targetParentId, insertIndex) };
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

    const collectAllIds = (files: ProjectFile[], targetIds: string[]): string[] => {
      const all: string[] = [];
      const walk = (f: ProjectFile) => {
        if (targetIds.includes(f.id)) {
          all.push(f.id);
          f.children?.forEach(walk);
        } else {
          f.children?.forEach(walk);
        }
      };
      files.forEach(walk);
      return [...new Set([...targetIds, ...all])];
    };

    const allIdsToDelete = collectAllIds(currentProject.files, ids);

    const removeFromTree = (files: ProjectFile[]): ProjectFile[] =>
      files
        .filter((f) => !allIdsToDelete.includes(f.id))
        .map((f) => (f.children ? { ...f, children: removeFromTree(f.children) } : f));

    const updatedFiles = removeFromTree(currentProject.files);
    const updatedProject = { ...currentProject, files: updatedFiles, updatedAt: new Date() };

    const remainingTabs = openTabs.filter((t) => !allIdsToDelete.includes(t.fileId));
    const newActiveTabId = remainingTabs.length ? remainingTabs[remainingTabs.length - 1].id : null;

    set((state) => ({
      currentProject: updatedProject,
      projects: state.projects.map((p) => (p.id === currentProject.id ? updatedProject : p)),
      openTabs: remainingTabs,
      activeTabId:
        state.activeTabId && allIdsToDelete.includes(openTabs.find((t) => t.id === state.activeTabId)?.fileId || "")
          ? newActiveTabId
          : state.activeTabId,
    }));
  },
}));
