import React, { useEffect, useMemo, useRef, useState } from "react";
import { Play, Pause, Maximize2 } from "lucide-react";
import { usePlaygroundStore } from "@/store/playgroundStore";

type PreviewStatus = "idle" | "loading" | "ready";

const GamePreview: React.FC = () => {
  const { lastBuildId, lastPreviewUrl, isBuilding, buildPhase, pendingHotReload, clearPendingHotReload } =
    usePlaygroundStore();

  const [isRunning, setIsRunning] = useState(false);

  // Double-buffer
  const [activeUrl, setActiveUrl] = useState<string | null>(null);
  const [pendingUrl, setPendingUrl] = useState<string | null>(null);
  const [status, setStatus] = useState<PreviewStatus>("idle");

  // We swap ONLY when we get preview-ready for THIS buildId
  const pendingBuildIdRef = useRef<string | null>(null);

  // Use buildId as the version (DON'T add Date.now(); it defeats caching and slows reload)
  const next = useMemo(() => {
    if (!lastBuildId || !lastPreviewUrl) return null;
    return { buildId: lastBuildId, url: lastPreviewUrl };
  }, [lastBuildId, lastPreviewUrl]);

  const startPending = (url: string, buildId: string) => {
    pendingBuildIdRef.current = buildId;
    setPendingUrl(url);
    setStatus("loading");
  };

  // Build & Run finished: immediately start loading the new iframe hidden
  useEffect(() => {
    if (!pendingHotReload || !next) return;

    setIsRunning(true);
    startPending(next.url, next.buildId);

    clearPendingHotReload();
  }, [pendingHotReload, next, clearPendingHotReload]);

  // First-run: if user hits play and we have a build but nothing loaded yet
  const handlePlay = () => {
    if (!next) return;
    setIsRunning(true);

    if (!activeUrl && !pendingUrl) {
      startPending(next.url, next.buildId);
    }
  };

  const handlePause = () => setIsRunning(false);

  const handleFullscreen = () => {
    if (lastBuildId) window.open(`/preview/${lastBuildId}`, "_blank");
  };

  // Listen for preview-ready from the iframe (sent by backend wrapper)
  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (!e?.data || e.data.type !== "preview-ready") return;

      const buildId = String(e.data.buildId ?? "");
      if (!buildId) return;

      // Only accept ready for the currently pending build
      if (pendingBuildIdRef.current !== buildId) return;

      // Promote pending -> active
      setActiveUrl(pendingUrl);
      setPendingUrl(null);
      pendingBuildIdRef.current = null;
      setStatus("ready");
    };

    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [pendingUrl]);

  const canPlay = !!next;
  const showRunning = isRunning && (activeUrl || pendingUrl);

  return (
    <div className="h-full w-full flex flex-col">
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
          {status === "loading" && <span className="text-xs text-muted-foreground">Loading…</span>}

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

      {/* Preview area (NO forced background) */}
      <div className="flex-1 overflow-hidden relative">
        {showRunning ? (
          <>
            {/* Active iframe (visible) */}
            {activeUrl && (
              <iframe
                key={activeUrl}
                src={activeUrl}
                className="absolute inset-0 w-full h-full border-0 block"
                allow="autoplay; fullscreen"
                title="Game Preview (active)"
                sandbox="allow-scripts allow-same-origin allow-pointer-lock"
              />
            )}

            {/* Pending iframe (hidden preload) */}
            {pendingUrl && (
              <iframe
                key={pendingUrl}
                src={pendingUrl}
                className="absolute inset-0 w-full h-full border-0 block opacity-0 pointer-events-none"
                allow="autoplay; fullscreen"
                title="Game Preview (pending)"
                sandbox="allow-scripts allow-same-origin allow-pointer-lock"
              />
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
