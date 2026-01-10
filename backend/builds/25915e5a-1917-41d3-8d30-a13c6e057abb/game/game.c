#include <emscripten.h>
#include <SDL2/SDL.h>
#include <SDL2/SDL_net.h>
#include <stdlib.h>
#include <time.h>
#include "game.h"

static const int MAX_SCORE = 10;
static const int BALL_SPEED_X = 4;
static const int BALL_SPEED_Y = 4;
static const int PADDLE_SPEED = 5;
static const int GOAL_DELAY_FRAMES = 60;
static const int DASH_SPEED = 1;

static const SDL_Color COLOR_BG = {20, 100, 100, 255};
static const SDL_Color COLOR_PADDLE_LEFT = {255, 255, 255, 255};
static const SDL_Color COLOR_PADDLE_RIGHT = {0, 255, 255, 255};
static const SDL_Color COLOR_BALL = {255, 255, 255, 255};
static const SDL_Color COLOR_DASH = {150, 150, 150, 120};
static const SDL_Color COLOR_SCORE_EMPTY = {80, 80, 80, 255};
static const SDL_Color COLOR_SCORE_FILLED = {255, 255, 255, 255};
static const SDL_Color COLOR_PLAYER_INDICATOR = {255, 255, 255, 255};

static inline void set_color(SDL_Renderer *r, SDL_Color c) {
    SDL_SetRenderDrawColor(r, c.r, c.g, c.b, c.a);
}

typedef struct {
    Uint32 matchId;
    Sint16 paddleY;
    Sint16 ballX, ballY;
    Sint16 velX, velY;
    Uint8 ready;
    Uint8 state;
    Uint8 score1, score2;
} GamePacket;

static void net_try_connect(GameContext *ctx) {
    if (ctx->connected) return;

    IPaddress ip;
    // Connect to local proxy/server
    if (SDLNet_ResolveHost(&ip, "localhost", 1234) != 0) return;

    ctx->socket = SDLNet_TCP_Open(&ip);
    if (!ctx->socket) return;

    ctx->socketSet = SDLNet_AllocSocketSet(1);
    SDLNet_AddSocket(ctx->socketSet, (SDLNet_GenericSocket)ctx->socket);
    ctx->connected = true;

    if (!ctx->matchId)
        ctx->matchId = ((unsigned)rand() << 16) ^ rand();
}

static void net_exchange(GameContext *ctx) {
    if (!ctx->connected) return;

    GamePacket out = {
        ctx->matchId,
        (Sint16)((ctx->playerType == 1) ? ctx->paddle1Y : ctx->paddle2Y),
        ctx->ballX, ctx->ballY,
        ctx->ballVelX, ctx->ballVelY,
        ctx->localReady,
        ctx->state,
        ctx->score1, ctx->score2
    };
    SDLNet_TCP_Send(ctx->socket, &out, sizeof out);

    while (SDLNet_CheckSockets(ctx->socketSet, 0) > 0 && SDLNet_SocketReady(ctx->socket)) {
        GamePacket in;
        int n = SDLNet_TCP_Recv(ctx->socket, &in, sizeof in);
        if (n != sizeof in) {
            SDLNet_TCP_Close(ctx->socket);
            SDLNet_FreeSocketSet(ctx->socketSet);
            ctx->connected = false;
            ctx->state = GAME_DISCONNECT;
            return;
        }

        bool host = ctx->matchId >= in.matchId;
        ctx->playerType = host ? 1 : 2;

        if (host) ctx->paddle2Y = in.paddleY;
        else ctx->paddle1Y = in.paddleY;

        ctx->remoteReady = in.ready;

        if (host) {
            ctx->ballOwner = true;
            if (ctx->state == GAME_WAITING && ctx->localReady && ctx->remoteReady) {
                ctx->state = GAME_PLAYING;
                ctx->ballVelX = (rand() & 1) ? BALL_SPEED_X : -BALL_SPEED_X;
                ctx->ballVelY = (rand() & 1) ? BALL_SPEED_Y : -BALL_SPEED_Y;
            }
        } else {
            ctx->ballOwner = false;
            ctx->ballX = in.ballX;
            ctx->ballY = in.ballY;
            ctx->ballVelX = in.velX;
            ctx->ballVelY = in.velY;
            ctx->state = (GameState)in.state;
            ctx->score1 = in.score1;
            ctx->score2 = in.score2;
        }
    }
}

