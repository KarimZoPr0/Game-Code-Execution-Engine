// Build worker pool - parallel job processing
const { spawn } = require('child_process');
const { EventEmitter } = require('events');
const fs = require('fs');
const path = require('path');
const os = require('os');
const queue = require('./queue');

const BUILDS_DIR = path.join(__dirname, 'builds'); // Persistent storage
const TMP_BUILDS_DIR = '/tmp/builds'; // RAM disk (tmpfs) for fast compilation

// Ensure both directories exist
if (!fs.existsSync(BUILDS_DIR)) {
    fs.mkdirSync(BUILDS_DIR, { recursive: true });
}
if (!fs.existsSync(TMP_BUILDS_DIR)) {
    fs.mkdirSync(TMP_BUILDS_DIR, { recursive: true });
}

// Default emcc flags for simple builds
const DEFAULT_FLAGS = [
    '-sUSE_SDL=2',
    '-sALLOW_MEMORY_GROWTH=1',
    '-sEXPORTED_RUNTIME_METHODS=[cwrap,addFunction,wasmMemory,wasmTable]',
    '-sWASM_BIGINT',
    '-O0',
];

// Default flags for live-coding MAIN module
const MAIN_MODULE_FLAGS = [
    '-sUSE_SDL=2',
    '-sMAIN_MODULE=1',
    '-sEXPORT_ALL=1',
    '-sFORCE_FILESYSTEM=1',
    '-sALLOW_MEMORY_GROWTH=1',
    '-sEXPORTED_RUNTIME_METHODS=[cwrap,addFunction,wasmMemory,wasmTable]',
    '-sWASM_BIGINT',
    '-O0',
];

// Default flags for live-coding GAME module (side module)
const GAME_MODULE_FLAGS = [
    '-sUSE_SDL=2',
    '-sSIDE_MODULE=2',
    '-O0',
];

/**
 * Individual worker that processes a single job at a time
 */
class Worker {
    constructor(id, pool) {
        this.id = id;
        this.pool = pool;
        this.currentJob = null;
        this.busy = false;
    }

