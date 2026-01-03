import { useEffect, useRef, useCallback } from 'react';
import { usePlaygroundStore } from '@/store/playgroundStore';
import {
  getAllProjects,
  saveProject,
  saveAllProjects,
} from '@/lib/storage/indexedDB';
import {
  getStoredTabs,
  saveTabs,
  getActiveTabId,
  saveActiveTabId,
  getCurrentProjectId,
  saveCurrentProjectId,
  getLastBuild,
  saveLastBuild,
} from '@/lib/storage/localStorage';
import { Project, OpenTab } from '@/types/playground';

// Default project for first-time users
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
    float x, y;
    float vx, vy;
    int size;
} GameState;

GameState game;

void init() {
    SDL_Init(SDL_INIT_VIDEO);
    game.window = SDL_CreateWindow("Nexus Engine - SDL Demo", SDL_WINDOWPOS_CENTERED, SDL_WINDOWPOS_CENTERED, SCREEN_WIDTH, SCREEN_HEIGHT, 0);
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

const createDefaultProject = (): Project => ({
  id: 'default-project',
  name: 'My SDL Game',
  files: [{ id: 'main-c', name: 'main.c', content: defaultMainC, language: 'c', isFolder: false }],
  createdAt: new Date(),
  updatedAt: new Date(),
});

export function useLocalPersistence() {
  const initialized = useRef(false);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const {
    projects,
    currentProject,
    openTabs,
    activeTabId,
    lastBuildId,
    lastPreviewUrl,
  } = usePlaygroundStore();

  // Load persisted state on mount
  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;

    const loadPersistedState = async () => {
      try {
        // Load projects from IndexedDB
        let loadedProjects = await getAllProjects();
        
        // If no projects, create default
        if (loadedProjects.length === 0) {
          const defaultProject = createDefaultProject();
          loadedProjects = [defaultProject];
          await saveAllProjects(loadedProjects);
        }

        // Get saved current project ID
        const savedProjectId = getCurrentProjectId();
        const currentProj = loadedProjects.find((p) => p.id === savedProjectId) || loadedProjects[0];

        // Load saved tabs and restore with content from current project
        const savedTabs = getStoredTabs();
        const restoredTabs: OpenTab[] = [];

        const findFile = (files: typeof currentProj.files, id: string): typeof currentProj.files[0] | undefined => {
          for (const f of files) {
            if (f.id === id) return f;
            if (f.children) {
              const found = findFile(f.children, id);
              if (found) return found;
            }
          }
          return undefined;
        };

        for (const tab of savedTabs) {
          const file = findFile(currentProj.files, tab.fileId);
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

        // Restore active tab
        const savedActiveTabId = getActiveTabId();
        const activeTab = restoredTabs.find((t) => t.id === savedActiveTabId);

        // Load last build info
        const lastBuild = getLastBuild();
        const buildState = lastBuild && lastBuild.projectId === currentProj.id
          ? { lastBuildId: lastBuild.buildId, lastPreviewUrl: lastBuild.previewUrl }
          : {};

        // Update store
        usePlaygroundStore.setState({
          projects: loadedProjects,
          currentProject: currentProj,
          openTabs: restoredTabs,
          activeTabId: activeTab?.id || null,
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
        await saveAllProjects(projects);
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

  // Save tabs
  useEffect(() => {
    if (!initialized.current) return;
    saveTabs(openTabs.map((t) => ({
      id: t.id,
      fileId: t.fileId,
      fileName: t.fileName,
      language: t.language,
    })));
  }, [openTabs]);

  // Save active tab ID
  useEffect(() => {
    if (!initialized.current) return;
    saveActiveTabId(activeTabId);
  }, [activeTabId]);

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
