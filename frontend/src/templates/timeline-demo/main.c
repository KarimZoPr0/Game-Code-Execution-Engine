#include <SDL2/SDL.h>
#include <emscripten.h>
#include <stdbool.h>
#include <stdlib.h>
#include <string.h>
#include <stdio.h>

#define SCREEN_WIDTH 640
#define SCREEN_HEIGHT 480
#define MAX_KEYBOARD_KEYS 350
#define MAX_REPLAY_EVENTS 100000

// Game state snapshot for a single frame
typedef struct {
    float x, y;
    float vx, vy;
} GameSnapshot;

// Input event for reference
typedef struct {
    int frame;
    int scancode;
    int state;
} InputEvent;

// Timeline modes - clearer state machine
typedef enum {
    MODE_LIVE,      // Recording new frames, game is interactive
    MODE_PAUSED,    // Frozen at a specific frame (scrubbing)
    MODE_PLAYBACK   // Playing back recorded frames
} TimelineMode;

// Replay system
typedef struct {
    InputEvent *events;
    GameSnapshot *snapshots;
    int event_count;
    int event_capacity;
    int snapshot_capacity;

    // Frame tracking
    int recorded_start_frame;   // First frame with recorded data
    int recorded_end_frame;     // Last frame with recorded data
    int current_frame;          // Frame counter (always advances in LIVE mode)
    int display_frame;          // Frame currently being displayed

    // Mode
    TimelineMode mode;
    float playback_speed;
    float playback_accumulator; // For fractional speed playback
    bool loop_enabled;

    // Initial state for recording
    float start_x, start_y;
} ReplaySystem;

typedef struct {
    SDL_Window* window;
    SDL_Renderer* renderer;
    bool running;
    float x, y;
    float vx, vy;
    int size;
    int keyboard[MAX_KEYBOARD_KEYS];
    ReplaySystem replay;
} GameState;

GameState game;

// Forward declarations
void replay_init();
void replay_load_frame(int frame);
void replay_record_snapshot();

// ============================================================================
// Replay System Implementation
// ============================================================================

void replay_init() {
    game.replay.event_capacity = MAX_REPLAY_EVENTS;
    game.replay.events = (InputEvent*)malloc(sizeof(InputEvent) * game.replay.event_capacity);

    game.replay.snapshot_capacity = MAX_REPLAY_EVENTS;
    game.replay.snapshots = (GameSnapshot*)malloc(sizeof(GameSnapshot) * game.replay.snapshot_capacity);

    game.replay.event_count = 0;
    game.replay.recorded_start_frame = 0;
    game.replay.recorded_end_frame = 0;
    game.replay.current_frame = 0;
    game.replay.display_frame = 0;
    game.replay.mode = MODE_LIVE;
    game.replay.playback_speed = 1.0f;
    game.replay.playback_accumulator = 0.0f;
    game.replay.loop_enabled = true;

    printf("Replay system initialized\n");
}

// Load game state from a recorded snapshot
void replay_load_frame(int frame) {
    // Clamp to valid range
    if (frame < game.replay.recorded_start_frame) {
        frame = game.replay.recorded_start_frame;
    }
    if (frame > game.replay.recorded_end_frame) {
        frame = game.replay.recorded_end_frame;
    }

    int frame_index = frame - game.replay.recorded_start_frame;
    if (frame_index >= 0 && frame_index < game.replay.snapshot_capacity) {
        GameSnapshot *snapshot = &game.replay.snapshots[frame_index];
        game.x = snapshot->x;
        game.y = snapshot->y;
        game.vx = snapshot->vx;
        game.vy = snapshot->vy;
        game.replay.display_frame = frame;
    }
}

// Record current game state as a snapshot
void replay_record_snapshot() {
    int frame_index = game.replay.current_frame - game.replay.recorded_start_frame;
    if (frame_index >= 0 && frame_index < game.replay.snapshot_capacity) {
        GameSnapshot *snapshot = &game.replay.snapshots[frame_index];
        snapshot->x = game.x;
        snapshot->y = game.y;
        snapshot->vx = game.vx;
        snapshot->vy = game.vy;

        // Update end frame
        if (game.replay.current_frame > game.replay.recorded_end_frame) {
            game.replay.recorded_end_frame = game.replay.current_frame;
        }
    }
}

