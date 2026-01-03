import React, { useEffect, useMemo, useRef, useState } from "react";
import { Play, Pause, Maximize2 } from "lucide-react";
import { usePlaygroundStore } from "@/store/playgroundStore";

type PreviewStatus = "idle" | "loading" | "ready";

const GamePreview: React.FC = () => {
  const { lastBuildId, lastPreviewUrl, isBuilding, buildPhase, pendingHotReload, clearPendingHotReload } =
    usePlaygroundStore();

  const [isRunning, setIsRunning] = useState(false);

  // Double-buffer state
  const [activeUrl, setActiveUrl] = useState<string | null>(null);
  const [pendingUrl, setPendingUrl] = useState<string | null>(null);
  const [status, setStatus] = useState<PreviewStatus>("idle");

  // Track the latest "load request" to ignore stale events
  const loadTokenRef = useRef(0);

  // Optional: to avoid cache weirdness during dev, you can keep it (safe to remove in prod)
  const effectivePreviewUrl = useMemo(() => {
    if (!lastPreviewUrl) return null;
    return `${lastPreviewUrl}${lastPreviewUrl.includes("?") ? "&" : "?"}v=${Date.now()}`;
  }, [lastPreviewUrl]);

  // When Build & Run completes, preload the new preview invisibly, then swap
  useEffect(() => {
    if (!pendingHotReload || !effectivePreviewUrl) return;

    // Make sure we actually start running
    setIsRunning(true);

    // Start loading hidden iframe
    setStatus("loading");
    setPendingUrl(effectivePreviewUrl);

    clearPendingHotReload();
  }, [pendingHotReload, effectivePreviewUrl, clearPendingHotReload]);

  const handlePlay = () => {
    if (!effectivePreviewUrl) return;
    setIsRunning(true);

    // If nothing active yet, load it as pending and then swap in
    if (!activeUrl) {
      setStatus("loading");
      setPendingUrl(effectivePreviewUrl);
    }
  };

  const handlePause = () => {
    setIsRunning(false);
  };

  const handleFullscreen = () => {
    if (lastBuildId) window.open(`/preview/${lastBuildId}`, "_blank");
  };

  const canPlay = !!effectivePreviewUrl;
  const showRunning = isRunning && (activeUrl || pendingUrl);

  // Promote pending -> active once it finishes loading
  const promotePending = (tokenAtStart: number) => {
    // Ignore stale loads
    if (tokenAtStart !== loadTokenRef.current) return;

    setActiveUrl((prevActive) => {
      // swap in pending
      return pendingUrl ?? prevActive;
    });
    setPendingUrl(null);
    setStatus("ready");
  };

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
                ? "bg-muted text-muted-foreground cursor-not-allowed"
                : isRunning
                  ? "bg-destructive/20 text-destructive hover:bg-destructive/30"
                  : "bg-success/20 text-success hover:bg-success/30"
            }`}
            title={canPlay ? (isRunning ? "Pause" : "Run") : "Build first"}
          >
            {isRunning ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
          </button>
        </div>

        <div className="flex items-center gap-2">
          {isBuilding && <span className="text-xs text-muted-foreground capitalize">{buildPhase}</span>}
          {buildPhase === "success" && !isBuilding && <span className="text-xs text-success">Ready</span>}

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

      {/* Preview area */}
      <div className="flex-1 bg-[#14141e] overflow-hidden relative">
        {showRunning ? (
          <>
            {/* Active iframe (visible) */}
            {activeUrl && (
              <iframe
                key={activeUrl}
                src={activeUrl}
                className="absolute inset-0 w-full h-full border-0"
                allow="autoplay; fullscreen"
                title="Game Preview (active)"
              />
            )}

            {/* Pending iframe (hidden preload) */}
            {pendingUrl && (
              <iframe
                key={pendingUrl}
                src={pendingUrl}
                className="absolute inset-0 w-full h-full border-0 opacity-0 pointer-events-none"
                allow="autoplay; fullscreen"
                title="Game Preview (pending)"
                onLoad={() => {
                  // Each time we start a new pending load, increment token so old loads can't swap
                  // We do it here in a simple way:
                  const token = ++loadTokenRef.current;
                  // Promote on next tick to ensure pendingUrl is current in state
                  setTimeout(() => promotePending(token), 0);
                }}
              />
            )}

            {/* Optional tiny “loading” hint; remove if you truly want zero notice */}
            {status === "loading" && (
              <div className="absolute top-2 right-2 z-10 px-2 py-1 rounded text-xs bg-black/60 text-muted-foreground">
                Loading…
              </div>
            )}
          </>
        ) : (
          <div className="w-full h-full flex items-center justify-center text-muted-foreground text-sm">
            {canPlay ? "Press play to run" : "Build your project first"}
          </div>
        )}
      </div>
    </div>
  );
};

export default GamePreview;
