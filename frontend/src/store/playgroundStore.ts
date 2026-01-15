import { create } from "zustand";
import * as FlexLayout from "flexlayout-react";
import {
  submitBuild as apiSubmitBuild,
  subscribeToBuild,
  getPreviewUrl,
  BuildConfig,
  BuildMode,
  BuildEvent,
} from "@/lib/api";

// ============================================================================
// TYPES
// ============================================================================

export interface ProjectFile {
  id: string;
  name: string;
  content: string;
  language: string;
  isFolder: boolean;
  children?: ProjectFile[];
  isBase64?: boolean;
}

export interface Project {
  id: string;
  name: string;
  files: ProjectFile[];
  createdAt: Date;
  updatedAt: Date;
}

export interface OpenTab {
  id: string;
  fileId: string;
  fileName: string;
  content: string;
  language: string;
  isDirty: boolean;
  isBase64?: boolean;
}

export interface ConsoleMessage {
  id: string;
  type: "info" | "warning" | "error" | "success";
  message: string;
  timestamp: Date;
}

export interface BuildLogEntry {
  id: string;
  type: "stdout" | "stderr" | "status";
  message: string;
  timestamp: Date;
}

export type BuildPhase = "idle" | "queued" | "building" | "compiling" | "linking" | "success" | "error";

// ============================================================================
// FALLBACK DEFAULT TEMPLATE (minimal, used if templates fail to load)
// ============================================================================

const fallbackMainC = `#include <SDL2/SDL.h>
#include <emscripten.h>
#include <stdbool.h>

#define SCREEN_WIDTH 640
#define SCREEN_HEIGHT 480

typedef struct {
    SDL_Window* window;
    SDL_Renderer* renderer;
    bool running;
    float x, y;
    float vx, vy;
    int size;
} GameState;

GameState game;

void init() {
    SDL_Init(SDL_INIT_VIDEO);
    game.window = SDL_CreateWindow("SDL Demo",
        SDL_WINDOWPOS_CENTERED, SDL_WINDOWPOS_CENTERED,
        SCREEN_WIDTH, SCREEN_HEIGHT, 0);
    game.renderer = SDL_CreateRenderer(game.window, -1, SDL_RENDERER_ACCELERATED);
    game.running = true;
    game.size = 50;
    game.x = (SCREEN_WIDTH - game.size) / 2.0f;
    game.y = (SCREEN_HEIGHT - game.size) / 2.0f;
    game.vx = 3.0f;
    game.vy = 2.0f;
}

void handle_events() {
    SDL_Event event;
    while (SDL_PollEvent(&event)) {
        if (event.type == SDL_QUIT) game.running = false;
        if (event.type == SDL_KEYDOWN && event.key.keysym.sym == SDLK_r) {
            game.x = (SCREEN_WIDTH - game.size) / 2.0f;
            game.y = (SCREEN_HEIGHT - game.size) / 2.0f;
        }
    }
}

void update() {
    game.x += game.vx;
    game.y += game.vy;
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
    SDL_SetRenderDrawColor(game.renderer, 30, 41, 59, 255);
    SDL_RenderClear(game.renderer);
    SDL_SetRenderDrawColor(game.renderer, 99, 102, 241, 255);
    SDL_Rect rect = { (int)game.x, (int)game.y, game.size, game.size };
    SDL_RenderFillRect(game.renderer, &rect);
    SDL_RenderPresent(game.renderer);
}

void main_loop() {
    handle_events();
    update();
    render();
}

int main(int argc, char* argv[]) {
    init();
    emscripten_set_main_loop(main_loop, 60, 1);
    SDL_DestroyRenderer(game.renderer);
    SDL_DestroyWindow(game.window);
    SDL_Quit();
    return 0;
}`;

const fallbackBuildConfig = `{
  "debug": [
    "-sUSE_SDL=2",
    "-sALLOW_MEMORY_GROWTH=1",
    "-sWASM=1",
    "-sASSERTIONS=1",
    "-O0"
  ],
  "release": [
    "-sUSE_SDL=2",
    "-sALLOW_MEMORY_GROWTH=1",
    "-sWASM=1",
    "-O2"
  ]
}`;

// Minimal fallback project (used if templates fail to load)
const fallbackProject: Project = {
  id: "fallback-project",
  name: "Simple SDL Demo",
  files: [
    { id: "main-c", name: "main.c", content: fallbackMainC, language: "c", isFolder: false },
    { id: "build-config", name: "build_config.json", content: fallbackBuildConfig, language: "json", isFolder: false },
  ],
  createdAt: new Date(),
  updatedAt: new Date(),
};

