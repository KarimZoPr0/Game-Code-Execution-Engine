import React, { useState, useEffect, useRef } from 'react';
import { Play, Pause, Maximize2 } from 'lucide-react';
import { usePlaygroundStore } from '@/store/playgroundStore';

const GamePreview: React.FC = () => {
  const {
    lastBuildId,
    lastPreviewUrl,
    isBuilding,
    buildPhase,
    pendingHotReload,
    clearPendingHotReload,
  } = usePlaygroundStore();
  
  const [isRunning, setIsRunning] = useState(false);
  const [iframeKey, setIframeKey] = useState(0);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // Handle hot-reload when Build & Run completes
  useEffect(() => {
    if (pendingHotReload && lastPreviewUrl) {
      if (isRunning) {
        // Hot-swap: just reload the iframe
        setIframeKey(prev => prev + 1);
      } else {
        // Auto-start: begin running
        setIsRunning(true);
      }
      clearPendingHotReload();
    }
  }, [pendingHotReload, isRunning, lastPreviewUrl, clearPendingHotReload]);

  const handlePlay = () => {
    if (lastPreviewUrl) {
      setIsRunning(true);
      setIframeKey(prev => prev + 1);
    }
  };

  const handlePause = () => {
    setIsRunning(false);
  };

  const handleFullscreen = () => {
    if (lastBuildId) {
      // Use published URL for sharing
      window.open(`https://playpen-canvas.lovable.app/preview/${lastBuildId}`, '_blank');
    }
  };

  const canPlay = !!lastPreviewUrl;
  const showRunning = lastPreviewUrl && isRunning;

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
            <span className="text-xs text-muted-foreground capitalize">
              {buildPhase}
            </span>
          )}
          {buildPhase === 'success' && !isBuilding && (
            <span className="text-xs text-success">Ready</span>
          )}

          <button
            onClick={handleFullscreen}
            disabled={!lastBuildId}
            className="p-1.5 hover:bg-muted rounded text-muted-foreground hover:text-foreground disabled:opacity-50 disabled:cursor-not-allowed"
            title="Open in new tab"
          >
            <Maximize2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Preview area - full canvas, no overlays */}
      <div className="flex-1 bg-[#14141e] overflow-hidden">
        {showRunning && lastPreviewUrl ? (
          <iframe
            key={iframeKey}
            ref={iframeRef}
            src={lastPreviewUrl}
            className="w-full h-full border-0"
            allow="autoplay; fullscreen"
            title="Game Preview"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-muted-foreground text-sm">
            {canPlay ? 'Press play to run' : 'Build your project first'}
          </div>
        )}
      </div>
    </div>
  );
};

export default GamePreview;
