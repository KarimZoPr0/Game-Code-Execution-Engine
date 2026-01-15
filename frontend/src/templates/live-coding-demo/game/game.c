#include <emscripten.h>
#include <SDL2/SDL.h>
#include <stdbool.h>
#include <stdlib.h>
#include <string.h>
#include <math.h>
#include <stdio.h>

#include "game.h"

// -----------------------------------------------------------------------------
// LIVE CODING RULES
// - No gameplay-critical globals (all runtime state lives in GameContext* ctx).
// - Globals in this file are static const (hotreload-safe).
// - Beware: values copied into entities only affect NEW entities unless you
//   recompute them each frame.
// -----------------------------------------------------------------------------

// Change this when you want an easy "I know the new code is running" signal.
static const int BUILD_ID = 1;

// Background colors by timeline mode
static const SDL_Color BG_LIVE     = { 0, 14, 24, 255 };
static const SDL_Color BG_PLAYBACK = { 0, 22, 14, 255 };
static const SDL_Color BG_PAUSED   = { 0, 14, 34, 255 };

// Gameplay tuning (reads every frame)
static const float PLAYER_SPEED = 4.0f;
static const int   FIRE_COOLDOWN_FRAMES = 8;

// Bullet tuning
static const float BULLET_SPEED_BASE  = 8.0f;
static const float BULLET_SPEED_SCALE = 0.30f;
static const int   BULLET_W = 10;
static const int   BULLET_H = 5;

// Enemy tuning
static const float ENEMY_SPEED_BASE  = 2.2f;
static const float ENEMY_SPEED_SCALE = 0.60f;
static const int   ENEMY_SPAWN_BASE_MAX = 55;
static const int   ENEMY_SPAWN_BASE_MIN = 18;

// If true: existing bullets/enemies get their speed updated every frame (more “immediate” tuning)
static const bool  RETUNE_EXISTING_ENTITY_SPEEDS = true;

static float clampf(float v, float lo, float hi) { return v < lo ? lo : (v > hi ? hi : v); }

// deterministic rng (stored in ctx, so snapshots replay perfectly)
static unsigned int xorshift32(unsigned int *state) {
    unsigned int x = *state;
    x ^= x << 13;
    x ^= x >> 17;
    x ^= x << 5;
    *state = x;
    return x;
}
static float frand(unsigned int *state, float a, float b) {
    unsigned int r = xorshift32(state);
    float t = (r / 4294967295.0f);
    return a + t * (b - a);
}
static int irand(unsigned int *state, int a, int b_inclusive) {
    unsigned int r = xorshift32(state);
    int span = (b_inclusive - a + 1);
    return a + (int)(r % (unsigned int)span);
}

static bool aabb_hit(float ax, float ay, float aw, float ah,
                     float bx, float by, float bw, float bh) {
    return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
}

static void draw_circle(SDL_Renderer *ren, int cx, int cy, int r) {
    for (int dy = -r; dy <= r; dy++) {
        int span = (int)sqrtf((float)(r*r - dy*dy));
        SDL_RenderDrawLine(ren, cx - span, cy + dy, cx + span, cy + dy);
    }
}

// ----------------------------------------------------------------------------
// Replay helpers
// ----------------------------------------------------------------------------

// JS calls timeline functions. We store last ctx pointer here.
// This is OK: it resets on reload and gets set again next frame.
static GameContext *g_ctx = NULL;

static void replay_init_if_needed(GameContext *ctx) {
    // Check if already initialized by verifying capacity is set to expected value
    // (Can't just check pointers because uninitialized malloc may have garbage non-null values)
    if (ctx->replay.snapshot_capacity == MAX_REPLAY_FRAMES && ctx->replay.snapshots != NULL) {
        return;
    }

    // Free old allocations if they exist (in case of partial initialization)
    if (ctx->replay.events) { free(ctx->replay.events); ctx->replay.events = NULL; }
    if (ctx->replay.snapshots) { free(ctx->replay.snapshots); ctx->replay.snapshots = NULL; }

    ctx->replay.event_capacity = MAX_REPLAY_EVENTS;
    ctx->replay.events = (InputEvent*)malloc(sizeof(InputEvent) * ctx->replay.event_capacity);

    ctx->replay.snapshot_capacity = MAX_REPLAY_FRAMES;
    ctx->replay.snapshots = (GameSnapshot*)malloc(sizeof(GameSnapshot) * ctx->replay.snapshot_capacity);

    ctx->replay.event_count = 0;
    ctx->replay.recorded_start_frame = 0;
    ctx->replay.recorded_end_frame = 0;
    ctx->replay.current_frame = 0;
    ctx->replay.display_frame = 0;

    ctx->replay.mode = MODE_LIVE;
    ctx->replay.playback_speed = 1.0f;
    ctx->replay.playback_accumulator = 0.0f;
    ctx->replay.loop_enabled = true;

    printf("Replay system initialized (frames=%d, ~%d KB)\n", 
           ctx->replay.snapshot_capacity,
           (int)(ctx->replay.snapshot_capacity * sizeof(GameSnapshot) / 1024));
}