// ============================================================================
// STORE INTERFACE
// ============================================================================

interface PlaygroundState {
  projects: Project[];
  currentProject: Project | null;
  openTabs: OpenTab[];
  activeTabId: string | null;
  consoleMessages: ConsoleMessage[];
  isBuilding: boolean;

  // Template loading state
  templatesLoaded: boolean;
  templatesLoading: boolean;

  // Build state
  lastBuildId: string | null;
  lastMainBuildId: string | null;
  lastPreviewUrl: string | null;
  buildPhase: BuildPhase;
  buildLogs: BuildLogEntry[];
  buildError: string | null;

  // Hot-reload state
  hotReloadReady: boolean;
  hotReloadTimestamp: number | null;
  isLiveCodingProject: boolean;
  pendingHotReload: boolean;

  // Build config
  buildConfig: BuildConfig | null;
  selectedProfile: string | null;

  // Layout
  layoutModel: FlexLayout.Model | null;

  // Actions
  setCurrentProject: (project: Project) => void;
  openFile: (file: ProjectFile) => void;
  closeTab: (tabId: string) => void;
  setActiveTab: (tabId: string) => void;
  updateFileContent: (tabId: string, content: string) => void;
  addConsoleMessage: (type: ConsoleMessage["type"], message: string) => void;
  clearConsole: () => void;
  createProject: (name: string) => void;

  // Template actions
  loadTemplates: () => Promise<void>;
  setProjects: (projects: Project[]) => void;

  // Build actions
  submitBuild: (mode?: 'full' | 'game-only' | 'auto') => Promise<void>;
  addBuildLog: (type: BuildLogEntry["type"], message: string) => void;
  clearBuildLogs: () => void;
  syncTabsToProject: () => void;

  // Hot-reload actions
  triggerHotReload: () => void;
  clearHotReloadState: () => void;
  clearPendingHotReload: () => void;

  // Build config actions
  setBuildConfig: (config: BuildConfig | null) => void;
  setSelectedProfile: (profile: string | null) => void;

  // Layout actions
  setLayoutModel: (model: FlexLayout.Model) => void;
  ensureEditorVisible: () => void;

  // Panel actions
  addPreviewPanel: () => void;

  // File tree actions
  renameFile: (fileId: string, newName: string) => void;
  createFile: (parentId: string | null, index: number, type: 'file' | 'folder') => ProjectFile | null;
  deleteFiles: (fileIds: string[]) => void;
  moveFiles: (dragIds: string[], parentId: string | null, index: number) => void;
  addFiles: (files: { name: string; content: string; isBase64?: boolean }[], parentId?: string | null) => void;
  addFolders: (folders: ProjectFile[], parentId?: string | null) => void;
}

// ============================================================================
// HELPERS
// ============================================================================

const flattenFiles = (files: ProjectFile[], parentPath = ""): { path: string; content: string; name: string; isBase64?: boolean }[] => {
  const out: { path: string; content: string; name: string; isBase64?: boolean }[] = [];
  for (const file of files) {
    const filePath = parentPath ? `${parentPath}/${file.name}` : file.name;
    if (!file.isFolder) out.push({ path: filePath, content: file.content, name: file.name, isBase64: file.isBase64 });
    if (file.children) out.push(...flattenFiles(file.children, filePath));
  }
  return out;
};

const nowId = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

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

const detectLiveCodingProject = (project: Project): boolean => {
  const allFiles = flattenFiles(project.files);
  const hasMainModule = allFiles.some(f =>
    f.name === 'sdl_app.c' ||
    f.content.includes('set_update_and_render_func')
  );
  const hasGameModule = allFiles.some(f =>
    f.path.includes('game/game.c') ||
    (f.content.includes('EMSCRIPTEN_KEEPALIVE') && f.content.includes('update_and_render'))
  );
  return hasMainModule && hasGameModule;
};

// Module-scoped variables
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

// ============================================================================
// STORE
// ============================================================================

