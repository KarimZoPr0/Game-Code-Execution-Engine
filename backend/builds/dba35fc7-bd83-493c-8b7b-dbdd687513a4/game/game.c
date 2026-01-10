#include <emscripten.h>
#include <SDL2/SDL.h>
#include <stdlib.h>
#include <time.h>
#include "game.h"

// ============================================
// LIVE CODING: Edit this file and rebuild!
// The game will hot-reload without refreshing.
// Try changing colors, speeds, or adding features!
// ============================================

static const int PADDLE_SPEED = 8;
static const int BALL_SPEED = 4;

// TRY CHANGING THESE COLORS!
static const SDL_Color COLOR_BG = {20, 50, 48, 255};
static const SDL_Color COLOR_BALL = {255, 200, 100, 255};
static const SDL_Color COLOR_PADDLE = {100, 200, 255, 255};

static inline void set_color(SDL_Renderer *r, SDL_Color c) {
    SDL_SetRenderDrawColor(r, c.r, c.g, c.b, c.a);
}

static void reset_ball(GameContext *ctx) {
    ctx->ballX = WINDOW_WIDTH / 2.0f;
    ctx->ballY = WINDOW_HEIGHT / 2.0f;
    ctx->ballVelX = (rand() % 2 ? 1 : -1) * BALL_SPEED;
    ctx->ballVelY = -BALL_SPEED;
}

static void handle_input(GameContext *ctx) {
    SDL_Event e;
    while (SDL_PollEvent(&e)) {
        switch (e.type) {
        case SDL_KEYDOWN:
            if (e.key.keysym.sym == SDLK_LEFT || e.key.keysym.sym == SDLK_a) 
                ctx->keyLeftHeld = true;
            if (e.key.keysym.sym == SDLK_RIGHT || e.key.keysym.sym == SDLK_d) 
                ctx->keyRightHeld = true;
            break;
        case SDL_KEYUP:
            if (e.key.keysym.sym == SDLK_LEFT || e.key.keysym.sym == SDLK_a) 
                ctx->keyLeftHeld = false;
            if (e.key.keysym.sym == SDLK_RIGHT || e.key.keysym.sym == SDLK_d) 
                ctx->keyRightHeld = false;
            break;
        }
    }
}

static void update_paddle(GameContext *ctx) {
    int dx = (ctx->keyRightHeld - ctx->keyLeftHeld) * PADDLE_SPEED;
    ctx->paddleX += dx;
    if (ctx->paddleX < 0) ctx->paddleX = 0;
    if (ctx->paddleX > WINDOW_WIDTH - ctx->paddleWidth) 
        ctx->paddleX = WINDOW_WIDTH - ctx->paddleWidth;
}

static void update_ball(GameContext *ctx) {
    ctx->ballX += ctx->ballVelX;
    ctx->ballY += ctx->ballVelY;
    
    // Wall bounces
    if (ctx->ballX <= 0 || ctx->ballX + ctx->ballSize >= WINDOW_WIDTH) {
        ctx->ballVelX = -ctx->ballVelX;
    }
    if (ctx->ballY <= 0) {
        ctx->ballVelY = -ctx->ballVelY;
    }
    
    // Paddle collision
    SDL_Rect ball = {(int)ctx->ballX, (int)ctx->ballY, ctx->ballSize, ctx->ballSize};
    SDL_Rect paddle = {ctx->paddleX, ctx->paddleY, ctx->paddleWidth, ctx->paddleHeight};
    
    if (SDL_HasIntersection(&ball, &paddle) && ctx->ballVelY > 0) {
        ctx->ballVelY = -ctx->ballVelY;
        ctx->score++;
    }
    
    // Ball out of bounds
    if (ctx->ballY > WINDOW_HEIGHT) {
        reset_ball(ctx);
        ctx->score = 0;
    }
}

static void render(GameContext *ctx) {
    SDL_Renderer *r = ctx->renderer;
    
    set_color(r, COLOR_BG);
    SDL_RenderClear(r);
    
    // Draw ball
    set_color(r, COLOR_BALL);
    SDL_Rect ball = {(int)ctx->ballX, (int)ctx->ballY, ctx->ballSize, ctx->ballSize};
    SDL_RenderFillRect(r, &ball);
    
    // Draw paddle
    set_color(r, COLOR_PADDLE);
    SDL_Rect paddle = {ctx->paddleX, ctx->paddleY, ctx->paddleWidth, ctx->paddleHeight};
    SDL_RenderFillRect(r, &paddle);
    
    SDL_RenderPresent(r);
}

EMSCRIPTEN_KEEPALIVE
void update_and_render(GameContext *ctx) {
    if (!ctx->initialized) {
        srand((unsigned)time(NULL));
        
        ctx->paddleWidth = 100;
        ctx->paddleHeight = 15;
        ctx->paddleX = (WINDOW_WIDTH - ctx->paddleWidth) / 2;
        ctx->paddleY = WINDOW_HEIGHT - 40;
        
        ctx->ballSize = 15;
        reset_ball(ctx);
        
        ctx->score = 0;
        ctx->initialized = true;
    }
    
    handle_input(ctx);
    update_paddle(ctx);
    update_ball(ctx);
    render(ctx);
}