// ----------------------------------------------------------------------------
// Simple loop recorder (L key feature)
// Uses ctx->loop_ptr to persist across hot-reloads
// ----------------------------------------------------------------------------

static LoopRecorder *g_loop = NULL;

static void loop_init_if_needed(GameContext *ctx) {
    // Restore from persistent storage if available (survives hot-reload)
    if (ctx->loop_ptr) {
        g_loop = (LoopRecorder*)ctx->loop_ptr;
        return;
    }
    
    // First time initialization
    g_loop = (LoopRecorder*)malloc(sizeof(LoopRecorder));
    if (!g_loop) {
        printf("[Loop] ERROR: Failed to allocate LoopRecorder\n");
        return;
    }
    
    g_loop->inputs = (LoopInputFrame*)malloc(sizeof(LoopInputFrame) * LOOP_MAX_INPUTS);
    g_loop->start_snapshot = (GameSnapshot*)malloc(sizeof(GameSnapshot));
    g_loop->keyboard_backup = (int*)malloc(sizeof(int) * MAX_KEYBOARD_KEYS);
    
    if (!g_loop->inputs || !g_loop->start_snapshot || !g_loop->keyboard_backup) {
        printf("[Loop] ERROR: Failed to allocate loop recorder buffers\n");
        return;
    }
    
    g_loop->state = LOOP_IDLE;
    g_loop->input_count = 0;
    g_loop->playback_index = 0;
    memset(g_loop->keyboard_backup, 0, sizeof(int) * MAX_KEYBOARD_KEYS);
    
    // Store in persistent location for hot-reload survival
    ctx->loop_ptr = g_loop;
    
    int size_kb = (int)((sizeof(LoopInputFrame) * LOOP_MAX_INPUTS + sizeof(GameSnapshot)) / 1024);
    printf("Loop recorder initialized (max=%d frames, ~%d KB)\n", LOOP_MAX_INPUTS, size_kb);
}

static void loop_capture_snapshot(GameContext *ctx) {
    GameSnapshot *s = g_loop->start_snapshot;
    
    s->rng_state = ctx->rng_state;
    s->player_x = ctx->player_x;
    s->player_y = ctx->player_y;
    s->player_w = ctx->player_w;
    s->player_h = ctx->player_h;
    s->score = ctx->score;
    s->lives = ctx->lives;
    s->game_over = ctx->game_over ? 1 : 0;
    s->shoot_cooldown = ctx->shoot_cooldown;
    s->enemy_spawn_timer = ctx->enemy_spawn_timer;
    s->difficulty = ctx->difficulty;
    memcpy(s->bullets, ctx->bullets, sizeof(ctx->bullets));
    memcpy(s->enemies, ctx->enemies, sizeof(ctx->enemies));
    
    memcpy(g_loop->keyboard_backup, ctx->keyboard, sizeof(ctx->keyboard));
}

static void loop_restore_snapshot(GameContext *ctx) {
    GameSnapshot *s = g_loop->start_snapshot;
    
    ctx->rng_state = s->rng_state;
    ctx->player_x = s->player_x;
    ctx->player_y = s->player_y;
    ctx->player_w = s->player_w;
    ctx->player_h = s->player_h;
    ctx->score = s->score;
    ctx->lives = s->lives;
    ctx->game_over = (s->game_over != 0);
    ctx->shoot_cooldown = s->shoot_cooldown;
    ctx->enemy_spawn_timer = s->enemy_spawn_timer;
    ctx->difficulty = s->difficulty;
    memcpy(ctx->bullets, s->bullets, sizeof(ctx->bullets));
    memcpy(ctx->enemies, s->enemies, sizeof(ctx->enemies));
    
    memcpy(ctx->keyboard, g_loop->keyboard_backup, sizeof(ctx->keyboard));
}

static void loop_record_frame(GameContext *ctx) {
    // Circular buffer - write at current position and wrap
    int write_index = g_loop->input_count % LOOP_MAX_INPUTS;
    memcpy(g_loop->inputs[write_index].keyboard, ctx->keyboard, sizeof(ctx->keyboard));
    g_loop->input_count++;
    
    // When we wrap around, take a new snapshot so playback can still work
    if (g_loop->input_count > LOOP_MAX_INPUTS && write_index == 0) {
        loop_capture_snapshot(ctx);
    }
}

static void loop_apply_frame(GameContext *ctx) {
    if (g_loop->input_count == 0) return;
    
    // For circular buffer, effective count is min(input_count, LOOP_MAX_INPUTS)
    int effective_count = (g_loop->input_count > LOOP_MAX_INPUTS) ? LOOP_MAX_INPUTS : g_loop->input_count;
    
    memcpy(ctx->keyboard, g_loop->inputs[g_loop->playback_index].keyboard, sizeof(ctx->keyboard));
    g_loop->playback_index++;
    
    // Loop back to start when we've played all frames
    if (g_loop->playback_index >= effective_count) {
        g_loop->playback_index = 0;
        loop_restore_snapshot(ctx);
    }
}

