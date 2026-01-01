import React from 'react';
import { Play, Pause, RefreshCw, Maximize2 } from 'lucide-react';

const GamePreview: React.FC = () => {
  const [isRunning, setIsRunning] = React.useState(false);

  return (
    <div className="h-full flex flex-col bg-editor-bg">
      {/* Controls */}
      <div className="flex items-center justify-between px-3 py-2 bg-panel-header border-b border-panel-border">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsRunning(!isRunning)}
            className={`p-1.5 rounded ${
              isRunning 
                ? 'bg-destructive/20 text-destructive hover:bg-destructive/30' 
                : 'bg-success/20 text-success hover:bg-success/30'
            }`}
          >
            {isRunning ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
          </button>
          <button className="p-1.5 hover:bg-muted rounded text-muted-foreground hover:text-foreground">
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">800 × 600</span>
          <button className="p-1.5 hover:bg-muted rounded text-muted-foreground hover:text-foreground">
            <Maximize2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Preview area */}
      <div className="flex-1 flex items-center justify-center p-4">
        <div className="w-full h-full max-w-[800px] max-h-[600px] bg-[#14141e] rounded border border-panel-border flex items-center justify-center relative overflow-hidden">
          {isRunning ? (
            <div className="absolute inset-0 flex items-center justify-center">
              {/* Simulated game content */}
              <div className="w-12 h-12 bg-primary rounded animate-pulse-glow" />
              <div className="absolute bottom-4 left-4 text-xs text-muted-foreground font-mono">
                FPS: 60 | Frame: 1234
              </div>
            </div>
          ) : (
            <div className="text-center text-muted-foreground">
              <Play className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p className="text-sm">Press play to run</p>
              <p className="text-xs mt-1">Build your project first</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default GamePreview;
