#ifndef GAME_H
#define GAME_H

#include <SDL2/SDL.h>
#include <stdbool.h>

#define WINDOW_WIDTH   640
#define WINDOW_HEIGHT  480

typedef struct {
    SDL_Renderer *renderer;
    
    float ballX, ballY;
    float ballVelX, ballVelY;
    int ballSize;
    
    int paddleX, paddleY;
    int paddleWidth, paddleHeight;
    
    bool keyLeftHeld, keyRightHeld;
    
    int score;
    
    bool initialized;
} GameContext;

#endif
