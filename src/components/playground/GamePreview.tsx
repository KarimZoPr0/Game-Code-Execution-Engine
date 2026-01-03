import React, { useState, useEffect, useRef } from 'react';
import { Play, Pause, Maximize2, Loader2, AlertCircle, Hammer } from 'lucide-react';
import { usePlaygroundStore } from '@/store/playgroundStore';
import { getApiBaseUrl } from '@/lib/api';

const GamePreview: React.FC = () => {
  const { 
    lastBuildId,
    lastPreviewUrl,
    isBuilding,
    buildPhase,
    buildError,
    buildLogs,
  } = usePlaygroundStore();

  const [isRunning, setIsRunning] = useState(false);
  const [iframeKey, setIframeKey] = useState(0);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // Reset running state when a new build starts
  useEffect(() => {
    if (isBuilding) {
      setIsRunning(false);
    }
  }, [isBuilding]);

  // Handle postMessage from iframe
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      // Verify origin if needed
      const apiBase = getApiBaseUrl();
      if (apiBase && !event.origin.includes('localhost') && !event.origin.includes('ngrok')) {
        return;
      }

      const data = event.data;
      if (data.type === 'preview-ready') {
        console.log('Preview is ready!', data.buildId);
      } else if (data.type === 'log') {
        console.log(`[WASM ${data.level}]`, data.message);
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  const handlePlay = () => {
    if (lastPreviewUrl) {
      setIsRunning(true);
      setIframeKey((prev) => prev + 1);
    }
  };

  const handlePause = () => {
    setIsRunning(false);
  };

  const handleFullscreen = () => {
    if (lastPreviewUrl) {
      window.open(lastPreviewUrl, '_blank');
    }
  };

  const canPlay = !!lastPreviewUrl && !isBuilding;
  const showIdle = !isBuilding && !lastPreviewUrl && buildPhase === 'idle';
  const showBuilding = isBuilding;
  const showError = !isBuilding && buildPhase === 'error';
  const showReady = !isBuilding && lastPreviewUrl && !isRunning;
  const showRunning = !isBuilding && lastPreviewUrl && isRunning;

  return (
    <div className="h-full flex flex-col bg-editor-bg">
      {/* Controls */}
      <div className="flex items-center justify-between px-3 py-2 bg-panel-header border-b border-panel-border">
        <div className="flex items-center gap-2">
          <button
            onClick={isRunning ? handlePause : handlePlay}
            disabled={!canPlay}
            className={`p-1.5 rounded transition-colors ${
              !canPlay
                ? 'bg-muted text-muted-foreground cursor-not-allowed'
                : isRunning 
                  ? 'bg-destructive/20 text-destructive hover:bg-destructive/30' 
                  : 'bg-success/20 text-success hover:bg-success/30'
            }`}
            title={canPlay ? (isRunning ? 'Pause' : 'Run') : 'Build first'}
          >
            {isRunning ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
          </button>
        </div>
        <div className="flex items-center gap-2">
          {isBuilding && (
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <Loader2 className="w-3 h-3 animate-spin" />
              {buildPhase}
            </span>
          )}
          {buildPhase === 'success' && !isBuilding && (
            <span className="text-xs text-success">Ready</span>
          )}
          <span className="text-xs text-muted-foreground">800 × 600</span>
          <button 
            onClick={handleFullscreen}
            disabled={!lastPreviewUrl}
            className="p-1.5 hover:bg-muted rounded text-muted-foreground hover:text-foreground disabled:opacity-50 disabled:cursor-not-allowed"
            title="Open in new tab"
          >
            <Maximize2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Preview area */}
      <div className="flex-1 flex items-center justify-center p-4">
        <div className="w-full h-full max-w-[800px] max-h-[600px] bg-[#14141e] rounded border border-panel-border flex items-center justify-center relative overflow-hidden">
          
          {/* Idle state - no build yet */}
          {showIdle && (
            <div className="text-center text-muted-foreground">
              <Hammer className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p className="text-sm">Build your project first</p>
              <p className="text-xs mt-1">Click the Build button in the toolbar</p>
            </div>
          )}

          {/* Building state */}
          {showBuilding && (
            <div className="text-center text-muted-foreground">
              <Loader2 className="w-12 h-12 mx-auto mb-3 animate-spin text-primary" />
              <p className="text-sm font-medium">Building...</p>
              <p className="text-xs mt-1 capitalize">{buildPhase}</p>
              {buildLogs.length > 0 && (
                <div className="mt-4 max-w-md max-h-32 overflow-y-auto bg-black/50 rounded p-2 text-xs font-mono text-left">
                  {buildLogs.slice(-5).map((log) => (
                    <div 
                      key={log.id} 
                      className={log.type === 'stderr' ? 'text-destructive' : 'text-muted-foreground'}
                    >
                      {log.message}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Error state */}
          {showError && (
            <div className="text-center text-destructive">
              <AlertCircle className="w-12 h-12 mx-auto mb-3" />
              <p className="text-sm font-medium">Build failed</p>
              {buildError && <p className="text-xs mt-1">{buildError}</p>}
              {buildLogs.length > 0 && (
                <div className="mt-4 max-w-md max-h-48 overflow-y-auto bg-black/50 rounded p-2 text-xs font-mono text-left">
                  {buildLogs.filter((l) => l.type === 'stderr').slice(-10).map((log) => (
                    <div key={log.id} className="text-destructive">
                      {log.message}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Ready state - can play */}
          {showReady && (
            <div className="text-center text-muted-foreground">
              <button
                onClick={handlePlay}
                className="w-16 h-16 rounded-full bg-success/20 text-success hover:bg-success/30 flex items-center justify-center mb-3 mx-auto transition-colors"
              >
                <Play className="w-8 h-8 ml-1" />
              </button>
              <p className="text-sm">Press play to run</p>
              <p className="text-xs mt-1 text-success">Build successful</p>
            </div>
          )}

          {/* Running state - show iframe */}
          {showRunning && lastPreviewUrl && (
            <iframe
              key={iframeKey}
              ref={iframeRef}
              src={lastPreviewUrl}
              className="w-full h-full border-0"
              allow="autoplay; fullscreen"
              title="Game Preview"
            />
          )}
        </div>
      </div>
    </div>
  );
};

export default GamePreview;
