// Hot-reload support for live-coding projects
// Only runs if game.wasm exists (live-coding mode)

(function () {
    // Check if this is a live-coding project by looking for game.wasm
    let isLiveCoding = false;
    let updateAndRender = () => { };

    function getWasmImports() {
        const env = {
            memory: Module.wasmMemory,
            table: Module.wasmTable,
            __indirect_function_table: Module.wasmTable,
            __memory_base: Module.__memory_base ?? 1024,
            __table_base: Module.__table_base ?? 0,
            __stack_pointer: new WebAssembly.Global({ value: 'i32', mutable: true }, 5242880),

        };

        for (const key in Module) {
            if (typeof Module[key] === 'function' && key.startsWith('_')) {
                const importName = key.substring(1);
                if (!Object.hasOwn(env, importName)) {
                    env[importName] = Module[key];
                }
            }
        }

        return {
            env,
            wasi_snapshot_preview1: {},
        };
    }

    async function reloadWasm() {
        if (!isLiveCoding) return;

        try {
            const url = `${Module.locateFile('game.wasm')}?t=${Date.now()}`;
            const { instance } = await WebAssembly.instantiateStreaming(await fetch(url), getWasmImports());
            updateAndRender = instance.exports.update_and_render ?? (() => console.error("update_and_render not exported"));
            console.log('WASM hot-reloaded');

            // Notify parent window
            window.parent.postMessage({ type: 'hot-reload-success', reloadCount: window._reloadCount = (window._reloadCount || 0) + 1 }, '*');
        } catch (e) {
            console.error('WASM reload failed:', e);
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
        // Connect to the build server's WebSocket
        // The reload.js is served from /preview/:id/, so we can infer the backend URL
        // Use wss:// for HTTPS, ws:// for HTTP
        const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
        // Connect to the same host that's serving this preview
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
                    // Attempt to reconnect after 3 seconds
                    if (!reconnectTimer) {
                        reconnectTimer = setInterval(connect, 3000);
                    }
                };

                ws.onerror = () => {
                    // Silent - WebSocket is optional for non-live-coding builds
                };
            } catch {
                // WebSocket not available
            }
        }

        connect();
    }

    // Hook into Emscripten's runtime initialization
    const origOnRuntimeInit = Module.onRuntimeInitialized;
    Module.onRuntimeInitialized = async function () {
        // Call original handler if any
        if (origOnRuntimeInit) origOnRuntimeInit.call(this);

        // Check if this is a live-coding project
        isLiveCoding = await checkForGameWasm();

        if (isLiveCoding) {
            console.log('[HotReload] Live-coding mode detected');
            Module._set_update_and_render_func?.(Module.addFunction(ptr => updateAndRender(ptr), 'vi'));
            await reloadWasm();
        } else {
            console.log('[HotReload] Simple build - hot reload disabled');
        }

        // Always try to connect WebSocket for future hot-reload support
        setupWebSocket();

        // Notify parent that preview is ready
        window.parent.postMessage({ type: 'preview-ready' }, '*');
    };
})();
