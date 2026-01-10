#include <emscripten.h>
#include <SDL2/SDL.h>
#include <stdio.h>
#include <stdlib.h>

#include "game/game.h"

GameContext *ctx;

typedef void (*update_and_render_fn)(GameContext*);
static update_and_render_fn update_and_render = NULL;

EMSCRIPTEN_KEEPALIVE
void set_update_and_render_func(update_and_render_fn f) { update_and_render = f; }

static void main_loop(void)
{
    if (update_and_render) update_and_render(ctx);
}

int main(void)
{
    SDL_Init(SDL_INIT_VIDEO);

    SDL_Window *win = SDL_CreateWindow("Live Coding Demo",
                    SDL_WINDOWPOS_CENTERED, SDL_WINDOWPOS_CENTERED,
                    WINDOW_WIDTH, WINDOW_HEIGHT, 0);
    ctx = malloc(sizeof(GameContext));

    ctx->renderer = SDL_CreateRenderer(
        win, -1, SDL_RENDERER_ACCELERATED | SDL_RENDERER_PRESENTVSYNC);

    emscripten_set_main_loop(main_loop, 0, 1);
    return 0;
}
