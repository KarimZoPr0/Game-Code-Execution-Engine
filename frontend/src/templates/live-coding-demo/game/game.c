#include <emscripten.h>
#include <SDL2/SDL.h>
#include <stdlib.h>
#include <math.h>
#include "game.h"

static const int RECT_COUNT = 8;
static const float SIM_DT = 1.0f;
static const SDL_Color BG_COLOR = {20, 30, 48, 255};

static void handle_collision(Rectangle *a, Rectangle *b) {
    float aR = a->x + a->width, aB = a->y + a->height;
    float bR = b->x + b->width, bB = b->y + b->height;
    
    if (aR <= b->x || a->x >= bR || aB <= b->y || a->y >= bB) return;
    
    float overlapX = fminf(aR - b->x, bR - a->x);
    float overlapY = fminf(aB - b->y, bB - a->y);
    
    if (overlapX < overlapY) {
        if (a->x < b->x) { a->x -= overlapX/2; b->x += overlapX/2; }
        else { a->x += overlapX/2; b->x -= overlapX/2; }
        float t = a->velX; a->velX = b->velX; b->velX = t;
    } else {
        if (a->y < b->y) { a->y -= overlapY/2; b->y += overlapY/2; }
        else { a->y += overlapY/2; b->y -= overlapY/2; }
        float t = a->velY; a->velY = b->velY; b->velY = t;
    }
}

static void init_rects(GameContext *ctx) {
    for (int i = 0; i < MAX_RECTANGLES; i++) {
        Rectangle *r = &ctx->rects[i];
        int size = 20 + (rand() % 40); 
        r->width = size;
        r->height = size;
        r->x = rand() % (WINDOW_WIDTH - size);
        r->y = rand() % (WINDOW_HEIGHT - size);
        float angle = (float)(rand() % 628) / 100.0f;
        float speed = 2.0f + (float)(rand() % 30) / 10.0f;  
        r->velX = cosf(angle) * speed;
        r->velY = sinf(angle) * speed;
        r->color.r = 100 + (rand() % 156);
        r->color.g = 100 + (rand() % 156);
        r->color.b = 100 + (rand() % 156);
        r->color.a = 255;
    }
}

EMSCRIPTEN_KEEPALIVE
void update_and_render(GameContext *ctx) {
    if (!ctx->initialized) {
        init_rects(ctx);
        ctx->initialized = true;
    }
    
    for (int i = 0; i < RECT_COUNT; i++) {
        Rectangle *r = &ctx->rects[i];
        
        r->x += r->velX * SIM_DT;
        r->y += r->velY * SIM_DT;
        
        if (r->x <= 0) { r->x = 0; r->velX = -r->velX; }
        if (r->x + r->width >= WINDOW_WIDTH) { r->x = WINDOW_WIDTH - r->width; r->velX = -r->velX; }
        if (r->y <= 0) { r->y = 0; r->velY = -r->velY; }
        if (r->y + r->height >= WINDOW_HEIGHT) { r->y = WINDOW_HEIGHT - r->height; r->velY = -r->velY; }
    }
    
    for (int i = 0; i < RECT_COUNT; i++) {
        for (int j = i + 1; j < RECT_COUNT; j++) {
            handle_collision(&ctx->rects[i], &ctx->rects[j]);
        }
    }
    
    SDL_SetRenderDrawColor(ctx->renderer, BG_COLOR.r, BG_COLOR.g, BG_COLOR.b, 255);
    SDL_RenderClear(ctx->renderer);
    
    for (int i = 0; i < RECT_COUNT; i++) {
        Rectangle *r = &ctx->rects[i];
        SDL_SetRenderDrawColor(ctx->renderer, r->color.r, r->color.g, r->color.b, 255);
        SDL_Rect rect = {(int)r->x, (int)r->y, r->width, r->height};
        SDL_RenderFillRect(ctx->renderer, &rect);
    }
    
    SDL_RenderPresent(ctx->renderer);
}