export const usePlaygroundStore = create<PlaygroundState>((set, get) => ({
  projects: [fallbackProject],
  currentProject: fallbackProject,
  openTabs: [],
  activeTabId: null,
  consoleMessages: [],
  isBuilding: false,

  // Template loading state
  templatesLoaded: false,
  templatesLoading: false,

  // Build state
  lastBuildId: null,
  lastMainBuildId: null,
  lastPreviewUrl: null,
  buildPhase: "idle",
  buildLogs: [],
  buildError: null,

  // Hot-reload state
  hotReloadReady: false,
  hotReloadTimestamp: null,
  isLiveCodingProject: false,
  pendingHotReload: false,

  // Build config
  buildConfig: null,
  selectedProfile: null,

  // Layout
  layoutModel: null,

  // Build config actions
  setBuildConfig: (config) => set({ buildConfig: config }),
  setSelectedProfile: (profile) => set({ selectedProfile: profile }),

  // Layout actions
  setLayoutModel: (model) => set({ layoutModel: model }),
  ensureEditorVisible: () => {
    const { layoutModel } = get();
    if (layoutModel) {
      // Layout model is set, editor should be visible
    }
  },

  addPreviewPanel: () => {
    const { layoutModel } = get();
    if (!layoutModel) return;

    let added = false;
    // First, try to find a tabset that already contains a preview component
    layoutModel.visitNodes((node) => {
      if (!added && node.getType() === "tabset") {
        const tabsetNode = node as FlexLayout.TabSetNode;
        const children = tabsetNode.getChildren();

        // Check if this tabset contains any preview tabs
        const hasPreview = children.some((child) => {
          if (child.getType() === "tab") {
            const tabNode = child as FlexLayout.TabNode;
            return tabNode.getComponent() === "preview";
          }
          return false;
        });

        if (hasPreview) {
          layoutModel.doAction(
            FlexLayout.Actions.addNode({
              type: "tab",
              component: "preview",
              name: "Preview " + (Math.floor(Math.random() * 1000)),
              enableClose: true,
            }, tabsetNode.getId(), FlexLayout.DockLocation.CENTER, -1)
          );
          added = true;
        }
      }
    });

    // Fallback: if no preview tabset found, add to any non-file-tree tabset
    if (!added) {
      layoutModel.visitNodes((node) => {
        if (!added && node.getType() === "tabset") {
          const tabsetNode = node as FlexLayout.TabSetNode;
          const children = tabsetNode.getChildren();

          // Skip file tree tabsets
          const isFileTree = children.some((child) => {
            if (child.getType() === "tab") {
              const tabNode = child as FlexLayout.TabNode;
              return tabNode.getComponent() === "filetree";
            }
            return false;
          });

          if (!isFileTree) {
            layoutModel.doAction(
              FlexLayout.Actions.addNode({
                type: "tab",
                component: "preview",
                name: "Preview " + (Math.floor(Math.random() * 1000)),
                enableClose: true,
              }, tabsetNode.getId(), FlexLayout.DockLocation.CENTER, -1)
            );
            added = true;
          }
        }
      });
    }
  },

  // Template actions
  loadTemplates: async () => {
    const { templatesLoading, templatesLoaded, setCurrentProject } = get();
    if (templatesLoading || templatesLoaded) return;

    set({ templatesLoading: true });

    try {
      const { loadAllTemplates } = await import("@/lib/templateLoader");
      const loadedTemplates = await loadAllTemplates();

      if (loadedTemplates.length > 0) {
        set({
          projects: loadedTemplates,
          templatesLoaded: true,
          templatesLoading: false,
        });
        // Use setCurrentProject to properly initialize buildConfig
        setCurrentProject(loadedTemplates[0]);
      } else {
        set({ templatesLoaded: true, templatesLoading: false });
      }
    } catch (error) {
      console.error("Failed to load templates:", error);
      set({ templatesLoaded: true, templatesLoading: false });
    }
  },

  setProjects: (projects) => set({ projects }),

  setCurrentProject: (project) => {
    const isLiveCoding = detectLiveCodingProject(project);

    // Load build config
    const configFile = project.files.find(f => f.name === "build_config.json");
    let config: BuildConfig | null = null;
    if (configFile?.content) {
      try {
        config = JSON.parse(configFile.content);
      } catch { }
    }

    set({
      currentProject: project,
      openTabs: [],
      activeTabId: null,
      isLiveCodingProject: isLiveCoding,
      buildConfig: config,
      selectedProfile: null,
      lastMainBuildId: null,
      lastPreviewUrl: null,
    });
  },

  createProject: (name: string) => {
    const newProject: Project = {
      id: nowId("proj"),
      name,
      files: [
        { id: nowId("main"), name: "main.c", content: fallbackMainC, language: "c", isFolder: false },
        { id: nowId("conf"), name: "build_config.json", content: fallbackBuildConfig, language: "json", isFolder: false },
      ],
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    set((state) => ({
      projects: [...state.projects, newProject],
      currentProject: newProject,
      openTabs: [],
      activeTabId: null,
      isLiveCodingProject: false,
      buildConfig: JSON.parse(fallbackBuildConfig),
    }));
  },

  openFile: (file) => {
    if (file.isFolder) return;

    const { openTabs } = get();
    const existingTab = openTabs.find((t) => t.fileId === file.id);

    if (existingTab) {
      set({ activeTabId: existingTab.id });
    } else {
      const newTab: OpenTab = {
        id: nowId("tab"),
        fileId: file.id,
        fileName: file.name,
        content: file.content,
        language: file.language,
        isDirty: false,
        isBase64: file.isBase64,
      };
      set({ openTabs: [...openTabs, newTab], activeTabId: newTab.id });
    }
  },

  closeTab: (tabId) => {
    const { openTabs, activeTabId } = get();
    const newTabs = openTabs.filter((t) => t.id !== tabId);
    const newActiveId = activeTabId === tabId
      ? (newTabs.length > 0 ? newTabs[newTabs.length - 1].id : null)
      : activeTabId;
    set({ openTabs: newTabs, activeTabId: newActiveId });
  },

  setActiveTab: (tabId) => set({ activeTabId: tabId }),

  updateFileContent: (tabId, content) => {
    const { openTabs } = get();
    const tab = openTabs.find((t) => t.id === tabId);

    // If editing build_config.json, sync to buildConfig state
    if (tab?.fileName === "build_config.json") {
      try {
        const config = JSON.parse(content);
        set({ buildConfig: config });
      } catch { /* ignore parse errors while typing */ }
    }

    const updatedTabs = openTabs.map((t) =>
      t.id === tabId ? { ...t, content, isDirty: true } : t
    );
    set({ openTabs: updatedTabs });
  },

  addConsoleMessage: (type, message) => {
    const newMessage: ConsoleMessage = {
      id: nowId("msg"),
      type,
      message,
      timestamp: new Date(),
    };
    set((state) => ({
      consoleMessages: [...state.consoleMessages.slice(-99), newMessage],
    }));
  },

  clearConsole: () => set({ consoleMessages: [] }),

  addBuildLog: (type, message) => {
    const entry: BuildLogEntry = {
      id: nowId("log"),
      type,
      message,
      timestamp: new Date(),
    };
    set((state) => ({ buildLogs: [...state.buildLogs.slice(-199), entry] }));
  },

  clearBuildLogs: () => set({ buildLogs: [] }),

  syncTabsToProject: () => {
    const { currentProject, openTabs } = get();
    if (!currentProject) return;

    const updateContent = (files: ProjectFile[]): ProjectFile[] =>
      files.map((f) => {
        const tab = openTabs.find((t) => t.fileId === f.id);
        if (tab && tab.isDirty) {
          return { ...f, content: tab.content };
        }
        if (f.children) {
          return { ...f, children: updateContent(f.children) };
        }
        return f;
      });

    const updatedFiles = updateContent(currentProject.files);
    const updatedProject = { ...currentProject, files: updatedFiles, updatedAt: new Date() };

    const clearedTabs = openTabs.map((t) => ({ ...t, isDirty: false }));

    set({
      currentProject: updatedProject,
      openTabs: clearedTabs,
      projects: get().projects.map((p) => (p.id === currentProject.id ? updatedProject : p)),
    });
  },

  triggerHotReload: () => {
    set({ hotReloadReady: true, hotReloadTimestamp: Date.now() });
  },

  clearHotReloadState: () => {
    set({ hotReloadReady: false, hotReloadTimestamp: null });
  },

  clearPendingHotReload: () => {
    set({ pendingHotReload: false });
  },

  // ============================================================================
  // SUBMIT BUILD
  // ============================================================================

  submitBuild: async (mode: 'full' | 'game-only' | 'auto' = 'auto') => {
    const {
      currentProject,
      syncTabsToProject,
      addBuildLog,
      clearBuildLogs,
      addConsoleMessage,
      buildConfig,
      lastMainBuildId,
      isLiveCodingProject,
    } = get();

    if (!currentProject) {
      addConsoleMessage("error", "No project selected");
      return;
    }

    // Kill previous stream
    unsubscribeCurrentBuild?.();
    unsubscribeCurrentBuild = null;
    clearBuildWatchdog();

    // Sync dirty tabs
    syncTabsToProject();

    // Reset build UI
    clearBuildLogs();
    set({
      isBuilding: true,
      buildPhase: "queued",
      buildError: null,
      hotReloadReady: false,
      hotReloadTimestamp: null,
    });

    const buildStartTime = Date.now();

    try {
      const freshProject = get().currentProject;
      if (!freshProject) throw new Error("Project not found");

      const allFiles = flattenFiles(freshProject.files);
      const cFiles = allFiles.filter((f) => f.name.endsWith(".c"));
      const cppFiles = allFiles.filter((f) => f.name.endsWith(".cpp") || f.name.endsWith(".cc"));
      const headerFiles = allFiles.filter((f) => f.name.endsWith(".h") || f.name.endsWith(".hpp"));

      // Asset files (images, audio, json, etc.) - binary files are already base64 encoded
      const assetExtensions = ['.png', '.jpg', '.jpeg', '.gif', '.bmp', '.webp', '.svg',
        '.wav', '.mp3', '.ogg', '.flac', '.aac',
        '.json', '.xml', '.txt', '.csv', '.glsl', '.vert', '.frag'];
      const assetFiles = allFiles.filter((f) =>
        assetExtensions.some(ext => f.name.toLowerCase().endsWith(ext))
      );

      if (cFiles.length === 0 && cppFiles.length === 0) {
        throw new Error("No C or C++ source files found");
      }

      const language = cppFiles.length > 0 ? "cpp" : "c";
      const sourceFiles = language === "cpp" ? cppFiles : cFiles;

      // Determine actual build mode
      let actualMode: BuildMode;
      if (mode === 'game-only' && lastMainBuildId && isLiveCodingProject) {
        actualMode = 'game';
      } else if (mode === 'full' || !isLiveCodingProject) {
        actualMode = isLiveCodingProject ? 'full' : 'auto';
      } else {
        actualMode = lastMainBuildId ? 'game' : 'full';
      }

      // Determine which profile to use based on mode and config
      let profileToUse: string[] | null = null;
      let entry: string;
      let profileName = '';

      // Check if user has selected a specific profile
      const { selectedProfile } = get();

      if (buildConfig) {
        // Require explicit profile selection
        if (!selectedProfile) {
          throw new Error("No build profile selected. Please select a profile from the dropdown.");
        }

        if (!buildConfig[selectedProfile]) {
          throw new Error(`Build profile '${selectedProfile}' not found in build_config.json`);
        }

        profileName = selectedProfile;
        profileToUse = buildConfig[profileName];

        // Determine entry point from profile or auto-detect
        if (profileToUse[0] && !profileToUse[0].startsWith('-')) {
          entry = profileToUse[0];
        } else {
          if (actualMode === 'game') {
            const gameFile = sourceFiles.find(f => f.path.includes('game/game.c') || f.path.includes('game/game.cpp'));
            entry = gameFile?.path || 'game/game.c';
          } else {
            const mainFile = sourceFiles.find(f =>
              f.name === 'sdl_app.c' || f.name === 'sdl_app.cpp' ||
              f.name === 'main.c' || f.name === 'main.cpp'
            );
            entry = mainFile?.path || sourceFiles[0]?.path || 'main.c';
          }
        }
      } else {
        throw new Error("No build_config.json found. Please add a build configuration file to your project.");
      }

      // Build files to send: source files, headers, and assets
      const sourceAndHeaders = [...sourceFiles, ...headerFiles].map((f) => ({
        path: f.path.replace(/\\/g, '/'),
        content: f.content,
      }));

      // Binary asset extensions that need base64 encoding
      const binaryExtensions = ['.png', '.jpg', '.jpeg', '.gif', '.bmp', '.webp',
        '.wav', '.mp3', '.ogg', '.flac', '.aac'];

      const assets = assetFiles.map((f) => {
        const isBinary = binaryExtensions.some(ext => f.name.toLowerCase().endsWith(ext));
        return {
          path: f.path.replace(/\\/g, '/'),
          content: f.content,
          isBase64: isBinary || f.isBase64,
        };
      });

      const filesToSend = [...sourceAndHeaders, ...assets];

      const buildProfile = profileToUse ? {
        name: actualMode === 'game' ? 'debug_game' : 'debug_main',
        args: profileToUse,
        entry: profileToUse[0] && !profileToUse[0].startsWith('-') ? profileToUse[0] : undefined,
        output: profileToUse.includes('-o') ? profileToUse[profileToUse.indexOf('-o') + 1] : undefined,
      } : undefined;

      const response = await apiSubmitBuild({
        files: filesToSend,
        entry: entry.replace(/\\/g, '/'),
        language: language as "c" | "cpp",
        buildProfile,
        targetBuildId: actualMode === 'game' ? lastMainBuildId || undefined : undefined,
      });

      activeBuildId = response.buildId;
      set({ lastBuildId: response.buildId });

      startBuildWatchdog(() => {
        if (activeBuildId !== response.buildId) return;
        unsubscribeCurrentBuild?.();
        unsubscribeCurrentBuild = null;
        const duration = Date.now() - buildStartTime;
        set({ isBuilding: false, buildPhase: "error", buildError: "Build timed out" });
        addConsoleMessage("error", `Build failed (${profileName || actualMode}): Timed out after ${duration}ms`);
      }, 120_000);

      unsubscribeCurrentBuild = subscribeToBuild(
        response.buildId,
        (event: BuildEvent) => {
          if (activeBuildId !== response.buildId) return;

          startBuildWatchdog(() => {
            if (activeBuildId !== response.buildId) return;
            unsubscribeCurrentBuild?.();
            unsubscribeCurrentBuild = null;
            set({ isBuilding: false, buildPhase: "error", buildError: "Build stalled" });
          }, 30_000);

          const phase = normalizePhase(event.phase);
          set({ buildPhase: phase });

          if (event.message) {
            const isErr = phase === "error";
            if (isErr) {
              get().addBuildLog("stderr", event.message);
            }
          }

          if (event.type === "hot-reload-ready") {
            console.log("[Store] Hot-reload ready event received");
            set({
              hotReloadReady: true,
              hotReloadTimestamp: event.timestamp || Date.now()
            });
          }

          if (event.type === "done") {
            clearBuildWatchdog();
            unsubscribeCurrentBuild?.();
            unsubscribeCurrentBuild = null;
            const duration = Date.now() - buildStartTime;

            if (event.success) {
              const effectiveBuildId = actualMode === 'game' && lastMainBuildId
                ? lastMainBuildId
                : response.buildId;
              const previewUrl = getPreviewUrl(effectiveBuildId);

              if (actualMode === 'full' || actualMode === 'auto') {
                set({ lastMainBuildId: response.buildId });
              }

              set({
                isBuilding: false,
                lastPreviewUrl: previewUrl,
                buildPhase: "success",
                pendingHotReload: actualMode === 'game',
                isLiveCodingProject: event.isLiveCoding || get().isLiveCodingProject,
              });

              get().addConsoleMessage("success", `Build successful (${profileName || actualMode}): ${duration}ms`);
            } else {
              set({ isBuilding: false, buildError: event.message || "Build failed" });
              get().addConsoleMessage("error", `Build failed (${profileName || actualMode}): ${event.message || "Unknown error"} - ${duration}ms`);
            }
          }

          if (event.type === "error" || phase === "error") {
            clearBuildWatchdog();
            unsubscribeCurrentBuild?.();
            unsubscribeCurrentBuild = null;
            const duration = Date.now() - buildStartTime;

            set({ isBuilding: false, buildError: event.message || "Build failed" });
            get().addConsoleMessage("error", `Build failed (${profileName || actualMode}): ${event.message || "Unknown error"} - ${duration}ms`);
          }
        },
        (err) => {
          if (activeBuildId !== response.buildId) return;
          clearBuildWatchdog();
          unsubscribeCurrentBuild = null;
          const duration = Date.now() - buildStartTime;

          set({ isBuilding: false, buildPhase: "error", buildError: err.message });
          addConsoleMessage("error", `Build failed (${profileName || actualMode}): ${err.message} - ${duration}ms`);
        }
      );

    } catch (err: unknown) {
      clearBuildWatchdog();
      const message = err instanceof Error ? err.message : String(err);
      const duration = Date.now() - buildStartTime;
      set({ isBuilding: false, buildPhase: "error", buildError: message });
      addConsoleMessage("error", `Build failed: ${message} - ${duration}ms`);
    }
  },

  // ============================================================================
  // FILE TREE ACTIONS
  // ============================================================================

  renameFile: (fileId: string, newName: string) => {
    const { currentProject, openTabs } = get();
    if (!currentProject) return;

    // Check if we are trying to rename build_config.json
    const isProtected = (files: ProjectFile[]): boolean => {
      for (const f of files) {
        if (f.id === fileId) {
          return f.name === 'build_config.json';
        }
        if (f.children && isProtected(f.children)) return true;
      }
      return false;
    };

    if (isProtected(currentProject.files)) {
      return; // Cannot rename build_config.json
    }

    const updateFilesRecursive = (files: ProjectFile[]): ProjectFile[] => {
      return files.map((f) => {
        if (f.id === fileId) {
          return { ...f, name: newName };
        }
        if (f.children) {
          return { ...f, children: updateFilesRecursive(f.children) };
        }
        return f;
      });
    };

    const updatedFiles = updateFilesRecursive(currentProject.files);
    const updatedProject = { ...currentProject, files: updatedFiles, updatedAt: new Date() };

    const updatedTabs = openTabs.map((tab) =>
      tab.fileId === fileId ? { ...tab, fileName: newName } : tab
    );

    set({
      currentProject: updatedProject,
      openTabs: updatedTabs,
      projects: get().projects.map((p) => (p.id === currentProject.id ? updatedProject : p)),
    });
  },

  createFile: (parentId: string | null, index: number, type: 'file' | 'folder') => {
    const { currentProject } = get();
    if (!currentProject) return null;

    const isFolder = type === 'folder';
    const baseName = isFolder ? 'New Folder' : 'new_file.c';
    const newFile: ProjectFile = {
      id: nowId(isFolder ? 'folder' : 'file'),
      name: baseName,
      content: '',
      language: isFolder ? '' : 'c',
      isFolder,
      children: isFolder ? [] : undefined,
    };

    const insertIntoFiles = (files: ProjectFile[], targetParentId: string | null): ProjectFile[] => {
      if (targetParentId === null) {
        const newFiles = [...files];
        newFiles.splice(index, 0, newFile);
        return newFiles;
      }

      return files.map((f) => {
        if (f.id === targetParentId && f.isFolder) {
          const children = f.children ? [...f.children] : [];
          children.splice(index, 0, newFile);
          return { ...f, children };
        }
        if (f.children) {
          return { ...f, children: insertIntoFiles(f.children, targetParentId) };
        }
        return f;
      });
    };

    const updatedFiles = insertIntoFiles(currentProject.files, parentId);
    const updatedProject = { ...currentProject, files: updatedFiles, updatedAt: new Date() };

    set({
      currentProject: updatedProject,
      projects: get().projects.map((p) => (p.id === currentProject.id ? updatedProject : p)),
    });

    return newFile;
  },

  deleteFiles: (fileIds: string[]) => {
    const { currentProject, openTabs, activeTabId } = get();
    if (!currentProject) return;

    // Find protected file IDs (build_config.json cannot be deleted)
    const findProtectedIds = (files: ProjectFile[]): Set<string> => {
      const ids = new Set<string>();
      for (const f of files) {
        if (f.name === 'build_config.json') ids.add(f.id);
        if (f.children) {
          for (const id of findProtectedIds(f.children)) ids.add(id);
        }
      }
      return ids;
    };
    const protectedIds = findProtectedIds(currentProject.files);

    // Filter out protected files from deletion
    const fileIdSet = new Set(fileIds.filter(id => !protectedIds.has(id)));
    if (fileIdSet.size === 0) return; // Nothing to delete

    const removeFilesRecursive = (files: ProjectFile[]): ProjectFile[] => {
      return files
        .filter((f) => !fileIdSet.has(f.id))
        .map((f) => {
          if (f.children) {
            return { ...f, children: removeFilesRecursive(f.children) };
          }
          return f;
        });
    };

    const updatedFiles = removeFilesRecursive(currentProject.files);
    const updatedProject = { ...currentProject, files: updatedFiles, updatedAt: new Date() };

    const remainingTabs = openTabs.filter((tab) => !fileIdSet.has(tab.fileId));
    const newActiveTabId = fileIdSet.has(activeTabId || '')
      ? (remainingTabs.length > 0 ? remainingTabs[remainingTabs.length - 1].id : null)
      : activeTabId;

    set({
      currentProject: updatedProject,
      openTabs: remainingTabs,
      activeTabId: newActiveTabId,
      projects: get().projects.map((p) => (p.id === currentProject.id ? updatedProject : p)),
    });
  },

  moveFiles: (dragIds: string[], parentId: string | null, index: number) => {
    const { currentProject } = get();
    if (!currentProject) return;

    // Find protected file IDs (build_config.json cannot be moved)
    const findProtectedIds = (files: ProjectFile[]): Set<string> => {
      const ids = new Set<string>();
      for (const f of files) {
        if (f.name === 'build_config.json') ids.add(f.id);
        if (f.children) {
          for (const id of findProtectedIds(f.children)) ids.add(id);
        }
      }
      return ids;
    };
    const protectedIds = findProtectedIds(currentProject.files);

    // Filter out protected files from move
    const filteredDragIds = dragIds.filter(id => !protectedIds.has(id));
    if (filteredDragIds.length === 0) return; // Nothing to move

    const dragIdSet = new Set(filteredDragIds);

    const draggedFiles: ProjectFile[] = [];
    const collectDraggedFiles = (files: ProjectFile[]) => {
      for (const f of files) {
        if (dragIdSet.has(f.id)) {
          draggedFiles.push(f);
        }
        if (f.children) {
          collectDraggedFiles(f.children);
        }
      }
    };
    collectDraggedFiles(currentProject.files);

    const removeFilesRecursive = (files: ProjectFile[]): ProjectFile[] => {
      return files
        .filter((f) => !dragIdSet.has(f.id))
        .map((f) => {
          if (f.children) {
            return { ...f, children: removeFilesRecursive(f.children) };
          }
          return f;
        });
    };

    let filesWithoutDragged = removeFilesRecursive(currentProject.files);

    const insertFiles = (files: ProjectFile[], targetParentId: string | null): ProjectFile[] => {
      if (targetParentId === null) {
        const newFiles = [...files];
        newFiles.splice(index, 0, ...draggedFiles);
        return newFiles;
      }

      return files.map((f) => {
        if (f.id === targetParentId && f.isFolder) {
          const children = f.children ? [...f.children] : [];
          children.splice(index, 0, ...draggedFiles);
          return { ...f, children };
        }
        if (f.children) {
          return { ...f, children: insertFiles(f.children, targetParentId) };
        }
        return f;
      });
    };

    const updatedFiles = insertFiles(filesWithoutDragged, parentId);
    const updatedProject = { ...currentProject, files: updatedFiles, updatedAt: new Date() };

    set({
      currentProject: updatedProject,
      projects: get().projects.map((p) => (p.id === currentProject.id ? updatedProject : p)),
    });
  },

  // Add external files to the project (for drag-drop)
  addFiles(files, parentId = null) {
    const { currentProject } = get();
    if (!currentProject) return;

    const newFiles: ProjectFile[] = files.map((f) => ({
      id: nowId('file'),
      name: f.name,
      content: f.content,
      language: f.name.split('.').pop() || 'text',
      isFolder: false,
      isBase64: f.isBase64,
    }));

    // Helper to insert files into parent folder
    const insertIntoParent = (items: ProjectFile[], targetId: string): ProjectFile[] => {
      return items.map((item) => {
        if (item.id === targetId && item.isFolder) {
          return { ...item, children: [...(item.children || []), ...newFiles] };
        }
        if (item.children) {
          return { ...item, children: insertIntoParent(item.children, targetId) };
        }
        return item;
      });
    };

    const updatedFiles = parentId
      ? insertIntoParent(currentProject.files, parentId)
      : [...currentProject.files, ...newFiles];

    const updatedProject = {
      ...currentProject,
      files: updatedFiles,
      updatedAt: new Date(),
    };

    set({
      currentProject: updatedProject,
      projects: get().projects.map((p) => (p.id === currentProject.id ? updatedProject : p)),
    });
  },

  // Add external folders to the project (for drag-drop)
  addFolders(folders, parentId = null) {
    const { currentProject } = get();
    if (!currentProject) return;

    // Helper to insert folders into parent folder
    const insertIntoParent = (items: ProjectFile[], targetId: string): ProjectFile[] => {
      return items.map((item) => {
        if (item.id === targetId && item.isFolder) {
          return { ...item, children: [...(item.children || []), ...folders] };
        }
        if (item.children) {
          return { ...item, children: insertIntoParent(item.children, targetId) };
        }
        return item;
      });
    };

    const updatedFiles = parentId
      ? insertIntoParent(currentProject.files, parentId)
      : [...currentProject.files, ...folders];

    const updatedProject = {
      ...currentProject,
      files: updatedFiles,
      updatedAt: new Date(),
    };

    set({
      currentProject: updatedProject,
      projects: get().projects.map((p) => (p.id === currentProject.id ? updatedProject : p)),
    });
  },
}));

// Export for backwards compatibility
export const defaultProjects = [fallbackProject];
