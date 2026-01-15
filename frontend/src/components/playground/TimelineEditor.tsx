import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Play, Pause, SkipBack, SkipForward, ChevronsLeft, ChevronsRight, Circle, Square, Scissors } from 'lucide-react';
import './TimelineEditor.css';

interface TimelineState {
    currentFrame: number;
    startFrame: number;
    endFrame: number;
    isRecording: boolean;
    isReplaying: boolean;
    isPaused: boolean;
    simSpeed: number;
}

const TimelineEditor: React.FC<{ className?: string }> = ({ className }) => {
    // State from C/WASM
    const [state, setState] = useState<TimelineState>({
        currentFrame: 0,
        startFrame: 0,
        endFrame: 0,
        isRecording: true,
        isReplaying: false,
        isPaused: false,
        simSpeed: 1,
    });

    // UI state
    const [isDragging, setIsDragging] = useState(false);
    const [dragFrame, setDragFrame] = useState(0);
    const [isConnected, setIsConnected] = useState(false);
    const [isTrimming, setIsTrimming] = useState(false);
    const [trimEndFrame, setTrimEndFrame] = useState(0);
    const [hoverFrame, setHoverFrame] = useState<number | null>(null);

    const trackRef = useRef<HTMLDivElement>(null);
    const lastStateTime = useRef<number>(0);
    const isDraggingRef = useRef(false); // Ref for event handlers
    const isTrimmingRef = useRef(false); // Ref for trim event handlers

    // Keep refs in sync
    useEffect(() => {
        isDraggingRef.current = isDragging;
    }, [isDragging]);

    useEffect(() => {
        isTrimmingRef.current = isTrimming;
    }, [isTrimming]);

    // Find iframe and send commands
    const getGameIframe = useCallback((): HTMLIFrameElement | null => {
        const iframes = document.querySelectorAll('iframe[title="Game Preview"]');
        return iframes.length > 0 ? iframes[0] as HTMLIFrameElement : null;
    }, []);

    const sendCommand = useCallback((command: string, data?: any) => {
        const iframe = getGameIframe();
        if (iframe?.contentWindow) {
            iframe.contentWindow.postMessage({ type: 'timeline-command', command, data }, '*');
        }
    }, [getGameIframe]);

    // Listen for state updates from game
    useEffect(() => {
        const handleMessage = (event: MessageEvent) => {
            if (!event.data || typeof event.data !== 'object') return;

            if (event.data.type === 'timeline-state') {
                setIsConnected(true);
                lastStateTime.current = Date.now();

                // Only update state if not currently dragging
                // This prevents the playhead from fighting with user input
                if (!isDraggingRef.current) {
                    setState({
                        currentFrame: event.data.currentFrame ?? 0,
                        startFrame: event.data.startFrame ?? 0,
                        endFrame: event.data.endFrame ?? 0,
                        isRecording: event.data.isRecording ?? false,
                        isReplaying: event.data.isReplaying ?? false,
                        isPaused: event.data.isPaused ?? false,
                        simSpeed: event.data.simSpeed ?? 1,
                    });
                } else {
                    // While dragging, only update non-frame state
                    setState(prev => ({
                        ...prev,
                        startFrame: event.data.startFrame ?? prev.startFrame,
                        endFrame: event.data.endFrame ?? prev.endFrame,
                        isRecording: event.data.isRecording ?? prev.isRecording,
                        isReplaying: event.data.isReplaying ?? prev.isReplaying,
                        isPaused: event.data.isPaused ?? prev.isPaused,
                        simSpeed: event.data.simSpeed ?? prev.simSpeed,
                    }));
                }
            } else if (event.data.type === 'timeline-bridge-ready') {
                setIsConnected(true);
                sendCommand('get-state');
            }
        };

        window.addEventListener('message', handleMessage);
        return () => window.removeEventListener('message', handleMessage);
    }, [sendCommand]);

    // Connection timeout check
    useEffect(() => {
        const check = setInterval(() => {
            if (Date.now() - lastStateTime.current > 500) {
                setIsConnected(false);
            }
        }, 200);
        return () => clearInterval(check);
    }, []);

    // Calculate timeline range - use recorded range or minimum
    const timelineStart = state.startFrame;
    const timelineEnd = Math.max(state.endFrame, state.startFrame + 60, state.currentFrame);
    const totalFrames = timelineEnd - timelineStart;

    // Current display frame (use drag frame while dragging)
    const displayFrame = isDragging ? dragFrame : state.currentFrame;

    // Convert frame to percentage position
    const frameToPercent = useCallback((frame: number): number => {
        if (totalFrames === 0) return 0;
        return ((frame - timelineStart) / totalFrames) * 100;
    }, [timelineStart, totalFrames]);

    // Convert percentage to frame
    const percentToFrame = useCallback((percent: number): number => {
        const frame = timelineStart + (percent / 100) * totalFrames;
        return Math.round(Math.max(timelineStart, Math.min(timelineEnd, frame)));
    }, [timelineStart, timelineEnd, totalFrames]);

    // Calculate frame from mouse position
    const calculateFrameFromMouse = useCallback((clientX: number): number => {
        if (!trackRef.current) return timelineStart;
        const rect = trackRef.current.getBoundingClientRect();
        const percent = Math.max(0, Math.min(100, ((clientX - rect.left) / rect.width) * 100));
        return percentToFrame(percent);
    }, [percentToFrame, timelineStart]);

    // Seek to a specific frame
    const seekToFrame = useCallback((frame: number) => {
        const clampedFrame = Math.max(state.startFrame, Math.min(state.endFrame, frame));
        sendCommand('seek-to-frame', { frame: clampedFrame });
    }, [sendCommand, state.startFrame, state.endFrame]);

    // Transport controls
    const togglePlayPause = useCallback(() => {
        if (state.isRecording) {
            // Stop recording and pause
            sendCommand('pause');
        } else if (state.isPaused) {
            sendCommand('play');
        } else {
            sendCommand('pause');
        }
    }, [sendCommand, state.isRecording, state.isPaused]);

    const goToStart = useCallback(() => {
        seekToFrame(state.startFrame);
    }, [seekToFrame, state.startFrame]);

    const goToEnd = useCallback(() => {
        seekToFrame(state.endFrame);
    }, [seekToFrame, state.endFrame]);

    const stepBackward = useCallback(() => {
        sendCommand('prev-frame');
    }, [sendCommand]);

    const stepForward = useCallback(() => {
        sendCommand('next-frame');
    }, [sendCommand]);

    const toggleRecording = useCallback(() => {
        if (state.isRecording) {
            sendCommand('stop-recording');
        } else {
            sendCommand('go-live'); // Return to live/recording mode
        }
    }, [sendCommand, state.isRecording]);

    // Trim end handle handlers
    const handleTrimStart = useCallback((e: React.MouseEvent) => {
        if (!isConnected || state.isRecording) return;
        e.preventDefault();
        e.stopPropagation();

        setIsTrimming(true);
        setTrimEndFrame(state.endFrame);
    }, [isConnected, state.isRecording, state.endFrame]);

    const handleTrimConfirm = useCallback(() => {
        if (trimEndFrame < state.endFrame && trimEndFrame > state.startFrame) {
            sendCommand('trim-end', { frame: trimEndFrame });
        }
        setIsTrimming(false);
    }, [trimEndFrame, state.endFrame, state.startFrame, sendCommand]);


    // Mouse handlers for scrubbing
    const handleTrackMouseDown = useCallback((e: React.MouseEvent) => {
        if (!isConnected) return;
        e.preventDefault();

        // Don't allow scrubbing if no recording exists
        if (state.endFrame <= state.startFrame) return;

        const frame = calculateFrameFromMouse(e.clientX);
        const clampedFrame = Math.max(state.startFrame, Math.min(state.endFrame, frame));

        setIsDragging(true);
        setDragFrame(clampedFrame);

        // Seek immediately
        sendCommand('seek-to-frame', { frame: clampedFrame });
    }, [isConnected, calculateFrameFromMouse, sendCommand, state.startFrame, state.endFrame]);

    const handleTrackMouseMove = useCallback((e: React.MouseEvent) => {
        const frame = calculateFrameFromMouse(e.clientX);
        setHoverFrame(frame);

        if (isDragging) {
            const clampedFrame = Math.max(state.startFrame, Math.min(state.endFrame, frame));
            setDragFrame(clampedFrame);
            sendCommand('seek-to-frame', { frame: clampedFrame });
        }
    }, [isDragging, calculateFrameFromMouse, sendCommand, state.startFrame, state.endFrame]);

    const handleTrackMouseUp = useCallback(() => {
        if (isDragging) {
            setIsDragging(false);
            // Final seek to ensure we're at the right frame
            sendCommand('seek-to-frame', { frame: dragFrame });
        }
    }, [isDragging, dragFrame, sendCommand]);

    const handleTrackMouseLeave = useCallback(() => {
        setHoverFrame(null);
    }, []);

    // Global mouse handlers for dragging outside track
    useEffect(() => {
        const handleGlobalMouseMove = (e: MouseEvent) => {
            if (!isDragging || !trackRef.current) return;

            const frame = calculateFrameFromMouse(e.clientX);
            const clampedFrame = Math.max(state.startFrame, Math.min(state.endFrame, frame));
            setDragFrame(clampedFrame);
            sendCommand('seek-to-frame', { frame: clampedFrame });
        };

        const handleGlobalMouseUp = () => {
            if (isDragging) {
                setIsDragging(false);
            }
        };

        if (isDragging) {
            window.addEventListener('mousemove', handleGlobalMouseMove);
            window.addEventListener('mouseup', handleGlobalMouseUp);
        }

        return () => {
            window.removeEventListener('mousemove', handleGlobalMouseMove);
            window.removeEventListener('mouseup', handleGlobalMouseUp);
        };
    }, [isDragging, calculateFrameFromMouse, sendCommand, state.startFrame, state.endFrame]);

    // Global handlers for trim dragging
    useEffect(() => {
        const handleTrimMouseMove = (e: MouseEvent) => {
            if (!isTrimmingRef.current || !trackRef.current) return;

            const frame = calculateFrameFromMouse(e.clientX);
            // Clamp to valid range: at least 1 frame, at most current endFrame
            const clampedFrame = Math.max(state.startFrame + 1, Math.min(state.endFrame, frame));
            setTrimEndFrame(clampedFrame);
        };

        const handleTrimMouseUp = () => {
            if (isTrimmingRef.current) {
                handleTrimConfirm();
            }
        };

        if (isTrimming) {
            window.addEventListener('mousemove', handleTrimMouseMove);
            window.addEventListener('mouseup', handleTrimMouseUp);
        }

        return () => {
            window.removeEventListener('mousemove', handleTrimMouseMove);
            window.removeEventListener('mouseup', handleTrimMouseUp);
        };
    }, [isTrimming, calculateFrameFromMouse, state.startFrame, state.endFrame, handleTrimConfirm]);

    // Keyboard shortcuts
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (!isConnected) return;
            if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

            switch (e.key) {
                case ' ':
                    e.preventDefault();
                    togglePlayPause();
                    break;
                case 'ArrowLeft':
                    if (!state.isRecording) {
                        e.preventDefault();
                        if (e.shiftKey) {
                            goToStart();
                        } else {
                            stepBackward();
                        }
                    }
                    break;
                case 'ArrowRight':
                    if (!state.isRecording) {
                        e.preventDefault();
                        if (e.shiftKey) {
                            goToEnd();
                        } else {
                            stepForward();
                        }
                    }
                    break;
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isConnected, togglePlayPause, goToStart, goToEnd, stepBackward, stepForward, state.isRecording]);

    // Generate tick marks for ruler
    const tickInterval = totalFrames > 300 ? 60 : totalFrames > 120 ? 30 : 10;
    const ticks: number[] = [];
    for (let i = timelineStart; i <= timelineEnd; i += tickInterval) {
        ticks.push(i);
    }

    // Playhead position
    const playheadPercent = frameToPercent(displayFrame);

    // Recorded region (where we have data)
    const recordedStartPercent = frameToPercent(state.startFrame);
    const recordedEndPercent = frameToPercent(state.endFrame);
    const trimEndPercent = isTrimming ? frameToPercent(trimEndFrame) : recordedEndPercent;

    // Mode indicator
    const getModeName = () => {
        if (state.isRecording) return 'RECORDING';
        if (state.isReplaying) return 'PLAYING';
        if (state.isPaused) return 'PAUSED';
        return 'IDLE';
    };

    const getModeClass = () => {
        if (state.isRecording) return 'mode-recording';
        if (state.isReplaying) return 'mode-playing';
        if (state.isPaused) return 'mode-paused';
        return '';
    };

    if (!isConnected) {
        return (
            <div className={`timeline-editor timeline-disconnected ${className || ''}`}>
                <div className="timeline-disconnected-content">
                    <span className="timeline-disconnected-text">Run the game to use timeline</span>
                </div>
            </div>
        );
    }

    return (
        <div className={`timeline-editor ${className || ''}`}>
            {/* Controls bar */}
            <div className="timeline-controls">
                {/* Left: Mode indicator and record button */}
                <div className="timeline-left-controls">
                    <button
                        onClick={toggleRecording}
                        className={`timeline-btn timeline-btn-record ${state.isRecording ? 'active' : ''}`}
                        title={state.isRecording ? "Stop Recording" : "Go Live"}
                    >
                        {state.isRecording ? (
                            <Square className="timeline-icon" />
                        ) : (
                            <Circle className="timeline-icon" />
                        )}
                    </button>
                    <span className={`timeline-mode-indicator ${getModeClass()}`}>
                        {getModeName()}
                    </span>
                </div>

                {/* Center: Transport controls */}
                <div className="timeline-transport-wrapper">
                    <div className="timeline-transport">
                        <button
                            onClick={goToStart}
                            className="timeline-btn timeline-btn-nav"
                            title="Go to Start (Shift + ←)"
                            disabled={state.isRecording}
                        >
                            <ChevronsLeft className="timeline-icon" />
                        </button>

                        <button
                            onClick={stepBackward}
                            className="timeline-btn timeline-btn-nav"
                            title="Previous Frame (←)"
                            disabled={state.isRecording}
                        >
                            <SkipBack className="timeline-icon" />
                        </button>

                        <button
                            onClick={togglePlayPause}
                            className={`timeline-btn timeline-btn-play`}
                            title={state.isPaused ? "Play (Space)" : "Pause (Space)"}
                        >
                            {(state.isPaused || state.isRecording) ? (
                                <Play className="timeline-icon timeline-icon-play" />
                            ) : (
                                <Pause className="timeline-icon" />
                            )}
                        </button>

                        <button
                            onClick={stepForward}
                            className="timeline-btn timeline-btn-nav"
                            title="Next Frame (→)"
                            disabled={state.isRecording}
                        >
                            <SkipForward className="timeline-icon" />
                        </button>

                        <button
                            onClick={goToEnd}
                            className="timeline-btn timeline-btn-nav"
                            title="Go to End (Shift + →)"
                            disabled={state.isRecording}
                        >
                            <ChevronsRight className="timeline-icon" />
                        </button>
                    </div>
                </div>

                {/* Right: Speed and frame counter */}
                <div className="timeline-right-controls">
                    <div className="timeline-speed">
                        <input
                            type="range"
                            min="0.1"
                            max="2"
                            step="0.1"
                            value={state.simSpeed}
                            onChange={(e) => sendCommand('set-sim-speed', { speed: parseFloat(e.target.value) })}
                            className="timeline-speed-slider"
                        />
                        <span className="timeline-speed-label">
                            {state.simSpeed.toFixed(1)}x
                        </span>
                    </div>

                    <div className="timeline-frame-counter">
                        <span className="timeline-frame-current">{displayFrame}</span>
                        <span className="timeline-frame-separator"> / </span>
                        <span className="timeline-frame-total">{state.endFrame || '—'}</span>
                    </div>
                </div>
            </div>

            {/* Timeline area */}
            <div className="timeline-area">
                {/* Ruler */}
                <div className="timeline-ruler">
                    {ticks.map((tick) => (
                        <span
                            key={tick}
                            className="timeline-ruler-tick"
                            style={{ left: `${frameToPercent(tick)}%` }}
                        >
                            {tick}
                        </span>
                    ))}
                </div>

                {/* Track */}
                <div
                    ref={trackRef}
                    className={`timeline-track ${isDragging ? 'dragging' : ''} ${state.isRecording ? 'recording' : ''}`}
                    onMouseDown={handleTrackMouseDown}
                    onMouseMove={handleTrackMouseMove}
                    onMouseUp={handleTrackMouseUp}
                    onMouseLeave={handleTrackMouseLeave}
                >
                    {/* Tick lines */}
                    {ticks.map((tick) => (
                        <div
                            key={tick}
                            className="timeline-tick-line"
                            style={{ left: `${frameToPercent(tick)}%` }}
                        />
                    ))}

                    {/* Recorded region highlight */}
                    {state.endFrame > state.startFrame && (
                        <div
                            className={`timeline-recorded-region ${isTrimming ? 'trimming' : ''}`}
                            style={{
                                left: `${recordedStartPercent}%`,
                                width: `${(isTrimming ? trimEndPercent : recordedEndPercent) - recordedStartPercent}%`
                            }}
                        >
                            {/* Trim end handle - only show when not recording */}
                            {!state.isRecording && (
                                <div
                                    className={`timeline-trim-handle timeline-trim-handle-end ${isTrimming ? 'active' : ''}`}
                                    onMouseDown={handleTrimStart}
                                    title="Drag to trim end"
                                >
                                    <Scissors className="timeline-trim-icon" />
                                </div>
                            )}
                        </div>
                    )}

                    {/* Hover line */}
                    {hoverFrame !== null && !isDragging && !state.isRecording && (
                        <div
                            className="timeline-hover-line"
                            style={{ left: `${frameToPercent(hoverFrame)}%` }}
                        />
                    )}

                    {/* Playhead */}
                    <div
                        className={`timeline-playhead ${isDragging ? 'active' : ''}`}
                        style={{ left: `${playheadPercent}%` }}
                    >
                        <div className="timeline-playhead-head" />
                        <div className="timeline-playhead-line" />
                    </div>
                </div>

                {/* Hover frame tooltip */}
                {hoverFrame !== null && !state.isRecording && (
                    <div className="timeline-hover-info">
                        Frame {hoverFrame}
                    </div>
                )}
            </div>
        </div>
    );
};

export default TimelineEditor;