void replay_record_input_change(int scancode, int state) {
    if (game.replay.mode != MODE_LIVE) return;

    if (game.replay.event_count >= game.replay.event_capacity) {
        printf("Replay buffer full!\n");
        return;
    }

    InputEvent *evt = &game.replay.events[game.replay.event_count++];
    evt->frame = game.replay.current_frame;
    evt->scancode = scancode;
    evt->state = state;
}

// ============================================================================
// JavaScript API
// ============================================================================

EMSCRIPTEN_KEEPALIVE
int js_get_current_frame() {
    // Always return display_frame - this is what's shown on screen
    return game.replay.display_frame;
}

EMSCRIPTEN_KEEPALIVE
int js_get_start_frame() {
    return game.replay.recorded_start_frame;
}

EMSCRIPTEN_KEEPALIVE
int js_get_end_frame() {
    return game.replay.recorded_end_frame;
}

EMSCRIPTEN_KEEPALIVE
int js_get_playback_frame() {
    return game.replay.display_frame;
}

EMSCRIPTEN_KEEPALIVE
int js_is_recording() {
    return (game.replay.mode == MODE_LIVE) ? 1 : 0;
}

EMSCRIPTEN_KEEPALIVE
int js_is_replaying() {
    return (game.replay.mode == MODE_PLAYBACK) ? 1 : 0;
}

EMSCRIPTEN_KEEPALIVE
int js_is_paused() {
    return (game.replay.mode == MODE_PAUSED) ? 1 : 0;
}

EMSCRIPTEN_KEEPALIVE
int js_get_event_count() {
    return game.replay.event_count;
}

EMSCRIPTEN_KEEPALIVE
float js_get_sim_speed() {
    return game.replay.playback_speed;
}

EMSCRIPTEN_KEEPALIVE
void js_set_sim_speed(float speed) {
    game.replay.playback_speed = speed;
    if (speed < 0.0f) game.replay.playback_speed = 0.0f;
    if (speed > 4.0f) game.replay.playback_speed = 4.0f;
}

EMSCRIPTEN_KEEPALIVE
void js_start_recording() {
    // Clear old recording and start fresh
    game.replay.event_count = 0;
    game.replay.recorded_start_frame = game.replay.current_frame;
    game.replay.recorded_end_frame = game.replay.current_frame;
    game.replay.display_frame = game.replay.current_frame;
    game.replay.start_x = game.x;
    game.replay.start_y = game.y;
    game.replay.mode = MODE_LIVE;

    // Clear keyboard state
    memset(game.keyboard, 0, sizeof(game.keyboard));

    printf("Started recording at frame %d\n", game.replay.recorded_start_frame);
}

EMSCRIPTEN_KEEPALIVE
void js_stop_recording() {
    if (game.replay.mode == MODE_LIVE) {
        game.replay.mode = MODE_PAUSED;
        printf("Stopped recording at frame %d (total: %d frames)\n",
               game.replay.recorded_end_frame,
               game.replay.recorded_end_frame - game.replay.recorded_start_frame + 1);
    }
}

EMSCRIPTEN_KEEPALIVE
void js_start_playback() {
    if (game.replay.recorded_end_frame <= game.replay.recorded_start_frame) {
        printf("No recording to play!\n");
        return;
    }

    game.replay.mode = MODE_PLAYBACK;
    game.replay.playback_accumulator = 0.0f;

    // Clear keyboard state for playback
    memset(game.keyboard, 0, sizeof(game.keyboard));

    printf("Started playback from frame %d\n", game.replay.display_frame);
}

EMSCRIPTEN_KEEPALIVE
void js_stop_playback() {
    if (game.replay.mode == MODE_PLAYBACK) {
        game.replay.mode = MODE_PAUSED;
        printf("Stopped playback at frame %d\n", game.replay.display_frame);
    }
}

EMSCRIPTEN_KEEPALIVE
void js_pause() {
    if (game.replay.mode == MODE_LIVE) {
        // Stop recording and pause
        game.replay.mode = MODE_PAUSED;
        printf("Paused (was recording)\n");
    } else if (game.replay.mode == MODE_PLAYBACK) {
        game.replay.mode = MODE_PAUSED;
        printf("Paused playback\n");
    }
    // If already paused, do nothing
}