static void loop_toggle(GameContext *ctx) {
    switch (g_loop->state) {
        case LOOP_IDLE:
            // Start recording
            g_loop->input_count = 0;
            g_loop->playback_index = 0;
            loop_capture_snapshot(ctx);
            g_loop->state = LOOP_RECORDING;
            printf("[L] Started loop recording\n");
            break;
            
        case LOOP_RECORDING:
            // Enter playback mode
            if (g_loop->input_count > 0) {
                int effective_count = (g_loop->input_count > LOOP_MAX_INPUTS) ? LOOP_MAX_INPUTS : g_loop->input_count;
                loop_restore_snapshot(ctx);
                g_loop->playback_index = 0;
                g_loop->state = LOOP_PLAYBACK;
                printf("[L] Entering loop playback (%d frames)\n", effective_count);
            } else {
                g_loop->state = LOOP_IDLE;
                printf("[L] No frames recorded, back to idle\n");
            }
            break;
            
        case LOOP_PLAYBACK:
            // Exit playback
            g_loop->state = LOOP_IDLE;
            memset(ctx->keyboard, 0, sizeof(ctx->keyboard));
            printf("[L] Exited loop playback\n");
            break;
    }
}

static void replay_record_input_change(GameContext *ctx, int scancode, int state) {
    if (ctx->replay.mode != MODE_LIVE) return;
    if (ctx->replay.event_count >= ctx->replay.event_capacity) return;

    InputEvent *evt = &ctx->replay.events[ctx->replay.event_count++];
    evt->frame = ctx->replay.current_frame;
    evt->scancode = scancode;
    evt->state = state;
}

static void replay_record_snapshot(GameContext *ctx) {
    // Circular buffer - use modulo to wrap around
    int frame_index = ctx->replay.current_frame % ctx->replay.snapshot_capacity;

    GameSnapshot *s = &ctx->replay.snapshots[frame_index];

    s->rng_state = ctx->rng_state;

    s->player_x = ctx->player_x;
    s->player_y = ctx->player_y;
    s->player_w = ctx->player_w;
    s->player_h = ctx->player_h;

    s->score = ctx->score;
    s->lives = ctx->lives;
    s->game_over = ctx->game_over ? 1 : 0;

    s->shoot_cooldown = ctx->shoot_cooldown;
    s->enemy_spawn_timer = ctx->enemy_spawn_timer;
    s->difficulty = ctx->difficulty;

    memcpy(s->bullets, ctx->bullets, sizeof(ctx->bullets));
    memcpy(s->enemies, ctx->enemies, sizeof(ctx->enemies));

    ctx->replay.recorded_end_frame = ctx->replay.current_frame;
    
    // Slide the start frame forward when buffer is full (circular buffer)
    if (ctx->replay.current_frame - ctx->replay.recorded_start_frame >= ctx->replay.snapshot_capacity) {
        ctx->replay.recorded_start_frame = ctx->replay.current_frame - ctx->replay.snapshot_capacity + 1;
    }
}

static void replay_load_frame(GameContext *ctx, int frame) {
    if (frame < ctx->replay.recorded_start_frame) frame = ctx->replay.recorded_start_frame;
    if (frame > ctx->replay.recorded_end_frame) frame = ctx->replay.recorded_end_frame;

    // Circular buffer - use modulo to find actual index
    int frame_index = frame % ctx->replay.snapshot_capacity;

    GameSnapshot *s = &ctx->replay.snapshots[frame_index];

    ctx->rng_state = s->rng_state;

    ctx->player_x = s->player_x;
    ctx->player_y = s->player_y;
    ctx->player_w = s->player_w;
    ctx->player_h = s->player_h;

    ctx->score = s->score;
    ctx->lives = s->lives;
    ctx->game_over = (s->game_over != 0);

    ctx->shoot_cooldown = s->shoot_cooldown;
    ctx->enemy_spawn_timer = s->enemy_spawn_timer;
    ctx->difficulty = s->difficulty;

    memcpy(ctx->bullets, s->bullets, sizeof(ctx->bullets));
    memcpy(ctx->enemies, s->enemies, sizeof(ctx->enemies));

    ctx->replay.display_frame = frame;
}

// ----------------------------------------------------------------------------
// Shooter helpers (LIVE simulation only)
// ----------------------------------------------------------------------------

static void clear_world(GameContext *ctx) {
    memset(ctx->bullets, 0, sizeof(ctx->bullets));
    memset(ctx->enemies, 0, sizeof(ctx->enemies));
}

static float bullet_speed_now(GameContext *ctx) {
    return BULLET_SPEED_BASE + ctx->difficulty * BULLET_SPEED_SCALE;
}

static float enemy_speed_now(GameContext *ctx) {
    return ENEMY_SPEED_BASE + ctx->difficulty * ENEMY_SPEED_SCALE;
}

static void spawn_enemy(GameContext *ctx) {
    for (int i = 0; i < MAX_ENEMIES; i++) {
        Enemy *e = &ctx->enemies[i];
        if (e->alive) continue;

        e->alive = true;
        e->r = irand(&ctx->rng_state, 10, 18);
        e->x = WINDOW_WIDTH + e->r + frand(&ctx->rng_state, 0, 60);
        e->y = frand(&ctx->rng_state, 40, WINDOW_HEIGHT - 40);

        float base = enemy_speed_now(ctx);
        e->vx = -frand(&ctx->rng_state, base, base + 1.5f);

        e->hp = (ctx->difficulty > 6.0f) ? 2 : 1;
        return;
    }
}

