// Priority queue with job lifecycle management for build jobs
const { EventEmitter } = require('events');

// Priority levels
const PRIORITY = {
    LIVE_CODING: 10,
    REBUILD: 5,
    NORMAL: 1
};

// Job states
const STATE = {
    PENDING: 'pending',
    PROCESSING: 'processing',
    DONE: 'done',
    ERROR: 'error',
    CANCELLED: 'cancelled',
    TIMEOUT: 'timeout'
};

class PriorityHeap {
    constructor() {
        this.heap = [];
    }

    push(item) {
        this.heap.push(item);
        this._bubbleUp(this.heap.length - 1);
    }

    pop() {
        if (this.heap.length === 0) return null;
        if (this.heap.length === 1) return this.heap.pop();

        const top = this.heap[0];
        this.heap[0] = this.heap.pop();
        this._bubbleDown(0);
        return top;
    }

    peek() {
        return this.heap[0] || null;
    }

    get length() {
        return this.heap.length;
    }

    remove(predicate) {
        const idx = this.heap.findIndex(predicate);
        if (idx === -1) return false;

        if (idx === this.heap.length - 1) {
            this.heap.pop();
        } else {
            this.heap[idx] = this.heap.pop();
            this._bubbleDown(idx);
            this._bubbleUp(idx);
        }
        return true;
    }

    _bubbleUp(idx) {
        while (idx > 0) {
            const parent = Math.floor((idx - 1) / 2);
            if (this.heap[parent].priority >= this.heap[idx].priority) break;
            [this.heap[parent], this.heap[idx]] = [this.heap[idx], this.heap[parent]];
            idx = parent;
        }
    }

    _bubbleDown(idx) {
        const len = this.heap.length;
        while (true) {
            const left = 2 * idx + 1;
            const right = 2 * idx + 2;
            let largest = idx;

            if (left < len && this.heap[left].priority > this.heap[largest].priority) {
                largest = left;
            }
            if (right < len && this.heap[right].priority > this.heap[largest].priority) {
                largest = right;
            }
            if (largest === idx) break;

            [this.heap[idx], this.heap[largest]] = [this.heap[largest], this.heap[idx]];
            idx = largest;
        }
    }
}

class BuildQueue extends EventEmitter {
    constructor(options = {}) {
        super();
        this.jobs = new Map();
        this.pending = new PriorityHeap();
        this.processing = new Set();

        // Configuration
        this.maxConcurrency = options.maxConcurrency || 4;
        this.jobTimeout = options.jobTimeout || 5 * 60 * 1000; // 5 minutes
        this.maxJobs = options.maxJobs || 1000;
        this.maxCompleted = options.maxCompleted || 50;

        // Metrics
        this.metrics = {
            totalEnqueued: 0,
            totalCompleted: 0,
            totalFailed: 0,
            totalCancelled: 0,
            totalTimeout: 0,
            avgProcessingTime: 0,
            processingTimes: []
        };

        // Timeout checker
        this._timeoutInterval = setInterval(() => this._checkTimeouts(), 10000);
    }

    /**
     * Enqueue a new job
     */
    enqueue(job) {
        if (this.jobs.size >= this.maxJobs) {
            this.cleanup();
            if (this.jobs.size >= this.maxJobs) {
                throw new Error('Queue is full');
            }
        }

        // Determine priority
        const isLiveCoding = job.files?.some(f => f.path?.includes('game/'));
        const isRebuild = !!job.targetBuildId;

        const priority = job.priority || (
            isLiveCoding ? PRIORITY.LIVE_CODING :
                isRebuild ? PRIORITY.REBUILD :
                    PRIORITY.NORMAL
        );

        const enrichedJob = {
            ...job,
            priority,
            state: STATE.PENDING,
            enqueuedAt: Date.now(),
            startedAt: null,
            completedAt: null
        };

        this.jobs.set(job.id, enrichedJob);
        this.pending.push({ id: job.id, priority });
        this.metrics.totalEnqueued++;

        this.emit('job:added', enrichedJob);
        this.emit('queue:changed', this.getStats());

        return enrichedJob;
    }

    /**
     * Dequeue the highest priority job
     */
    dequeue() {
        if (this.processing.size >= this.maxConcurrency) {
            return null;
        }

        const item = this.pending.pop();
        if (!item) return null;

        const job = this.jobs.get(item.id);
        if (!job || job.state !== STATE.PENDING) {
            // Job was cancelled or already processed, try next
            return this.dequeue();
        }

        job.state = STATE.PROCESSING;
        job.startedAt = Date.now();
        this.processing.add(job.id);

        this.emit('job:started', job);
        return job;
    }