/*
  FIXED: js_play now lets you "exit" replay modes back to LIVE.
  - If paused at end -> go live
  - If paused in middle -> playback
  - If currently playing back -> go live (escape)
*/
EMSCRIPTEN_KEEPALIVE
void js_play() {
    // If we're paused, decide what "play" means
    if (game.replay.mode == MODE_PAUSED) {

        // If we're at (or past) the end of the recording, resume live gameplay
        if (game.replay.display_frame >= game.replay.recorded_end_frame) {
            // Return to live (interactive) mode
            // (call directly rather than duplicating logic)
            // js_go_live is defined below.
            extern void js_go_live();
            js_go_live();
            printf("Play -> Go Live\n");
            return;
        }

        // Otherwise, resume playback
        game.replay.mode = MODE_PLAYBACK;
        game.replay.playback_accumulator = 0.0f;
        printf("Resumed playback from frame %d\n", game.replay.display_frame);
        return;
    }

    // If we're already playing back, pressing play means "exit replay" -> go live
    if (game.replay.mode == MODE_PLAYBACK) {
        extern void js_go_live();
        js_go_live();
        printf("Play (during playback) -> Go Live\n");
        return;
    }

    // If we're already live, do nothing
}

EMSCRIPTEN_KEEPALIVE
void js_seek_to_frame(int frame) {
    // Stop recording/playback and enter paused scrub mode
    if (game.replay.mode == MODE_LIVE) {
        // First time seeking - stop recording
        printf("Seeking - stopping live recording\n");
    }

    game.replay.mode = MODE_PAUSED;

    // Clamp frame to recorded range
    if (frame < game.replay.recorded_start_frame) {
        frame = game.replay.recorded_start_frame;
    }
    if (frame > game.replay.recorded_end_frame) {
        frame = game.replay.recorded_end_frame;
    }

    // Load the frame
    replay_load_frame(frame);

    // Clear keyboard state
    memset(game.keyboard, 0, sizeof(game.keyboard));
}

EMSCRIPTEN_KEEPALIVE
void js_next_frame() {
    int next = game.replay.display_frame + 1;
    if (next > game.replay.recorded_end_frame) {
        if (game.replay.loop_enabled) {
            next = game.replay.recorded_start_frame;
        } else {
            next = game.replay.recorded_end_frame;
        }
    }
    js_seek_to_frame(next);
}

EMSCRIPTEN_KEEPALIVE
void js_prev_frame() {
    int prev = game.replay.display_frame - 1;
    if (prev < game.replay.recorded_start_frame) {
        if (game.replay.loop_enabled) {
            prev = game.replay.recorded_end_frame;
        } else {
            prev = game.replay.recorded_start_frame;
        }
    }
    js_seek_to_frame(prev);
}

EMSCRIPTEN_KEEPALIVE
void js_set_loop(int enabled) {
    game.replay.loop_enabled = enabled ? true : false;
}

EMSCRIPTEN_KEEPALIVE
void js_go_live() {
    // Return to live recording mode
    // This continues from current position, extending the recording
    game.replay.mode = MODE_LIVE;
    game.replay.current_frame = game.replay.display_frame;

    // Clear keyboard state
    memset(game.keyboard, 0, sizeof(game.keyboard));

    printf("Returned to live mode at frame %d\n", game.replay.current_frame);
}

// ============================================================================
// Game Logic
// ============================================================================

void init() {
    SDL_Init(SDL_INIT_VIDEO);
    game.window = SDL_CreateWindow("SDL Demo with Timeline",
        SDL_WINDOWPOS_CENTERED, SDL_WINDOWPOS_CENTERED,
        SCREEN_WIDTH, SCREEN_HEIGHT, 0);
    game.renderer = SDL_CreateRenderer(game.window, -1, SDL_RENDERER_ACCELERATED);
    game.running = true;
    game.size = 50;
    game.x = (SCREEN_WIDTH - game.size) / 2.0f;
    game.y = (SCREEN_HEIGHT - game.size) / 2.0f;
    game.vx = 0.0f;
    game.vy = 0.0f;

    memset(game.keyboard, 0, sizeof(game.keyboard));

    replay_init();

    // Auto-start recording
    js_start_recording();

    printf("=== TIMELINE DEMO ===\n");
    printf("Arrow Keys: Move square\n");
    printf("Use Timeline Editor to control playback\n");
    printf("=====================\n");
}