static void fire_bullet(GameContext *ctx) {
    for (int i = 0; i < MAX_BULLETS; i++) {
        Bullet *b = &ctx->bullets[i];
        if (b->alive) continue;

        b->alive = true;
        b->w = BULLET_W;
        b->h = BULLET_H;
        b->x = ctx->player_x + ctx->player_w;
        b->y = ctx->player_y + ctx->player_h * 0.5f - b->h * 0.5f;
        b->vx = bullet_speed_now(ctx);
        return;
    }
}

static void reset_game_live(GameContext *ctx) {
    ctx->rng_state = 1337u;

    ctx->player_w = 18;
    ctx->player_h = 18;
    ctx->player_x = 35;
    ctx->player_y = (WINDOW_HEIGHT - ctx->player_h) * 0.5f;

    ctx->score = 0;
    ctx->lives = 3;
    ctx->game_over = false;

    ctx->shoot_cooldown = 0;
    ctx->enemy_spawn_timer = 40;
    ctx->difficulty = 1.0f;

    ctx->shake = 0.0f;
    ctx->flash = 0.0f;
    ctx->console_tick = 0;

    clear_world(ctx);

    for (int i = 0; i < 6; i++) spawn_enemy(ctx);
}

static bool key_down(GameContext *ctx, SDL_Scancode sc) {
    if ((int)sc >= MAX_KEYBOARD_KEYS) return false;
    return ctx->keyboard[(int)sc] != 0;
}

static void doKeyDown(GameContext *ctx, SDL_KeyboardEvent *event) {
    if (event->repeat != 0) return;
    int sc = event->keysym.scancode;
    if (sc >= MAX_KEYBOARD_KEYS) return;

    int old = ctx->keyboard[sc];
    ctx->keyboard[sc] = 1;
    if (old != 1) replay_record_input_change(ctx, sc, 1);
}

static void doKeyUp(GameContext *ctx, SDL_KeyboardEvent *event) {
    if (event->repeat != 0) return;
    int sc = event->keysym.scancode;
    if (sc >= MAX_KEYBOARD_KEYS) return;

    int old = ctx->keyboard[sc];
    ctx->keyboard[sc] = 0;
    if (old != 0) replay_record_input_change(ctx, sc, 0);
}

static void handle_events(GameContext *ctx) {
    SDL_Event event;
    while (SDL_PollEvent(&event)) {
        if (event.type == SDL_QUIT) {
            // ignore in browser
        } else if (event.type == SDL_KEYDOWN) {
            // Handle L key for loop recorder (works in LIVE mode)
            if (event.key.repeat == 0 && event.key.keysym.sym == SDLK_l) {
                if (ctx->replay.mode == MODE_LIVE && g_loop) {
                    loop_toggle(ctx);
                }
            }
            
            // Normal input handling (skip if in loop playback)
            if (ctx->replay.mode == MODE_LIVE && (!g_loop || g_loop->state != LOOP_PLAYBACK)) {
                doKeyDown(ctx, &event.key);
            }

            if (ctx->replay.mode == MODE_LIVE && event.key.keysym.sym == SDLK_r) {
                reset_game_live(ctx);
                printf("[R] Restart\n");
            }
        } else if (event.type == SDL_KEYUP) {
            // Skip key up if in loop playback
            if (ctx->replay.mode == MODE_LIVE && (!g_loop || g_loop->state != LOOP_PLAYBACK)) {
                doKeyUp(ctx, &event.key);
            }
        }
    }
}

static void retune_existing_entities(GameContext *ctx) {
    if (!RETUNE_EXISTING_ENTITY_SPEEDS) return;

    // bullets
    float bv = bullet_speed_now(ctx);
    for (int i = 0; i < MAX_BULLETS; i++) {
        Bullet *b = &ctx->bullets[i];
        if (!b->alive) continue;
        b->vx = bv;
        b->w = BULLET_W;
        b->h = BULLET_H;
    }

    // enemies
    float ev = enemy_speed_now(ctx);
    for (int i = 0; i < MAX_ENEMIES; i++) {
        Enemy *e = &ctx->enemies[i];
        if (!e->alive) continue;

        // keep direction (-)
        float mag = fabsf(e->vx);
        (void)mag;
        e->vx = -fmaxf(1.0f, ev); // simple retune
    }
}