    /**
     * Get job by ID
     */
    getJob(id) {
        return this.jobs.get(id) || null;
    }

    /**
     * Update job properties
     */
    updateJob(id, updates) {
        const job = this.jobs.get(id);
        if (!job) return null;

        const prevState = job.state;
        Object.assign(job, updates);

        // Handle state transitions
        if (updates.status === 'done' || updates.state === STATE.DONE) {
            job.state = STATE.DONE;
            job.completedAt = job.completedAt || Date.now();
            this.processing.delete(id);
            this._recordProcessingTime(job);
            this.metrics.totalCompleted++;
        } else if (updates.status === 'error' || updates.state === STATE.ERROR) {
            job.state = STATE.ERROR;
            job.completedAt = job.completedAt || Date.now();
            this.processing.delete(id);
            this._recordProcessingTime(job);
            this.metrics.totalFailed++;
        }

        this.emit('job:updated', job);
        if (prevState !== job.state) {
            this.emit('queue:changed', this.getStats());
        }

        return job;
    }

    /**
     * Cancel a pending job
     */
    cancelJob(id, reason = 'Cancelled by user') {
        const job = this.jobs.get(id);
        if (!job) return false;

        if (job.state === STATE.PENDING) {
            job.state = STATE.CANCELLED;
            job.error = reason;
            job.completedAt = Date.now();
            this.pending.remove(item => item.id === id);
            this.metrics.totalCancelled++;
            this.emit('job:cancelled', job);
            this.emit(`job:${id}`, { type: 'error', message: reason, cancelled: true });
            return true;
        }

        return false;
    }

    /**
     * Check if there are pending jobs available to process
     */
    hasPending() {
        return this.pending.length > 0 && this.processing.size < this.maxConcurrency;
    }

    /**
     * Get queue statistics
     */
    getStats() {
        return {
            pending: this.pending.length,
            processing: this.processing.size,
            total: this.jobs.size,
            maxConcurrency: this.maxConcurrency,
            metrics: { ...this.metrics }
        };
    }

    /**
     * Clean up old completed jobs
     */
    cleanup() {
        const completed = [];
        for (const [id, job] of this.jobs) {
            if (job.state === STATE.DONE || job.state === STATE.ERROR ||
                job.state === STATE.CANCELLED || job.state === STATE.TIMEOUT) {
                completed.push({ id, time: job.completedAt || 0 });
            }
        }

        completed.sort((a, b) => b.time - a.time);

        // Keep only the most recent completed jobs
        for (let i = this.maxCompleted; i < completed.length; i++) {
            this.jobs.delete(completed[i].id);
        }

        this.emit('queue:cleanup', { removed: Math.max(0, completed.length - this.maxCompleted) });
    }

    /**
     * Check for timed out jobs
     */
    _checkTimeouts() {
        const now = Date.now();
        for (const id of this.processing) {
            const job = this.jobs.get(id);
            if (job && job.startedAt && (now - job.startedAt) > this.jobTimeout) {
                job.state = STATE.TIMEOUT;
                job.error = `Build timed out after ${this.jobTimeout / 1000}s`;
                job.completedAt = now;
                this.processing.delete(id);
                this.metrics.totalTimeout++;
                this.emit('job:timeout', job);
                this.emit(`job:${id}`, { type: 'error', message: job.error, timeout: true });
            }
        }
    }

    /**
     * Record processing time for metrics
     */
    _recordProcessingTime(job) {
        if (job.startedAt && job.completedAt) {
            const time = job.completedAt - job.startedAt;
            this.metrics.processingTimes.push(time);

            // Keep only last 100 times for average calculation
            if (this.metrics.processingTimes.length > 100) {
                this.metrics.processingTimes.shift();
            }

            this.metrics.avgProcessingTime =
                this.metrics.processingTimes.reduce((a, b) => a + b, 0) /
                this.metrics.processingTimes.length;
        }
    }

    /**
     * Graceful shutdown
     */
    shutdown() {
        clearInterval(this._timeoutInterval);
        this.emit('queue:shutdown');
    }
}

// Export constants
BuildQueue.PRIORITY = PRIORITY;
BuildQueue.STATE = STATE;

// Singleton instance
const queue = new BuildQueue();

module.exports = queue;