static void handle_input(GameContext *ctx) {
    SDL_Event e;
    while (SDL_PollEvent(&e)) {
        switch (e.type) {
        case SDL_KEYDOWN:
            if (!e.key.repeat) {
                if (e.key.keysym.sym == SDLK_UP || e.key.keysym.sym == SDLK_w) ctx->keyUpHeld = true;
                if (e.key.keysym.sym == SDLK_DOWN || e.key.keysym.sym == SDLK_s) ctx->keyDownHeld = true;
                if (e.key.keysym.sym == SDLK_SPACE && ctx->state == GAME_WAITING) ctx->localReady ^= 1;
            }
            break;
        case SDL_KEYUP:
            if (e.key.keysym.sym == SDLK_UP || e.key.keysym.sym == SDLK_w) ctx->keyUpHeld = false;
            if (e.key.keysym.sym == SDLK_DOWN || e.key.keysym.sym == SDLK_s) ctx->keyDownHeld = false;
            break;
        case SDL_MOUSEBUTTONDOWN:
            if (ctx->state == GAME_WAITING) ctx->localReady ^= 1;
            break;
        case SDL_FINGERDOWN:
            if (ctx->state == GAME_WAITING && !ctx->localReady) ctx->localReady = true;
            ctx->touchActive = true;
            ctx->fingerId = e.tfinger.fingerId;
            int *pY = (ctx->playerType == 1) ? &ctx->paddle1Y : &ctx->paddle2Y;
            *pY = (int)(e.tfinger.y * WINDOW_HEIGHT) - PADDLE_HEIGHT / 2;
            break;
        case SDL_FINGERMOTION:
            if (ctx->touchActive && e.tfinger.fingerId == ctx->fingerId) {
                int *pY = (ctx->playerType == 1) ? &ctx->paddle1Y : &ctx->paddle2Y;
                *pY = (int)(e.tfinger.y * WINDOW_HEIGHT) - PADDLE_HEIGHT / 2;
            }
            break;
        case SDL_FINGERUP:
            if (ctx->touchActive && e.tfinger.fingerId == ctx->fingerId) ctx->touchActive = false;
            break;
        }
    }
}

static void move_paddle_keys(GameContext *ctx) {
    int dy = (ctx->keyDownHeld - ctx->keyUpHeld) * PADDLE_SPEED;
    if (dy) {
        int *pY = (ctx->playerType == 1) ? &ctx->paddle1Y : &ctx->paddle2Y;
        *pY += dy;
        if (*pY < 0) *pY = 0;
        if (*pY > WINDOW_HEIGHT - PADDLE_HEIGHT) *pY = WINDOW_HEIGHT - PADDLE_HEIGHT;
    }
}

static void reset_ball(GameContext *ctx) {
    ctx->ballX = (WINDOW_WIDTH - BALL_SIZE) / 2;
    ctx->ballY = (WINDOW_HEIGHT - BALL_SIZE) / 2;
    ctx->ballVelX = ctx->ballVelY = 0;
}

static void serve_ball(GameContext *ctx) {
    ctx->state = GAME_PLAYING;
    ctx->ballVelX = (rand() & 1) ? BALL_SPEED_X : -BALL_SPEED_X;
    ctx->ballVelY = (rand() & 1) ? BALL_SPEED_Y : -BALL_SPEED_Y;
}

static void register_goal(GameContext *ctx, bool leftPlayerScored) {
    if (leftPlayerScored) ctx->score1++; else ctx->score2++;

    if (ctx->score1 == MAX_SCORE || ctx->score2 == MAX_SCORE) {
        ctx->state = GAME_VICTORY;
        ctx->score1 = ctx->score2 = 0;
        ctx->localReady = ctx->remoteReady = false;
        reset_ball(ctx);
        ctx->state = GAME_WAITING;
    } else {
        ctx->state = GAME_SCORE;
        ctx->scoreDelayFrames = GOAL_DELAY_FRAMES;
        reset_ball(ctx);
    }
}

static void update_physics(GameContext *ctx) {
    if (ctx->state == GAME_PLAYING && ctx->ballOwner) {
        ctx->ballX += ctx->ballVelX;
        ctx->ballY += ctx->ballVelY;

        if (ctx->ballY <= 0 || ctx->ballY + BALL_SIZE >= WINDOW_HEIGHT)
            ctx->ballVelY = (ctx->ballVelY > 0) ? -BALL_SPEED_Y : BALL_SPEED_Y;


        SDL_Rect p1 = {20, ctx->paddle1Y, PADDLE_WIDTH, PADDLE_HEIGHT};
        SDL_Rect p2 = {WINDOW_WIDTH - 20 - PADDLE_WIDTH, ctx->paddle2Y, PADDLE_WIDTH, PADDLE_HEIGHT};
        SDL_Rect b = {ctx->ballX, ctx->ballY, BALL_SIZE, BALL_SIZE};

        if (SDL_HasIntersection(&b, &p1) && ctx->ballVelX < 0) ctx->ballVelX = BALL_SPEED_X;
        if (SDL_HasIntersection(&b, &p2) && ctx->ballVelX > 0) ctx->ballVelX = -BALL_SPEED_X;

        if (ctx->ballX < -BALL_SIZE) register_goal(ctx, false);
        else if (ctx->ballX > WINDOW_WIDTH) register_goal(ctx, true);

    } else if (ctx->state == GAME_SCORE && ctx->ballOwner) {
        if (--ctx->scoreDelayFrames <= 0) serve_ball(ctx);
    }

    ctx->paddle1Rect.y = ctx->paddle1Y;
    ctx->paddle2Rect.y = ctx->paddle2Y;
    ctx->ballRect.x = ctx->ballX;
    ctx->ballRect.y = ctx->ballY;
}