static void update_live(GameContext *ctx) {
    // Loop recorder: apply recorded inputs if in playback mode
    if (g_loop && g_loop->state == LOOP_PLAYBACK) {
        loop_apply_frame(ctx);
    }
    
    // difficulty scales with score (this is “immediate” by design)
    ctx->difficulty = 1.0f + (float)ctx->score / 120.0f;

    // (optional) make tuning affect existing entities too
    retune_existing_entities(ctx);

    // movement
    if (!ctx->game_over) {
        if (key_down(ctx, SDL_SCANCODE_UP) || key_down(ctx, SDL_SCANCODE_W)) ctx->player_y -= PLAYER_SPEED;
        if (key_down(ctx, SDL_SCANCODE_DOWN) || key_down(ctx, SDL_SCANCODE_S)) ctx->player_y += PLAYER_SPEED;
    }
    ctx->player_y = clampf(ctx->player_y, 20.0f, (float)WINDOW_HEIGHT - 20.0f - ctx->player_h);

    // shooting
    if (ctx->shoot_cooldown > 0) ctx->shoot_cooldown--;
    if (!ctx->game_over && key_down(ctx, SDL_SCANCODE_SPACE)) {
        if (ctx->shoot_cooldown == 0) {
            fire_bullet(ctx);
            ctx->shoot_cooldown = FIRE_COOLDOWN_FRAMES;
        }
    }

    // enemy spawning
    if (!ctx->game_over) {
        if (ctx->enemy_spawn_timer > 0) ctx->enemy_spawn_timer--;
        if (ctx->enemy_spawn_timer == 0) {
            spawn_enemy(ctx);
            int base = (int)clampf((float)ENEMY_SPAWN_BASE_MAX - ctx->difficulty * 4.0f,
                                   (float)ENEMY_SPAWN_BASE_MIN,
                                   (float)ENEMY_SPAWN_BASE_MAX);
            ctx->enemy_spawn_timer = base;
        }
    }

    // bullets update
    for (int i = 0; i < MAX_BULLETS; i++) {
        Bullet *b = &ctx->bullets[i];
        if (!b->alive) continue;
        b->x += b->vx;
        if (b->x > WINDOW_WIDTH + 20) b->alive = false;
    }

    // enemies update
    for (int i = 0; i < MAX_ENEMIES; i++) {
        Enemy *e = &ctx->enemies[i];
        if (!e->alive) continue;

        if (!ctx->game_over) {
            e->y += frand(&ctx->rng_state, -0.7f, 0.7f);
            e->y = clampf(e->y, 30.0f, (float)WINDOW_HEIGHT - 30.0f);
            e->x += e->vx;
        }

        // passed left => lose life
        if (e->x < -40) {
            e->alive = false;
            if (!ctx->game_over) {
                ctx->lives--;
                ctx->shake = 5.0f;
                ctx->flash = 1.0f;
                if (ctx->lives <= 0) {
                    ctx->game_over = true;
                    printf("GAME OVER! Final score: %d (press R)\n", ctx->score);
                }
            }
        }
    }

    // bullet vs enemy collisions
    for (int bi = 0; bi < MAX_BULLETS; bi++) {
        Bullet *b = &ctx->bullets[bi];
        if (!b->alive) continue;

        for (int ei = 0; ei < MAX_ENEMIES; ei++) {
            Enemy *e = &ctx->enemies[ei];
            if (!e->alive) continue;

            float ex = e->x - e->r;
            float ey = e->y - e->r;
            float ew = (float)(e->r * 2);
            float eh = (float)(e->r * 2);

            if (aabb_hit(b->x, b->y, (float)b->w, (float)b->h, ex, ey, ew, eh)) {
                b->alive = false;
                e->hp--;

                ctx->shake = fmaxf(ctx->shake, 2.5f);
                ctx->flash = fmaxf(ctx->flash, 0.4f);

                if (e->hp <= 0) {
                    e->alive = false;
                    ctx->score += 10;
                } else {
                    ctx->score += 3;
                }
                break;
            }
        }
    }

    // enemy vs player collision
    if (!ctx->game_over) {
        float px = ctx->player_x;
        float py = ctx->player_y;
        float pw = (float)ctx->player_w;
        float ph = (float)ctx->player_h;

        for (int ei = 0; ei < MAX_ENEMIES; ei++) {
            Enemy *e = &ctx->enemies[ei];
            if (!e->alive) continue;

            float ex = e->x - e->r;
            float ey = e->y - e->r;
            float ew = (float)(e->r * 2);
            float eh = (float)(e->r * 2);

            if (aabb_hit(px, py, pw, ph, ex, ey, ew, eh)) {
                e->alive = false;
                ctx->lives--;
                ctx->shake = 6.0f;
                ctx->flash = 1.0f;

                if (ctx->lives <= 0) {
                    ctx->game_over = true;
                    printf("GAME OVER! Final score: %d (press R)\n", ctx->score);
                } else {
                    printf("Hit! Lives: %d\n", ctx->lives);
                }
            }
        }
    }

    // juice decay
    ctx->shake *= 0.90f;
    if (ctx->shake < 0.05f) ctx->shake = 0.0f;
    ctx->flash *= 0.86f;
    if (ctx->flash < 0.01f) ctx->flash = 0.0f;

    // console ticker
    ctx->console_tick++;
    if (ctx->console_tick >= 120) {
        ctx->console_tick = 0;
        printf("Score: %d | Lives: %d | Diff: %.2f\n", ctx->score, ctx->lives, ctx->difficulty);
    }

    // Loop recorder: record this frame's inputs if recording
    if (g_loop && g_loop->state == LOOP_RECORDING) {
        loop_record_frame(ctx);
    }

    // snapshot after sim
    replay_record_snapshot(ctx);

    // advance frame
    ctx->replay.current_frame++;
    ctx->replay.display_frame = ctx->replay.current_frame;
}

