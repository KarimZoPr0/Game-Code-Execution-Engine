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
  const [isLoaded, setIsLoaded] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // Reset loaded state when URL changes
  useEffect(() => {
    setIsLoaded(false);
  }, [lastPreviewUrl]);

  // Handle hot-reload when Build & Run completes
  useEffect(() => {
    if (pendingHotReload && lastPreviewUrl) {
      setIframeKey(prev => prev + 1);
      setIsRunning(true);
      setIsLoaded(false);
      clearPendingHotReload();
    }
  }, [pendingHotReload, lastPreviewUrl, clearPendingHotReload]);

  const handleIframeLoad = () => {
    setIsLoaded(true);
  };

  const handlePlay = () => {
    if (lastPreviewUrl) {
      setIsRunning(true);
    }
  };

  const handlePause = () => {
    setIsRunning(false);
  };

  const handleFullscreen = () => {
    if (lastPreviewUrl) {
      // Open backend preview directly - no wrapper needed, instant
      window.open(lastPreviewUrl, '_blank');
    }
  };

  const canPlay = !!lastPreviewUrl;

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
            disabled={!lastPreviewUrl}
            className="p-1.5 hover:bg-muted rounded text-muted-foreground hover:text-foreground disabled:opacity-50 disabled:cursor-not-allowed"
            title="Open in new tab"
          >
            <Maximize2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Preview area - iframe always mounted for instant loading */}
      <div className="flex-1 bg-[#14141e] overflow-hidden relative">
        {/* Iframe always mounted when URL exists - starts loading immediately */}
        {lastPreviewUrl && (
          <iframe
            key={iframeKey}
            ref={iframeRef}
            src={lastPreviewUrl}
            className={`absolute inset-0 w-full h-full border-0 transition-opacity duration-100 ${
              isRunning && isLoaded ? 'opacity-100' : 'opacity-0 pointer-events-none'
            }`}
            allow="autoplay; fullscreen"
            title="Game Preview"
            onLoad={handleIframeLoad}
          />
        )}
        
        {/* Placeholder shown when not running or loading */}
        {(!isRunning || !isLoaded) && (
          <div className="absolute inset-0 flex items-center justify-center text-muted-foreground text-sm">
            {!lastPreviewUrl 
              ? 'Build your project first'
              : !isRunning 
                ? 'Press play to run'
                : 'Loading...'}
          </div>
        )}
      </div>
    </div>
  );
};

export default GamePreview;
