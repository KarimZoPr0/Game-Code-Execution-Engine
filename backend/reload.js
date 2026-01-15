// Hot-reload support for live-coding projects
// Only runs if game.wasm exists (live-coding mode)

(function () {
    let isLiveCoding = false;

    // Function pointer wrapper (set by hotreload)
    let updateAndRender = () => { };

    // NEW: exports from SIDE_MODULE (game.wasm)
    let gameExports = null;

    // Expose internal Emscripten dylink functions for hot-reload
    // These become available after the main WASM module is instantiated
    function exposeInternalDylinkFunctions() {
        if (typeof updateGOT !== 'undefined' && !Module.updateGOT) {
            Module.updateGOT = updateGOT;
        }
        if (typeof wasmImports !== 'undefined' && !Module.wasmImports) {
            Module.wasmImports = wasmImports;
        }
    }

    // Prefer calling timeline API from SIDE_MODULE exports.
    // Fallback to Module._js_* for non-live builds (single wasm).
    function getTimelineAPI() {
        if (gameExports) return gameExports;

        // Fallback adapter: map "js_*" to "Module._js_*"
        // (keeps the bridge working in non-live builds too)
        return {
            js_get_current_frame: Module._js_get_current_frame,
            js_get_start_frame: Module._js_get_start_frame,
            js_get_end_frame: Module._js_get_end_frame,
            js_get_playback_frame: Module._js_get_playback_frame,

            js_is_recording: Module._js_is_recording,
            js_is_replaying: Module._js_is_replaying,
            js_is_paused: Module._js_is_paused,

            js_get_event_count: Module._js_get_event_count,
            js_get_sim_speed: Module._js_get_sim_speed,

            js_set_sim_speed: Module._js_set_sim_speed,
            js_start_recording: Module._js_start_recording,
            js_stop_recording: Module._js_stop_recording,
            js_start_playback: Module._js_start_playback,
            js_stop_playback: Module._js_stop_playback,
            js_seek_to_frame: Module._js_seek_to_frame,
            js_next_frame: Module._js_next_frame,
            js_prev_frame: Module._js_prev_frame,
            js_set_loop: Module._js_set_loop,
            js_pause: Module._js_pause,
            js_play: Module._js_play,
            js_go_live: Module._js_go_live,
            js_trim_end: Module._js_trim_end,
        };
    }

    async function reloadWasm() {
        if (!isLiveCoding) return;

        try {
            const url = `${Module.locateFile('game.wasm')}?t=${Date.now()}`;
            const response = await fetch(url);
            const binary = await response.arrayBuffer();

            // Use Emscripten's native loadWebAssemblyModule for proper side module loading
            gameExports = Module.loadWebAssemblyModule(
                new Uint8Array(binary),
                { loadAsync: false, nodelete: false }
            );

            // CRITICAL: Update GOT with replace=true to update global variable addresses
            if (Module.updateGOT) {
                Module.updateGOT(gameExports, true);
                console.log('[HotReload] GOT updated with new global addresses');
            }

            // Also update wasmImports for any new/changed exports
            if (Module.wasmImports) {
                for (const [name, exp] of Object.entries(gameExports)) {
                    Module.wasmImports[name] = exp;
                }
            }

            // update function used by main loop
            updateAndRender = gameExports.update_and_render ?? (() => console.error("update_and_render not exported"));

            console.log('[HotReload] WASM hot-reloaded');
            window.parent.postMessage(
                { type: 'hot-reload-success', reloadCount: window._reloadCount = (window._reloadCount || 0) + 1 },
                '*'
            );
        } catch (e) {
            console.error('[HotReload] WASM reload failed:', e);
            window.parent.postMessage({ type: 'hot-reload-error', error: e.message }, '*');
        }
    }

    async function checkForGameWasm() {
        try {
            const url = Module.locateFile('game.wasm');
            const res = await fetch(url, { method: 'HEAD' });
            return res.ok;
        } catch {
            return false;
        }
    }

    function setupWebSocket() {
        const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${location.host}/ws`;

        let ws;
        let reconnectTimer = null;

        function connect() {
            try {
                ws = new WebSocket(wsUrl);

                ws.onopen = () => {
                    console.log('[HotReload] WebSocket connected');
                    if (reconnectTimer) {
                        clearInterval(reconnectTimer);
                        reconnectTimer = null;
                    }
                };

                ws.onmessage = ({ data }) => {
                    if (data === 'reload' && isLiveCoding) {
                        reloadWasm();
                    }
                };

                ws.onclose = () => {
                    if (!reconnectTimer) {
                        reconnectTimer = setInterval(connect, 3000);
                    }
                };

                ws.onerror = () => { };
            } catch { }
        }

        connect();
    }

    // Hook into Emscripten's runtime initialization
    const origOnRuntimeInit = Module.onRuntimeInitialized;
    Module.onRuntimeInitialized = async function () {
        if (origOnRuntimeInit) origOnRuntimeInit.call(this);

        // Expose internal Emscripten functions for hot-reload with global vars
        exposeInternalDylinkFunctions();

        isLiveCoding = await checkForGameWasm();

        if (isLiveCoding) {
            console.log('[HotReload] Live-coding mode detected');

            // Main module calls this function pointer each frame.
            // We provide a wrapper that forwards to the latest hot-reloaded updateAndRender.
            Module._set_update_and_render_func?.(Module.addFunction(ptr => updateAndRender(ptr), 'vi'));

            // Load side module once at startup
            await reloadWasm();
        } else {
            console.log('[HotReload] Simple build - hot reload disabled');
        }

        setupWebSocket();
        initTimelineBridge();

        window.parent.postMessage({ type: 'preview-ready' }, '*');
    };

    // ========================================================================
    // Timeline Bridge - Communication with Timeline Editor
    // ========================================================================
    function initTimelineBridge() {
        if (window.parent === window) return;

        function sendTimelineState() {
            if (!window.Module) return;

            try {
                const A = getTimelineAPI();

                // In live-coding, this must come from gameExports (SIDE_MODULE).
                // In non-live builds, it may come from Module._js_* via fallback adapter.
                if (!A || typeof A.js_get_current_frame !== 'function') return;

                const state = {
                    type: 'timeline-state',
                    currentFrame: A.js_get_current_frame?.() ?? 0,
                    startFrame: A.js_get_start_frame?.() ?? 0,
                    endFrame: A.js_get_end_frame?.() ?? 0,
                    playbackFrame: A.js_get_playback_frame?.() ?? 0,
                    isRecording: (A.js_is_recording?.() ?? 0) === 1,
                    isReplaying: (A.js_is_replaying?.() ?? 0) === 1,
                    isPaused: (A.js_is_paused?.() ?? 0) === 1,
                    eventCount: A.js_get_event_count?.() ?? 0,
                    simSpeed: A.js_get_sim_speed?.() ?? 1,
                };

                window.parent.postMessage(state, '*');
            } catch {
                // not ready yet
            }
        }

        window.addEventListener('message', function (event) {
            if (!event.data || typeof event.data !== 'object') return;
            if (event.data.type !== 'timeline-command') return;
            if (!window.Module) return;

            const command = event.data.command;
            const data = event.data.data || {};

            try {
                const A = getTimelineAPI();

                switch (command) {
                    case 'start-recording':
                        A.js_start_recording?.();
                        break;
                    case 'stop-recording':
                        A.js_stop_recording?.();
                        break;
                    case 'start-playback':
                        A.js_start_playback?.();
                        break;
                    case 'stop-playback':
                        A.js_stop_playback?.();
                        break;
                    case 'seek-to-frame':
                        if (typeof data.frame === 'number') {
                            A.js_seek_to_frame?.(Math.round(data.frame));
                        }
                        break;
                    case 'next-frame':
                        A.js_next_frame?.();
                        break;
                    case 'prev-frame':
                        A.js_prev_frame?.();
                        break;
                    case 'set-loop':
                        A.js_set_loop?.(data.enabled ? 1 : 0);
                        break;
                    case 'pause':
                        A.js_pause?.();
                        break;
                    case 'play':
                        A.js_play?.();
                        break;
                    case 'go-live':
                        A.js_go_live?.();
                        break;
                    case 'set-sim-speed':
                        if (typeof data.speed === 'number') {
                            A.js_set_sim_speed?.(data.speed);
                        }
                        break;
                    case 'trim-end':
                        if (typeof data.frame === 'number') {
                            A.js_trim_end?.(Math.round(data.frame));
                        }
                        break;
                    case 'get-state':
                        sendTimelineState();
                        break;
                }

                // Send updated state after command
                setTimeout(sendTimelineState, 16);
            } catch (e) {
                console.error('[TimelineBridge] Error:', command, e);
            }
        });

        // Poll and send state every 50ms for smoother updates
        setInterval(sendTimelineState, 50);

        window.parent.postMessage({ type: 'timeline-bridge-ready' }, '*');
        console.log('[TimelineBridge] Initialized');
    }
})();