static void update_playback(GameContext *ctx) {
    ctx->replay.playback_accumulator += ctx->replay.playback_speed;

    while (ctx->replay.playback_accumulator >= 1.0f) {
        ctx->replay.playback_accumulator -= 1.0f;

        int next = ctx->replay.display_frame + 1;
        if (next > ctx->replay.recorded_end_frame) {
            if (ctx->replay.loop_enabled) next = ctx->replay.recorded_start_frame;
            else {
                ctx->replay.mode = MODE_PAUSED;
                ctx->replay.playback_accumulator = 0.0f;
                return;
            }
        }
        replay_load_frame(ctx, next);
    }
}

static void update(GameContext *ctx) {
    switch (ctx->replay.mode) {
        case MODE_LIVE:     update_live(ctx);     break;
        case MODE_PLAYBACK: update_playback(ctx); break;
        case MODE_PAUSED:   break;
    }
}

static void render(GameContext *ctx) {
    SDL_Renderer *ren = ctx->renderer;

    // shake only in LIVE
    int sx = 0, sy = 0;
    if (ctx->replay.mode == MODE_LIVE && ctx->shake > 0.0f) {
        sx = (int)frand(&ctx->rng_state, -ctx->shake, ctx->shake);
        sy = (int)frand(&ctx->rng_state, -ctx->shake, ctx->shake);
    }
    SDL_RenderSetViewport(ren, &(SDL_Rect){ sx, sy, WINDOW_WIDTH, WINDOW_HEIGHT });

    // background
    if (ctx->flash > 0.0f) {
        SDL_SetRenderDrawColor(ren, 80, 15, 15, 255);
    } else {
        SDL_Color bg = BG_LIVE;
        if (ctx->replay.mode == MODE_PLAYBACK) bg = BG_PLAYBACK;
        if (ctx->replay.mode == MODE_PAUSED)   bg = BG_PAUSED;
        SDL_SetRenderDrawColor(ren, bg.r, bg.g, bg.b, 255);
    }
    SDL_RenderClear(ren);

    // border
    SDL_RenderSetViewport(ren, &(SDL_Rect){ 0, 0, WINDOW_WIDTH, WINDOW_HEIGHT });
    SDL_SetRenderDrawColor(ren, 50, 50, 70, 255);
    SDL_Rect border = { 12, 12, WINDOW_WIDTH - 24, WINDOW_HEIGHT - 24 };
    SDL_RenderDrawRect(ren, &border);

    // player
    SDL_SetRenderDrawColor(ren, 99, 102, 241, 255);
    SDL_Rect pr = { (int)ctx->player_x, (int)ctx->player_y, ctx->player_w, ctx->player_h };
    SDL_RenderFillRect(ren, &pr);

    // bullets
    SDL_SetRenderDrawColor(ren, 0, 255, 0, 255);
    for (int i = 0; i < MAX_BULLETS; i++) {
        Bullet *b = &ctx->bullets[i];
        if (!b->alive) continue;
        SDL_Rect br = { (int)b->x, (int)b->y, b->w, b->h };
        SDL_RenderFillRect(ren, &br);
    }

    // enemies
    SDL_SetRenderDrawColor(ren, 255, 0, 0, 255);
    for (int i = 0; i < MAX_ENEMIES; i++) {
        Enemy *e = &ctx->enemies[i];
        if (!e->alive) continue;
        draw_circle(ren, (int)e->x, (int)e->y, e->r);

        if (e->hp > 1) {
            SDL_SetRenderDrawColor(ren, 253, 230, 138, 255);
            SDL_Rect pip = { (int)e->x - 3, (int)e->y - e->r - 8, 6, 6 };
            SDL_RenderFillRect(ren, &pip);
            SDL_SetRenderDrawColor(ren, 255, 0, 0, 255);
        }
    }

    // lives
    for (int i = 0; i < ctx->lives; i++) {
        SDL_SetRenderDrawColor(ren, 239, 68, 68, 255);
        SDL_Rect lr = { 18 + i * 14, 18, 10, 10 };
        SDL_RenderFillRect(ren, &lr);
    }

    // score meter (shape-only)
    int meterW = 120, meterH = 8;
    int mx = WINDOW_WIDTH - 18 - meterW, my = 18;
    float t = clampf((float)(ctx->score % 100) / 100.0f, 0.0f, 1.0f);
    SDL_SetRenderDrawColor(ren, 70, 70, 90, 255);
    SDL_Rect bg = { mx, my, meterW, meterH };
    SDL_RenderFillRect(ren, &bg);
    SDL_SetRenderDrawColor(ren, 234, 179, 8, 255);
    SDL_Rect fg = { mx, my, (int)(meterW * t), meterH };
    SDL_RenderFillRect(ren, &fg);

    // game over banner
    if (ctx->game_over) {
        SDL_SetRenderDrawColor(ren, 0, 0, 0, 160);
        SDL_Rect dim = { 0, WINDOW_HEIGHT/2 - 38, WINDOW_WIDTH, 76 };
        SDL_RenderFillRect(ren, &dim);

        SDL_SetRenderDrawColor(ren, 239, 68, 68, 255);
        SDL_Rect bar = { WINDOW_WIDTH/2 - 150, WINDOW_HEIGHT/2 - 14, 300, 28 };
        SDL_RenderFillRect(ren, &bar);
    }

    SDL_RenderPresent(ren);
}

