import React, { useEffect, useRef, useState, useCallback } from "react";
import { usePlaygroundStore } from "@/store/playgroundStore";
import { Play, Square, Loader2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";

interface GamePreviewProps {
  onAddPreview?: () => void; // Custom add preview handler (for mobile)
}

const GamePreview: React.FC<GamePreviewProps> = ({ onAddPreview }) => {
  const {
    lastPreviewUrl,
    lastMainBuildId,
    isBuilding,
    pendingHotReload,
    clearPendingHotReload,
    hotReloadReady,
    hotReloadTimestamp,
    clearHotReloadState,
    isLiveCodingProject,
    buildPhase,
    submitBuild,
    addConsoleMessage,
  } = usePlaygroundStore();

  const [isRunning, setIsRunning] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isHotReloading, setIsHotReloading] = useState(false);

  const iframeRef = useRef<HTMLIFrameElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const hotReloadTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Load preview when we have a URL (initial load or full build)
  useEffect(() => {
    if (!lastPreviewUrl) return;

    // For hot-reloads, don't reload the iframe - just clear the flag
    if (pendingHotReload) {
      clearPendingHotReload();
      return;
    }

    // Auto-run on new full build if we were already running or it's the first run
    const currentPath = previewUrl ? new URL(previewUrl).pathname : '';
    const newPath = new URL(lastPreviewUrl).pathname;

    if (newPath !== currentPath) {
      if (isRunning) {
        // Refresh if already running and path changed (new build ID)
        const urlWithTimestamp = `${lastPreviewUrl}${lastPreviewUrl.includes('?') ? '&' : '?'}_t=${Date.now()}`;
        setPreviewUrl(urlWithTimestamp);
      }
    }
  }, [lastPreviewUrl, pendingHotReload, clearPendingHotReload, isRunning, previewUrl]);

  // Forward hot-reload trigger to iframe via postMessage
  useEffect(() => {
    if (!hotReloadReady || !iframeRef.current?.contentWindow) {
      return;
    }

    console.log("[GamePreview] Forwarding hot-reload to iframe");
    setIsHotReloading(true);

    // Set a safety timeout to clear the loading state if iframe doesn't respond
    if (hotReloadTimeoutRef.current) clearTimeout(hotReloadTimeoutRef.current);
    hotReloadTimeoutRef.current = setTimeout(() => {
      if (isHotReloading) {
        console.warn("[GamePreview] Hot-reload timed out waiting for iframe response");
        setIsHotReloading(false);
      }
    }, 2000);

    try {
      iframeRef.current.contentWindow.postMessage({
        type: "hot-reload-trigger",
        timestamp: hotReloadTimestamp,
      }, "*");
    } catch (e) {
      console.error("[GamePreview] Failed to send postMessage:", e);
      setIsHotReloading(false);
    }

    clearHotReloadState();
  }, [hotReloadReady, hotReloadTimestamp, clearHotReloadState]);

  // Listen for messages from iframe
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (!event.data || typeof event.data !== "object") return;

      const { type, error: msgError } = event.data;

      switch (type) {
        case "preview-ready":
          setError(null);
          setIsHotReloading(false);
          break;

        case "hot-reload-success":
          setIsHotReloading(false);
          if (hotReloadTimeoutRef.current) clearTimeout(hotReloadTimeoutRef.current);
          // Don't print success message for hot-reload
          break;

        case "hot-reload-error":
          setIsHotReloading(false);
          if (hotReloadTimeoutRef.current) clearTimeout(hotReloadTimeoutRef.current);
          addConsoleMessage("error", `Hot-reload failed: ${msgError}`);
          break;

        case "log":
          if (event.data.level === "error") {
            addConsoleMessage("error", event.data.message);
          }
          break;
      }
    };

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [addConsoleMessage]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl/Cmd + S = hot-reload (game-only build)
      if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault();
        e.stopPropagation(); // Stop browser save

        if (!isBuilding) {
          if (isLiveCodingProject && lastMainBuildId) {
            submitBuild("game-only");
          } else {
            // If we can't hot reload, do a full build (which might be what they want if no build yet)
            submitBuild("auto");
          }
        }
      }

      // Ctrl/Cmd + Shift + B = full build
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === "B") {
        e.preventDefault();
        e.stopPropagation();
        if (!isBuilding) {
          submitBuild("full");
        }
      }
    };

    // Use capture to try and get the event before other handlers
    window.addEventListener("keydown", handleKeyDown, { capture: true });
    return () => window.removeEventListener("keydown", handleKeyDown, { capture: true });
  }, [isBuilding, isLiveCodingProject, lastMainBuildId, submitBuild]);

  const handleRun = useCallback(() => {
    if (isBuilding) return;

    // If we have a preview URL, just show it
    if (lastPreviewUrl) {
      setIsRunning(true);
      const urlWithTimestamp = `${lastPreviewUrl}${lastPreviewUrl.includes('?') ? '&' : '?'}_t=${Date.now()}`;
      setPreviewUrl(urlWithTimestamp);
      setError(null);
    } else {
      // No build yet, trigger one
      submitBuild("full").then(() => {
        // The effect on lastPreviewUrl will handle showing it once ready if we decide to auto-run
        // But strict Run/Stop usually implies manual start. 
        // We can set a flag or just let the user click run again after build?
        // Better UX: Trigger build, and when build is done, IF it was triggered by Run, start it.
        // For now, let's just trigger build. Store doesn't have "runAfterBuild", but user can click Run again.
        // Actually, let's auto-set running to true so when URL arrives it shows.
        setIsRunning(true);
      });
    }
  }, [lastPreviewUrl, isBuilding, submitBuild]);

  const handleStop = useCallback(() => {
    setIsRunning(false);
    setPreviewUrl(null);
    setError(null);
  }, []);

  return (
    <div className="flex flex-col h-full bg-background" ref={containerRef}>
      {/* Simple Header */}
      <div className="flex items-center gap-2 px-3 py-2 border-b bg-muted/30">

        {isRunning ? (
          <Button
            variant="default"
            size="sm"
            className="h-8 px-3 gap-2 bg-[#FF8F40] hover:bg-[#FF7A26] text-[#1A1F26]"
            onClick={handleStop}
            title="Stop Preview"
          >
            <Square className="h-4 w-4 fill-current" />
            Stop
          </Button>
        ) : (
          <Button
            variant="default"
            size="sm"
            className="h-8 px-3 gap-2 bg-[#C2D94C] hover:bg-[#B3C443] text-[#0A0E14]"
            onClick={handleRun}
            disabled={isBuilding}
            title="Run Project (Ctrl+Shift+B likely needed first if no build)"
          >
            {isBuilding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4 fill-current" />}
            Run
          </Button>
        )}

        {isBuilding && (
          <span className="text-xs text-muted-foreground ml-2 animate-pulse">
            {buildPhase === 'queued' ? 'Queued...' :
              buildPhase === 'compiling' ? 'Compiling...' :
                buildPhase === 'linking' ? 'Linking...' : 'Building...'}
          </span>
        )}

        {/* Spacer */}
        <div className="flex-1" />

        {/* Add Preview Button - only on mobile */}
        {onAddPreview && (
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0"
            onClick={onAddPreview}
            title="Add Preview Panel"
          >
            <Plus className="h-4 w-4" />
          </Button>
        )}
      </div>

      {/* Preview content */}
      <div className="flex-1 relative bg-black overflow-hidden flex items-center justify-center">

        {/* Hot-reload indicator (subtle toast-like, not blocking) */}
        {isHotReloading && isRunning && (
          <div className="absolute top-4 right-4 bg-zinc-800/90 text-white px-3 py-1.5 rounded-full text-xs flex items-center gap-2 border border-zinc-700 shadow-lg z-50">
            <Loader2 className="h-3 w-3 animate-spin text-green-400" />
            Hot-reloading...
          </div>
        )}

        {/* Error overlay */}
        {error && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/80 z-10 text-white p-6">
            <div className="max-w-md text-center">
              <p className="text-red-400 mb-4">{error}</p>
              <Button variant="secondary" onClick={() => setError(null)}>Close</Button>
            </div>
          </div>
        )}

        {/* Iframe */}
        {isRunning && previewUrl ? (
          <iframe
            ref={iframeRef}
            src={previewUrl}
            className="w-full h-full border-0"
            title="Game Preview"
            allow="autoplay; fullscreen; gamepad"
            onError={() => setError("Failed to load preview")}
          />
        ) : (
          // Placeholder when not running
          <div className="text-center text-muted-foreground">
            <div className="mb-2">Click Run to start</div>
            <div className="text-xs opacity-50">
              <p>Ctrl+S to Hot-Reload</p>
              <p>Ctrl+Shift+B to Full Build</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default GamePreview;
