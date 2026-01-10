const {spawn} = require('child_process');
const {performance} = require('perf_hooks');
const chokidar = require('chokidar');
const WebSocket = require('ws');

const wss = new WebSocket.Server({port:8081, host: '0.0.0.0'});
const notify = () => wss.clients.forEach(c => c.readyState === 1 && c.send('reload'));

function run(name, cmd, args, notifyOnSuccess = false) {
    const start = performance.now();
    spawn(cmd, args, { stdio: 'inherit', shell: true }).on('exit', code => {
        const duration = (performance.now() - start) | 0;
        const status = code === 0 ? '✅' : `❌ (${code})`;
        console[code === 0 ? 'log' : 'error'](`${name} ${status} (${duration} ms)`);
        if (code === 0 && notifyOnSuccess) notify();
    });
}

const MAIN = [
    'sdl_app.c','-o','build/sdl_app.js',
    '-sUSE_SDL=2','-sUSE_SDL_NET=2','-lwebsocket.js',
    '-sWEBSOCKET_URL="ws://127.0.0.1:12345"',
    '-sMAIN_MODULE=1','-sEXPORT_ALL=1',
    '-sALLOW_MEMORY_GROWTH=1',
    '-sEXPORTED_RUNTIME_METHODS="[cwrap,addFunction,wasmMemory,wasmTable]"',
    '-sASSERTIONS=1',
    '-O0',
    '-sWASM_BIGINT',
];

const GAME = [
    'game/game.c','-o','build/game.wasm',
    '-O0',
    '-sSIDE_MODULE=2',
];

run('main', 'emcc', MAIN);
run('game', 'emcc', GAME, true);

chokidar.watch(['game/game.c', 'game/game.h'])
    .on('change', () => {
        run('game', 'emcc', GAME, true);
    });

