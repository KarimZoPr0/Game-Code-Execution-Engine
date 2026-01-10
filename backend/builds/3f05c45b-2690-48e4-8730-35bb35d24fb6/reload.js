function getWasmImports() {
    const env = {
        memory: Module.wasmMemory,
        table:  Module.wasmTable,
        __indirect_function_table: Module.wasmTable,
        __memory_base: Module.__memory_base ?? 1024,
        __table_base:  Module.__table_base  ?? 0,
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

let updateAndRender = () => {};
const reloadWasm = async () => {
    try {
        const url = `${Module.locateFile('game.wasm')}?t=${Date.now()}`;
        const { instance } = await WebAssembly.instantiateStreaming(await fetch(url), getWasmImports());
        updateAndRender = instance.exports.update_and_render ?? (() => console.error("update_and_render not exported"));
        console.log('WASM hot-reloaded');
    } catch (e) {
        console.error('WASM reload failed:', e);
    }
};

Module.onRuntimeInitialized = async () => {
    Module._set_update_and_render_func?.(Module.addFunction(ptr => updateAndRender(ptr), 'vi'));
    await reloadWasm();
    setupWebSocket();
};

function setupWebSocket() {
    const ws = new WebSocket(`ws://${location.hostname}:8081`);
    ws.onmessage = ({ data }) => data === 'reload' && reloadWasm();
    ws.onopen  = () => console.log('WebSocket ready for hot reload');
    ws.onerror = console.error;
}
