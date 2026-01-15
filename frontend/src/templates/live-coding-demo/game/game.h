#ifndef GAME_H
#define GAME_H

#include <SDL2/SDL.h>
#include <stdbool.h>

#define WINDOW_WIDTH   640
#define WINDOW_HEIGHT  480

#define MAX_KEYBOARD_KEYS   350

// Timeline buffers - reduced to ~50 seconds at 60fps (~6MB instead of ~200MB)
#define MAX_REPLAY_FRAMES   3000
#define MAX_REPLAY_EVENTS   10000

// Simple loop recorder (L key) - 30 seconds at 60fps (~2.5MB)
#define LOOP_MAX_INPUTS     1800

// Shooter limits (kept small enough to snapshot each frame)
#define MAX_BULLETS  64
#define MAX_ENEMIES  24

// Timeline modes
typedef enum {
    MODE_LIVE,
    MODE_PAUSED,
    MODE_PLAYBACK
} TimelineMode;

// Optional: input event log (not used for playback, snapshots are)
typedef struct {
    int frame;
    int scancode;
    int state;
} InputEvent;

typedef struct {
    float x, y;
    float vx;
    int w, h;
    bool alive;
} Bullet;

typedef struct {
    float x, y;
    float vx;
    int r;
    int hp;
    bool alive;
} Enemy;

// Full snapshot of game state for a frame
typedef struct {
    unsigned int rng_state;

    // player
    float player_x, player_y;
    int player_w, player_h;

    // stats
    int score;
    int lives;
    int game_over;

    // timers / difficulty
    int shoot_cooldown;
    int enemy_spawn_timer;
    float difficulty;

    Bullet bullets[MAX_BULLETS];
    Enemy  enemies[MAX_ENEMIES];
} GameSnapshot;

// Simple loop recorder states (L key feature)
typedef enum {
    LOOP_IDLE,       // Not recording or playing
    LOOP_RECORDING,  // Recording inputs
    LOOP_PLAYBACK    // Playing back recorded inputs in loop
} LoopRecorderState;

// Per-frame input snapshot for loop recorder
typedef struct {
    int keyboard[MAX_KEYBOARD_KEYS];
} LoopInputFrame;

// Simple loop recorder data
typedef struct {
    LoopRecorderState state;
    GameSnapshot *start_snapshot;      // Pointer to snapshot (allocated dynamically)
    LoopInputFrame *inputs;            // Array of input frames
    int input_count;                   // Number of recorded frames
    int playback_index;                // Current playback frame index
    int *keyboard_backup;              // Pointer to backup (allocated dynamically)
} LoopRecorder;

// Replay system (lives in ctx)
typedef struct {
    InputEvent   *events;
    GameSnapshot *snapshots;

    int event_count;
    int event_capacity;
    int snapshot_capacity;

    int recorded_start_frame;
    int recorded_end_frame;
    int current_frame;
    int display_frame;

    TimelineMode mode;
    float playback_speed;
    float playback_accumulator;
    bool loop_enabled;
} ReplaySystem;

typedef struct {
    SDL_Renderer *renderer;

    // Live-coding friendly: all runtime state is stored here
    bool initialized;

    // Input
    int keyboard[MAX_KEYBOARD_KEYS];

    // Shooter world
    unsigned int rng_state;

    float player_x, player_y;
    int player_w, player_h;

    int score;
    int lives;
    bool game_over;

    int shoot_cooldown;
    int enemy_spawn_timer;
    float difficulty;

    Bullet bullets[MAX_BULLETS];
    Enemy  enemies[MAX_ENEMIES];

    // simple juice
    float shake;
    float flash;

    // timeline
    ReplaySystem replay;

    // Loop recorder pointer (persists across hot-reloads)
    void *loop_ptr;

    // debug/console ticker
    int console_tick;
} GameContext;

#endif
