#ifndef GAME_H
#define GAME_H

#define WINDOW_WIDTH   640
#define WINDOW_HEIGHT  480
#define PADDLE_WIDTH   10
#define PADDLE_HEIGHT  80
#define BALL_SIZE      10

typedef enum {
    GAME_WAITING,
    GAME_PLAYING,
    GAME_SCORE,
    GAME_VICTORY,
    GAME_DISCONNECT
} GameState;

typedef struct {
    SDL_Renderer *renderer;

    int  paddle1Y, paddle2Y;
    int  ballX, ballY;
    int  ballVelX, ballVelY;

    SDL_Rect paddle1Rect, paddle2Rect, ballRect;

    TCPsocket        socket;
    SDLNet_SocketSet socketSet;
    bool             connected;
    unsigned         matchId;
    int              playerType;
    bool             ballOwner;

    bool localReady, remoteReady;

    GameState state;
    int score1, score2;
    int scoreDelayFrames;

    bool keyUpHeld, keyDownHeld;
    bool touchActive;
    SDL_FingerID fingerId;

    int dashOffset;

    bool initialized;

} GameContext;

#endif