    async processJob(job) {
        this.busy = true;
        this.currentJob = job;
        const startTime = Date.now();

        // Build in tmpfs (RAM) for speed
        const tmpBuildDir = path.join(TMP_BUILDS_DIR, job.id);
        // Final location in persistent storage
        const finalBuildDir = path.join(BUILDS_DIR, job.id);

        try {
            // Create temp build directory
            fs.mkdirSync(tmpBuildDir, { recursive: true });

            // Update job status
            queue.updateJob(job.id, {
                status: 'compiling',
                phase: 'compiling',
                buildDir: finalBuildDir,
                workerId: this.id
            });
            this.emit(job.id, { type: 'status', phase: 'compiling', message: 'Compiling...' });

            // Write source files to tmpfs
            const writeStart = Date.now();
            for (const file of job.files) {
                const filePath = path.join(tmpBuildDir, file.path);
                const fileDir = path.dirname(filePath);
                if (!fs.existsSync(fileDir)) {
                    fs.mkdirSync(fileDir, { recursive: true });
                }
                fs.writeFileSync(filePath, file.content);
            }
            const writeTime = Date.now() - writeStart;

            // Determine build flags
            let flags;
            let outputFile;

            if (job.buildProfile && job.buildProfile.args) {
                flags = job.buildProfile.args.filter(arg =>
                    arg !== job.entry && !arg.match(/^[a-zA-Z_][a-zA-Z0-9_]*\.(c|cpp|h|hpp)$/)
                );

                const oIndex = flags.indexOf('-o');
                if (oIndex !== -1 && flags[oIndex + 1]) {
                    outputFile = flags[oIndex + 1];
                    flags.splice(oIndex, 2);
                } else {
                    outputFile = 'index.js';
                }
            } else {
                const isGameModule = job.entry && (
                    job.entry.includes('game/game.c') ||
                    job.entry.includes('game.wasm')
                );

                if (isGameModule) {
                    flags = [...GAME_MODULE_FLAGS];
                    outputFile = 'game.wasm';
                } else if (job.files.some(f => f.path.includes('game/'))) {
                    flags = [...MAIN_MODULE_FLAGS];
                    outputFile = 'index.js';
                } else {
                    flags = [...DEFAULT_FLAGS];
                    outputFile = 'index.js';
                }
            }

            // Build the emcc command (compile in tmpfs)
            const entry = job.entry || 'main.c';
            const outputPath = path.join(tmpBuildDir, outputFile);

            const emccArgs = [
                entry,
                '-o', outputPath,
                ...flags
            ];

            console.log(`[Worker ${this.id}] Building ${job.id}: emcc ${emccArgs.join(' ')}`);

            // Run emcc compilation
            const compileStart = Date.now();
            const result = await this.runEmcc(emccArgs, tmpBuildDir, job.id);
            const compileTime = Date.now() - compileStart;

            if (result.success) {
                // Copy reload.js for hot-reload support
                const reloadSrc = path.join(__dirname, 'reload.js');
                if (fs.existsSync(reloadSrc)) {
                    fs.copyFileSync(reloadSrc, path.join(tmpBuildDir, 'reload.js'));
                }

                // Create preview HTML in tmpfs
                this.createPreviewHtml(tmpBuildDir, outputFile);

                // Copy build results to persistent storage (async, non-blocking)
                const copyStart = Date.now();
                fs.mkdirSync(finalBuildDir, { recursive: true });
                this.copyDirSync(tmpBuildDir, finalBuildDir);
                const copyTime = Date.now() - copyStart;

                // Handle GAME module targeting existing MAIN build
                const hotReloadStart = Date.now();
                if (job.targetBuildId && outputFile === 'game.wasm') {
                    const targetDir = path.join(BUILDS_DIR, job.targetBuildId);
                    if (fs.existsSync(targetDir)) {
                        fs.copyFileSync(
                            path.join(finalBuildDir, 'game.wasm'),
                            path.join(targetDir, 'game.wasm')
                        );
                        this.emit(job.id, {
                            type: 'hot-reload-ready',
                            gameWasmUrl: `/preview/${job.targetBuildId}/game.wasm`,
                            timestamp: Date.now()
                        });
                    }
                }
                const hotReloadTime = Date.now() - hotReloadStart;

                const totalTime = Date.now() - startTime;
                console.log(`[Worker ${this.id}] Build ${job.id} timing: write=${writeTime}ms, compile=${compileTime}ms, copy=${copyTime}ms, hotreload=${hotReloadTime}ms, total=${totalTime}ms`);

                queue.updateJob(job.id, {
                    status: 'done',
                    phase: 'success',
                    completedAt: Date.now(),
                    previewUrl: `/preview/${job.id}/index.html`
                });

                const doneEvent = {
                    type: 'done',
                    success: true,
                    previewUrl: `/preview/${job.id}/index.html`,
                    isLiveCoding: job.files.some(f => f.path.includes('game/'))
                };
                this.emit(job.id, doneEvent);

                // Notify pool of completion
                this.pool.onJobComplete(job.id, doneEvent);

            } else {
                queue.updateJob(job.id, {
                    status: 'error',
                    phase: 'error',
                    error: result.error,
                    completedAt: Date.now()
                });
                this.emit(job.id, { type: 'error', message: result.error });
            }

        } catch (err) {
            console.error(`[Worker ${this.id}] Job ${job.id} failed:`, err);
            queue.updateJob(job.id, {
                status: 'error',
                phase: 'error',
                error: err.message,
                completedAt: Date.now()
            });
            this.emit(job.id, { type: 'error', message: err.message });
        }

        this.currentJob = null;
        this.busy = false;

        // Signal worker is available
        this.pool.dispatch();
    }

    runEmcc(args, cwd, jobId) {
        return new Promise((resolve) => {
            const proc = spawn('emcc', args, {
                cwd,
                shell: true,
                env: { ...process.env }
            });

            let stderr = '';

            proc.stdout.on('data', (data) => {
                const msg = data.toString();
                console.log(`[emcc stdout] ${msg}`);
                this.emit(jobId, { type: 'log', message: msg, stream: 'stdout' });
            });

            proc.stderr.on('data', (data) => {
                const msg = data.toString();
                stderr += msg;
                console.log(`[emcc stderr] ${msg}`);
                this.emit(jobId, { type: 'log', message: msg, stream: 'stderr' });
            });

            proc.on('error', (err) => {
                resolve({ success: false, error: `Failed to start emcc: ${err.message}` });
            });

            proc.on('close', (code) => {
                if (code === 0) {
                    resolve({ success: true });
                } else {
                    resolve({ success: false, error: stderr || `emcc exited with code ${code}` });
                }
            });
        });
    }