static void draw_paddle(SDL_Renderer *r, const SDL_Rect *rect, bool isLeftPaddle, bool isPlayerPaddle) {
    set_color(r, isLeftPaddle ? COLOR_PADDLE_LEFT : COLOR_PADDLE_RIGHT);
    SDL_RenderFillRect(r, rect);

    if (isPlayerPaddle) {
        set_color(r, COLOR_PLAYER_INDICATOR);
        SDL_Rect indicator = isLeftPaddle ?
            (SDL_Rect){rect->x - 5, rect->y + rect->h/2 - 5, 5, 10} :
            (SDL_Rect){rect->x + rect->w, rect->y + rect->h/2 - 5, 5, 10};
        SDL_RenderFillRect(r, &indicator);
    }
}

static void draw_score(SDL_Renderer *r, int side, int score) {
    const int margin   = 20;
    const int spacing  = 40;
    const int sqSize   = 20;
    const int y        = 12;

    int baseX, dir;
    if (side == 1) {
        baseX = margin;
        dir   = +1;
    } else {
        baseX = WINDOW_WIDTH - margin - sqSize;
        dir   = -1;
    }

    for (int i = 0; i < MAX_SCORE; i++) {
        SDL_Rect sq = {
            baseX + dir * i * spacing,
            y,
            sqSize,
            sqSize
        };
        if (i < score) {
            set_color(r, COLOR_SCORE_FILLED);
            SDL_RenderFillRect(r, &sq);
        } else {
            set_color(r, COLOR_SCORE_EMPTY);
            SDL_RenderDrawRect(r, &sq);
        }
    }
}


static void render_game(GameContext *ctx) {
    SDL_Renderer *r = ctx->renderer;

    set_color(r, COLOR_BG);
    SDL_RenderClear(r);

    SDL_Rect leftPad = {20, ctx->paddle1Y, PADDLE_WIDTH, PADDLE_HEIGHT};
    SDL_Rect rightPad = {WINDOW_WIDTH - 20 - PADDLE_WIDTH, ctx->paddle2Y, PADDLE_WIDTH, PADDLE_HEIGHT};

    bool leftIsPlayer = (ctx->playerType == 1);
    bool rightIsPlayer = (ctx->playerType == 2);

    draw_paddle(r, &leftPad, true, leftIsPlayer);
    draw_paddle(r, &rightPad, false, rightIsPlayer);

    set_color(r, COLOR_BALL);
    SDL_RenderFillRect(r, &ctx->ballRect);

    draw_score(r, 1, ctx->score1);
    draw_score(r, 2, ctx->score2);

    int dashOffset = (ctx->state != GAME_WAITING) ? ctx->dashOffset : 0;
    set_color(r, COLOR_DASH);
    for (int y = -dashOffset; y < WINDOW_HEIGHT; y += 24) {
        SDL_Rect d = {WINDOW_WIDTH / 2 - 1, y, 2, 12};
        SDL_RenderFillRect(r, &d);
    }

    SDL_RenderPresent(r);
}

EMSCRIPTEN_KEEPALIVE
void update_and_render(GameContext *ctx) {
    if (!ctx->initialized) {
        srand((unsigned)time(NULL));
        ctx->paddle1Y = ctx->paddle2Y = (WINDOW_HEIGHT - PADDLE_HEIGHT) / 2;
        reset_ball(ctx);
        ctx->paddle1Rect = (SDL_Rect){20, ctx->paddle1Y, PADDLE_WIDTH, PADDLE_HEIGHT};
        ctx->paddle2Rect = (SDL_Rect){WINDOW_WIDTH - 20 - PADDLE_WIDTH, ctx->paddle2Y, PADDLE_WIDTH, PADDLE_HEIGHT};
        ctx->ballRect = (SDL_Rect){ctx->ballX, ctx->ballY, BALL_SIZE, BALL_SIZE};
        ctx->state = GAME_WAITING;
        ctx->dashOffset = 0;
        ctx->initialized = true;
    }

    handle_input(ctx);
    move_paddle_keys(ctx);

    if (!ctx->connected && ctx->state == GAME_WAITING && ctx->localReady) {
        ctx->remoteReady = true;
        ctx->ballOwner = true;
        serve_ball(ctx);
    }

    if (ctx->state != GAME_WAITING)
        ctx->dashOffset = (ctx->dashOffset + DASH_SPEED) % 24;

    switch (ctx->state) {
    case GAME_WAITING:
        net_try_connect(ctx);
        net_exchange(ctx);
        break;
    case GAME_PLAYING:
    case GAME_SCORE:
    case GAME_VICTORY:
        net_exchange(ctx);
        update_physics(ctx);
        break;
    case GAME_DISCONNECT:
        net_try_connect(ctx);
        if (ctx->connected) {
            ctx->state = GAME_WAITING;
            ctx->localReady = ctx->remoteReady = false;
        }
        break;
    }

    render_game(ctx);
}