// ----------------------------------------------------------------------------
// EXPORTED Timeline functions
// ----------------------------------------------------------------------------

EMSCRIPTEN_KEEPALIVE void js_go_live(void);

EMSCRIPTEN_KEEPALIVE int js_get_current_frame() { return g_ctx ? g_ctx->replay.display_frame : 0; }
EMSCRIPTEN_KEEPALIVE int js_get_start_frame()   { return g_ctx ? g_ctx->replay.recorded_start_frame : 0; }
EMSCRIPTEN_KEEPALIVE int js_get_end_frame()     { return g_ctx ? g_ctx->replay.recorded_end_frame : 0; }
EMSCRIPTEN_KEEPALIVE int js_get_playback_frame(){ return g_ctx ? g_ctx->replay.display_frame : 0; }
EMSCRIPTEN_KEEPALIVE int js_is_recording()      { return (g_ctx && g_ctx->replay.mode == MODE_LIVE) ? 1 : 0; }
EMSCRIPTEN_KEEPALIVE int js_is_replaying()      { return (g_ctx && g_ctx->replay.mode == MODE_PLAYBACK) ? 1 : 0; }
EMSCRIPTEN_KEEPALIVE int js_is_paused()         { return (g_ctx && g_ctx->replay.mode == MODE_PAUSED) ? 1 : 0; }
EMSCRIPTEN_KEEPALIVE int js_get_event_count()   { return g_ctx ? g_ctx->replay.event_count : 0; }
EMSCRIPTEN_KEEPALIVE float js_get_sim_speed()   { return g_ctx ? g_ctx->replay.playback_speed : 1.0f; }

EMSCRIPTEN_KEEPALIVE
void js_set_sim_speed(float speed) {
    if (!g_ctx) return;
    g_ctx->replay.playback_speed = speed;
    if (g_ctx->replay.playback_speed < 0.0f) g_ctx->replay.playback_speed = 0.0f;
    if (g_ctx->replay.playback_speed > 4.0f) g_ctx->replay.playback_speed = 4.0f;
}

EMSCRIPTEN_KEEPALIVE
void js_start_recording() {
    if (!g_ctx) return;
    g_ctx->replay.event_count = 0;

    g_ctx->replay.recorded_start_frame = g_ctx->replay.current_frame;
    g_ctx->replay.recorded_end_frame   = g_ctx->replay.current_frame;
    g_ctx->replay.display_frame        = g_ctx->replay.current_frame;

    g_ctx->replay.mode = MODE_LIVE;
    memset(g_ctx->keyboard, 0, sizeof(g_ctx->keyboard));

    printf("Started recording at frame %d\n", g_ctx->replay.recorded_start_frame);
}

EMSCRIPTEN_KEEPALIVE
void js_stop_recording() {
    if (!g_ctx) return;
    if (g_ctx->replay.mode == MODE_LIVE) {
        g_ctx->replay.mode = MODE_PAUSED;
        printf("Stopped recording at frame %d\n", g_ctx->replay.recorded_end_frame);
    }
}

EMSCRIPTEN_KEEPALIVE
void js_start_playback() {
    if (!g_ctx) return;
    if (g_ctx->replay.recorded_end_frame <= g_ctx->replay.recorded_start_frame) {
        printf("No recording to play!\n");
        return;
    }
    g_ctx->replay.mode = MODE_PLAYBACK;
    g_ctx->replay.playback_accumulator = 0.0f;
    memset(g_ctx->keyboard, 0, sizeof(g_ctx->keyboard));
    printf("Started playback from frame %d\n", g_ctx->replay.display_frame);
}

EMSCRIPTEN_KEEPALIVE
void js_stop_playback() {
    if (!g_ctx) return;
    if (g_ctx->replay.mode == MODE_PLAYBACK) {
        g_ctx->replay.mode = MODE_PAUSED;
        printf("Stopped playback at frame %d\n", g_ctx->replay.display_frame);
    }
}

EMSCRIPTEN_KEEPALIVE
void js_pause() {
    if (!g_ctx) return;
    if (g_ctx->replay.mode == MODE_LIVE) {
        g_ctx->replay.mode = MODE_PAUSED;
        printf("Paused (was live)\n");
    } else if (g_ctx->replay.mode == MODE_PLAYBACK) {
        g_ctx->replay.mode = MODE_PAUSED;
        printf("Paused playback\n");
    }
}