    createPreviewHtml(buildDir, outputFile) {
        const isWasm = outputFile.endsWith('.wasm');
        const jsFile = isWasm ? null : outputFile;

        const html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <title>Build Preview</title>
    <style>
        html, body { margin: 0; background: #222; height: 100%; overflow: hidden; }
        #wrapper { display: flex; justify-content: center; align-items: center; width: 100%; height: 100%; }
        canvas { border: 1px solid #555; display: block; touch-action: none; }
    </style>
</head>
<body>
<div id="wrapper">
    <canvas id="canvas" width="640" height="480"></canvas>
</div>
<script>
    const BASE_W = 640, BASE_H = 480;
    const canvas = document.getElementById('canvas');

    function setCssSize() {
        const scale = Math.min(window.innerWidth / BASE_W, window.innerHeight / BASE_H);
        canvas.style.width = \`\${BASE_W * scale}px\`;
        canvas.style.height = \`\${BASE_H * scale}px\`;
    }
    window.addEventListener('resize', setCssSize);
    setCssSize();

    window.Module = {
        canvas,
        locateFile: p => p,
        onRuntimeInitialized() {
            const DPR = window.devicePixelRatio || 1;
            canvas.width = BASE_W * DPR;
            canvas.height = BASE_H * DPR;
            if (Module.SDL2) Module.SDL2.resizeCanvas(canvas.width, canvas.height, false);
            setCssSize();
        }
    };
</script>
${jsFile ? `<script src="${jsFile}" async defer></script>` : ''}
<script src="reload.js" async defer></script>
</body>
</html>`;

        fs.writeFileSync(path.join(buildDir, 'index.html'), html);
    }

    emit(jobId, event) {
        queue.emit(`job:${jobId}`, { buildId: jobId, ...event });
    }

    /**
     * Recursively copy directory contents
     */
    copyDirSync(src, dest) {
        const entries = fs.readdirSync(src, { withFileTypes: true });
        for (const entry of entries) {
            const srcPath = path.join(src, entry.name);
            const destPath = path.join(dest, entry.name);
            if (entry.isDirectory()) {
                fs.mkdirSync(destPath, { recursive: true });
                this.copyDirSync(srcPath, destPath);
            } else {
                fs.copyFileSync(srcPath, destPath);
            }
        }
    }
}

/**
 * Worker pool that manages multiple workers
 */
class WorkerPool extends EventEmitter {
    constructor(options = {}) {
        super();
        this.workers = [];
        // Use MAX_WORKERS env var, or default to min(cpus, 4) to avoid overwhelming limited CPU
        const defaultWorkers = Math.min(Math.max(1, os.cpus().length - 1), 4);
        this.poolSize = parseInt(process.env.MAX_WORKERS) || options.poolSize || defaultWorkers;
        this.running = false;
        this.onBuildComplete = null;
    }

    start() {
        if (this.running) return;
        this.running = true;

        // Create workers
        for (let i = 0; i < this.poolSize; i++) {
            this.workers.push(new Worker(i, this));
        }

        // Listen for new jobs
        queue.on('job:added', () => this.dispatch());

        console.log(`[WorkerPool] Started with ${this.poolSize} workers`);

        // Process any existing pending jobs
        this.dispatch();
    }

    stop() {
        this.running = false;
        console.log('[WorkerPool] Stopped');
    }

    /**
     * Dispatch pending jobs to available workers
     */
    dispatch() {
        if (!this.running) return;

        for (const worker of this.workers) {
            if (!worker.busy && queue.hasPending()) {
                const job = queue.dequeue();
                if (job) {
                    // Process job
                    worker.processJob(job);
                }
            }
        }
    }

    /**
     * Called when a job completes
     */
    onJobComplete(jobId, event) {
        if (typeof this.onBuildComplete === 'function') {
            this.onBuildComplete(jobId, event);
        }
    }

    /**
     * Get pool statistics
     */
    getStats() {
        const busyWorkers = this.workers.filter(w => w.busy).length;
        return {
            poolSize: this.poolSize,
            busyWorkers,
            availableWorkers: this.poolSize - busyWorkers,
            queue: queue.getStats()
        };
    }

    /**
     * Wait for all current jobs to complete
     */
    async drain() {
        while (this.workers.some(w => w.busy)) {
            await new Promise(resolve => setTimeout(resolve, 100));
        }
    }
}

// Singleton
const pool = new WorkerPool();

module.exports = pool;
