#ifndef GAME_H
#define GAME_H

#include <SDL2/SDL.h>
#include <stdbool.h>

#define WINDOW_WIDTH   640
#define WINDOW_HEIGHT  480
#define MAX_RECTANGLES 1024

typedef struct {
    float x, y;
    float velX, velY;
    int width, height;
    SDL_Color color;
} Rectangle;

typedef struct {
    SDL_Renderer *renderer;
    Rectangle rects[MAX_RECTANGLES];
    bool initialized;
} GameContext;

#endif