EMSCRIPTEN_KEEPALIVE
void js_play() {
    if (!g_ctx) return;

    if (g_ctx->replay.mode == MODE_PAUSED) {
        if (g_ctx->replay.display_frame >= g_ctx->replay.recorded_end_frame) {
            js_go_live();
            printf("Play -> Go Live\n");
            return;
        }
        g_ctx->replay.mode = MODE_PLAYBACK;
        g_ctx->replay.playback_accumulator = 0.0f;
        printf("Resumed playback from frame %d\n", g_ctx->replay.display_frame);
        return;
    }

    if (g_ctx->replay.mode == MODE_PLAYBACK) {
        js_go_live();
        printf("Play (during playback) -> Go Live\n");
        return;
    }
}

EMSCRIPTEN_KEEPALIVE
void js_seek_to_frame(int frame) {
    if (!g_ctx) return;

    if (g_ctx->replay.mode == MODE_LIVE) {
        printf("Seeking - stopping live recording\n");
    }
    g_ctx->replay.mode = MODE_PAUSED;

    if (frame < g_ctx->replay.recorded_start_frame) frame = g_ctx->replay.recorded_start_frame;
    if (frame > g_ctx->replay.recorded_end_frame) frame = g_ctx->replay.recorded_end_frame;

    replay_load_frame(g_ctx, frame);
    memset(g_ctx->keyboard, 0, sizeof(g_ctx->keyboard));
}

EMSCRIPTEN_KEEPALIVE
void js_next_frame() {
    if (!g_ctx) return;
    int next = g_ctx->replay.display_frame + 1;
    if (next > g_ctx->replay.recorded_end_frame) {
        next = g_ctx->replay.loop_enabled ? g_ctx->replay.recorded_start_frame : g_ctx->replay.recorded_end_frame;
    }
    js_seek_to_frame(next);
}

EMSCRIPTEN_KEEPALIVE
void js_prev_frame() {
    if (!g_ctx) return;
    int prev = g_ctx->replay.display_frame - 1;
    if (prev < g_ctx->replay.recorded_start_frame) {
        prev = g_ctx->replay.loop_enabled ? g_ctx->replay.recorded_end_frame : g_ctx->replay.recorded_start_frame;
    }
    js_seek_to_frame(prev);
}

EMSCRIPTEN_KEEPALIVE
void js_set_loop(int enabled) {
    if (!g_ctx) return;
    g_ctx->replay.loop_enabled = enabled ? true : false;
}

EMSCRIPTEN_KEEPALIVE
void js_go_live() {
    if (!g_ctx) return;

    g_ctx->replay.mode = MODE_LIVE;
    g_ctx->replay.current_frame = g_ctx->replay.display_frame;

    memset(g_ctx->keyboard, 0, sizeof(g_ctx->keyboard));
    printf("Returned to live mode at frame %d\n", g_ctx->replay.current_frame);
}

EMSCRIPTEN_KEEPALIVE
void js_trim_end(int frame) {
    if (!g_ctx) return;
    
    // Validate frame is within recorded range
    if (frame <= g_ctx->replay.recorded_start_frame) {
        printf("Cannot trim to frame %d (start is %d)\n", frame, g_ctx->replay.recorded_start_frame);
        return;
    }
    if (frame >= g_ctx->replay.recorded_end_frame) {
        printf("Frame %d is already at or past end (%d)\n", frame, g_ctx->replay.recorded_end_frame);
        return;
    }
    
    // Update end frame - this effectively "deletes" frames after this point
    int old_end = g_ctx->replay.recorded_end_frame;
    g_ctx->replay.recorded_end_frame = frame;
    
    // If current display frame is past new end, clamp it
    if (g_ctx->replay.display_frame > frame) {
        replay_load_frame(g_ctx, frame);
    }
    
    // Also update current_frame if needed
    if (g_ctx->replay.current_frame > frame) {
        g_ctx->replay.current_frame = frame;
    }
    
    printf("Trimmed recording: %d -> %d (removed %d frames)\n", old_end, frame, old_end - frame);
}

// ----------------------------------------------------------------------------
// LIVE-CODING ENTRYPOINT
// ----------------------------------------------------------------------------

EMSCRIPTEN_KEEPALIVE
void update_and_render(GameContext *ctx) {
    g_ctx = ctx;

    replay_init_if_needed(ctx);
    loop_init_if_needed(ctx);

    // Simple hotreload detector stored in ctx (no globals).
    // Add these fields to GameContext if you want them persistent:
    // int last_build_id;
    // If you didn't add it, we just print once on init.
    // (If you want the persistent version, tell me and I’ll update game.h too.)

    if (!ctx->initialized) {
        reset_game_live(ctx);
        ctx->initialized = true;

        js_start_recording();

        printf("=== LIVE-CODING SHOOTER ===\n");
        printf("BUILD_ID: %d\n", BUILD_ID);
        printf("Move: Up/Down (Arrow or W/S)\n");
        printf("Shoot: Space\n");
        printf("Restart: R (LIVE)\n");
        printf("Loop: L (record/play/stop)\n");
        printf("Timeline is full-state snapshots\n");
        printf("===========================\n");
    }

    handle_events(ctx);
    update(ctx);
    render(ctx);
}
