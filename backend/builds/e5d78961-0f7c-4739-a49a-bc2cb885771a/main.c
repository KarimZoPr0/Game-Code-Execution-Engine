#include <SDL2/SDL.h>
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
}