import { create } from 'zustand';
import { Project, ProjectFile, OpenTab, ConsoleMessage, Collaborator, BuildTarget } from '@/types/playground';

const defaultMainC = `#include <stdio.h>
#include <SDL2/SDL.h>

int main(int argc, char* argv[]) {
    if (SDL_Init(SDL_INIT_VIDEO) < 0) {
        printf("SDL could not initialize! SDL_Error: %s\\n", SDL_GetError());
        return 1;
    }

    SDL_Window* window = SDL_CreateWindow(
        "SDL Game",
        SDL_WINDOWPOS_UNDEFINED,
        SDL_WINDOWPOS_UNDEFINED,
        800, 600,
        SDL_WINDOW_SHOWN
    );

    if (window == NULL) {
        printf("Window could not be created! SDL_Error: %s\\n", SDL_GetError());
        return 1;
    }

    SDL_Renderer* renderer = SDL_CreateRenderer(window, -1, SDL_RENDERER_ACCELERATED);
    
    int running = 1;
    SDL_Event event;

    while (running) {
        while (SDL_PollEvent(&event)) {
            if (event.type == SDL_QUIT) {
                running = 0;
            }
        }

        SDL_SetRenderDrawColor(renderer, 20, 20, 30, 255);
        SDL_RenderClear(renderer);
        
        // Draw a cyan rectangle
        SDL_SetRenderDrawColor(renderer, 45, 212, 191, 255);
        SDL_Rect rect = {350, 250, 100, 100};
        SDL_RenderFillRect(renderer, &rect);
        
        SDL_RenderPresent(renderer);
    }

    SDL_DestroyRenderer(renderer);
    SDL_DestroyWindow(window);
    SDL_Quit();
    return 0;
}`;

const defaultGameC = `#include "game.h"
#include <SDL2/SDL.h>

static int player_x = 400;
static int player_y = 300;
static int player_speed = 5;

void game_init(void) {
    player_x = 400;
    player_y = 300;
}

void game_update(const Uint8* keys) {
    if (keys[SDL_SCANCODE_W] || keys[SDL_SCANCODE_UP]) {
        player_y -= player_speed;
    }
    if (keys[SDL_SCANCODE_S] || keys[SDL_SCANCODE_DOWN]) {
        player_y += player_speed;
    }
    if (keys[SDL_SCANCODE_A] || keys[SDL_SCANCODE_LEFT]) {
        player_x -= player_speed;
    }
    if (keys[SDL_SCANCODE_D] || keys[SDL_SCANCODE_RIGHT]) {
        player_x += player_speed;
    }
}

void game_render(SDL_Renderer* renderer) {
    // Draw player
    SDL_SetRenderDrawColor(renderer, 45, 212, 191, 255);
    SDL_Rect player_rect = {player_x - 25, player_y - 25, 50, 50};
    SDL_RenderFillRect(renderer, &player_rect);
}

void game_cleanup(void) {
    // Cleanup game resources
}`;

const defaultGameH = `#ifndef GAME_H
#define GAME_H

#include <SDL2/SDL.h>

void game_init(void);
void game_update(const Uint8* keys);
void game_render(SDL_Renderer* renderer);
void game_cleanup(void);

#endif`;

const defaultMakefile = `CC = gcc
CFLAGS = -Wall -Wextra -std=c99
LDFLAGS = -lSDL2 -lSDL2_image -lSDL2_ttf

SRC = src/main.c src/game.c
OBJ = $(SRC:.c=.o)
TARGET = game

all: $(TARGET)

$(TARGET): $(OBJ)
\t$(CC) $(OBJ) -o $@ $(LDFLAGS)

%.o: %.c
\t$(CC) $(CFLAGS) -c $< -o $@

game:
\t$(CC) $(CFLAGS) src/game.c -c -o src/game.o
\t$(CC) src/game.o -o game_module $(LDFLAGS)

main:
\t$(CC) $(CFLAGS) src/main.c -c -o src/main.o

clean:
\trm -f $(OBJ) $(TARGET)

.PHONY: all clean game main`;

const defaultProject: Project = {
  id: 'default-project',
  name: 'My SDL Game',
  files: [
    {
      id: 'src',
      name: 'src',
      content: '',
      language: 'folder',
      isFolder: true,
      children: [
        { id: 'main-c', name: 'main.c', content: defaultMainC, language: 'c', isFolder: false, parentId: 'src' },
        { id: 'game-c', name: 'game.c', content: defaultGameC, language: 'c', isFolder: false, parentId: 'src' },
        { id: 'game-h', name: 'game.h', content: defaultGameH, language: 'c', isFolder: false, parentId: 'src' },
      ],
    },
    { id: 'makefile', name: 'Makefile', content: defaultMakefile, language: 'makefile', isFolder: false },
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
  buildTarget: BuildTarget;
  
  // Actions
  setCurrentProject: (project: Project) => void;
  createProject: (name: string) => void;
  openFile: (file: ProjectFile) => void;
  closeTab: (tabId: string) => void;
  setActiveTab: (tabId: string) => void;
  updateFileContent: (tabId: string, content: string) => void;
  addConsoleMessage: (type: ConsoleMessage['type'], message: string) => void;
  clearConsole: () => void;
  startBuild: (target: BuildTarget) => void;
  addCollaborator: (collaborator: Collaborator) => void;
  removeCollaborator: (id: string) => void;
  updateCollaboratorCursor: (id: string, cursor: { x: number; y: number }) => void;
}

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
  buildTarget: 'all',

  setCurrentProject: (project) => set({ currentProject: project }),

  createProject: (name) => {
    const newProject: Project = {
      id: `project-${Date.now()}`,
      name,
      files: [
        {
          id: `src-${Date.now()}`,
          name: 'src',
          content: '',
          language: 'folder',
          isFolder: true,
          children: [
            { id: `main-${Date.now()}`, name: 'main.c', content: '// Start coding here\n#include <stdio.h>\n\nint main() {\n    printf("Hello, World!\\n");\n    return 0;\n}\n', language: 'c', isFolder: false },
          ],
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

  startBuild: (target) => {
    set({ isBuilding: true, buildTarget: target });
    const { addConsoleMessage } = get();
    
    addConsoleMessage('info', `Starting build: ${target}...`);
    
    setTimeout(() => {
      addConsoleMessage('info', 'Compiling source files...');
    }, 500);

    setTimeout(() => {
      addConsoleMessage('success', `Build ${target} completed successfully!`);
      set({ isBuilding: false });
    }, 2000);
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
}));