void doKeyDown(SDL_KeyboardEvent *event) {
    if (event->repeat != 0) return;

    int scancode = event->keysym.scancode;
    if (scancode >= MAX_KEYBOARD_KEYS) return;

    int old_state = game.keyboard[scancode];
    game.keyboard[scancode] = 1;

    if (old_state != 1) {
        replay_record_input_change(scancode, 1);
    }
}

void doKeyUp(SDL_KeyboardEvent *event) {
    if (event->repeat != 0) return;

    int scancode = event->keysym.scancode;
    if (scancode >= MAX_KEYBOARD_KEYS) return;

    int old_state = game.keyboard[scancode];
    game.keyboard[scancode] = 0;

    if (old_state != 0) {
        replay_record_input_change(scancode, 0);
    }
}

void handle_events() {
    SDL_Event event;
    while (SDL_PollEvent(&event)) {
        if (event.type == SDL_QUIT) {
            game.running = false;
        }
        else if (event.type == SDL_KEYDOWN) {
            // Only process input in LIVE mode
            if (game.replay.mode == MODE_LIVE) {
                doKeyDown(&event.key);
            }

            // R key resets position (works in LIVE mode only)
            if (event.key.keysym.sym == SDLK_r && game.replay.mode == MODE_LIVE) {
                game.x = (SCREEN_WIDTH - game.size) / 2.0f;
                game.y = (SCREEN_HEIGHT - game.size) / 2.0f;
            }
        }
        else if (event.type == SDL_KEYUP) {
            if (game.replay.mode == MODE_LIVE) {
                doKeyUp(&event.key);
            }
        }
    }
}

void update_live() {
    // Handle arrow key movement
    const float speed = 5.0f;
    if (game.keyboard[SDL_SCANCODE_UP]) game.y -= speed;
    if (game.keyboard[SDL_SCANCODE_DOWN]) game.y += speed;
    if (game.keyboard[SDL_SCANCODE_LEFT]) game.x -= speed;
    if (game.keyboard[SDL_SCANCODE_RIGHT]) game.x += speed;

    // Clamp to screen bounds
    if (game.x < 0) game.x = 0;
    if (game.x + game.size > SCREEN_WIDTH) game.x = SCREEN_WIDTH - game.size;
    if (game.y < 0) game.y = 0;
    if (game.y + game.size > SCREEN_HEIGHT) game.y = SCREEN_HEIGHT - game.size;

    // Record snapshot
    replay_record_snapshot();

    // Advance frame
    game.replay.current_frame++;
    game.replay.display_frame = game.replay.current_frame;
}

void update_playback() {
    // Accumulate time based on playback speed
    game.replay.playback_accumulator += game.replay.playback_speed;

    // Advance frames based on accumulated time
    while (game.replay.playback_accumulator >= 1.0f) {
        game.replay.playback_accumulator -= 1.0f;

        int next_frame = game.replay.display_frame + 1;

        if (next_frame > game.replay.recorded_end_frame) {
            if (game.replay.loop_enabled) {
                next_frame = game.replay.recorded_start_frame;
            } else {
                // Stop at end
                game.replay.mode = MODE_PAUSED;
                game.replay.playback_accumulator = 0.0f;
                return;
            }
        }

        replay_load_frame(next_frame);
    }
}

void update() {
    switch (game.replay.mode) {
        case MODE_LIVE:
            update_live();
            break;
        case MODE_PLAYBACK:
            update_playback();
            break;
        case MODE_PAUSED:
            // Do nothing - frozen at current display_frame
            break;
    }
}

void render() {
    // Background color based on mode
    switch (game.replay.mode) {
        case MODE_LIVE:
            SDL_SetRenderDrawColor(game.renderer, 59, 30, 30, 255);  // Red tint - recording
            break;
        case MODE_PLAYBACK:
            SDL_SetRenderDrawColor(game.renderer, 30, 59, 30, 255);  // Green tint - playing
            break;
        case MODE_PAUSED:
            SDL_SetRenderDrawColor(game.renderer, 30, 30, 59, 255);  // Blue tint - paused
            break;
    }

    SDL_RenderClear(game.renderer);

    // Draw square
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

void cleanup() {
    free(game.replay.events);
    free(game.replay.snapshots);
    SDL_DestroyRenderer(game.renderer);
    SDL_DestroyWindow(game.window);
    SDL_Quit();
}

int main(int argc, char* argv[]) {
    init();
    emscripten_set_main_loop(main_loop, 0, 1);
    cleanup();
    return 0;
}
