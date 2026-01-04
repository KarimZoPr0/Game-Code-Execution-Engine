// API client for communicating with the backend build server
// ========== CHANGE THIS URL WHEN YOUR BACKEND CHANGES ==========
const API_BASE_URL = "https://pvc-soundtrack-simulation-drag.trycloudflare.com";
// ===============================================================

export interface BuildFile {
  path: string;
  content: string;
}

export interface BuildRequest {
  files: BuildFile[];
  entry: string;
  language: "c" | "cpp";
}

export interface BuildResponse {
  buildId: string;
  status: "queued";
}

export interface BuildEvent {
  buildId: string;
  type: "log" | "error" | "status" | "done";
  message?: string;
  phase?: string;
  stream?: "stdout" | "stderr";
  previewUrl?: string;
  success?: boolean;
}

export interface BuildResult {
  ok: boolean;
  previewUrl?: string;
  error?: string;
  status?: string;
  message?: string;
}

// Submit a new build
export async function submitBuild(request: BuildRequest): Promise<BuildResponse> {
  const response = await fetch(`${API_BASE_URL}/api/build`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: "Network error" }));

    if (response.status === 429) {
      const retryAfter = response.headers.get("Retry-After");
      throw new Error(
        error.message || `Rate limited. ${retryAfter ? `Retry after ${retryAfter}s` : "Please try again later."}`,
      );
    }

    throw new Error(error.error || error.message || `Build submission failed: ${response.status}`);
  }

  return response.json();
}

// Subscribe to build events via SSE
export function subscribeToBuildEvents(
  buildId: string,
  onEvent: (event: BuildEvent) => void,
  onError: (error: Error) => void,
): () => void {
  let closed = false;
  let abortController: AbortController | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let reconnectAttempts = 0;
  const MAX_RECONNECT_ATTEMPTS = 5;
  const RECONNECT_DELAY = 2000;

  let gotTerminalEvent = false;

  const scheduleReconnect = () => {
    if (closed) return;

    if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
      reconnectAttempts++;
      reconnectTimer = setTimeout(() => {
        if (!closed) connect();
      }, RECONNECT_DELAY);
    } else {
      onError(new Error("Build event stream disconnected (max reconnect attempts reached)"));
    }
  };

  const connect = async () => {
    if (closed) return;

    abortController = new AbortController();

    try {
      const response = await fetch(`${API_BASE_URL}/api/build/${buildId}/events`, {
        headers: {
          Accept: "text/event-stream",
        },
        credentials: "include",
        signal: abortController.signal,
      });

      if (!response.ok) {
        throw new Error(`SSE connection failed: ${response.status}`);
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      if (!reader) {
        throw new Error("No response body");
      }

      let buffer = "";

      while (!closed) {
        const { done, value } = await reader.read();

        if (done) {
          if (!gotTerminalEvent && !closed) {
            scheduleReconnect();
          }
          return;
        }

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            try {
              const data = JSON.parse(line.slice(6)) as BuildEvent;
              onEvent(data);

              if (data.type === "done" || data.type === "error") {
                gotTerminalEvent = true;
                closed = true;
                return;
              }

              if (data.type === "status") {
                reconnectAttempts = 0;
              }
            } catch (e) {
              console.error("Failed to parse build event:", e);
            }
          } else if (line === ": heartbeat" || line.trim() === "") {
            continue;
          }
        }
      }
    } catch (error) {
      if (closed) return;

      if (error instanceof Error && error.name === "AbortError") {
        return;
      }

      scheduleReconnect();
    }
  };

  connect();

  return () => {
    closed = true;

    if (abortController) {
      abortController.abort();
    }

    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
  };
}

// Get build result via polling
export async function getBuildResult(buildId: string): Promise<BuildResult> {
  const response = await fetch(`${API_BASE_URL}/api/build/${buildId}/result`);

  if (!response.ok) {
    if (response.status === 404) {
      throw new Error("Build not found");
    }
    throw new Error("Failed to get build result");
  }

  return response.json();
}

// Poll build status as a fallback when SSE doesn't work
export function pollBuildStatus(
  buildId: string,
  onEvent: (event: BuildEvent) => void,
  onError: (error: Error) => void,
  interval = 2000
): () => void {
  let stopped = false;
  let lastPhase = "";
  let pollCount = 0;
  const MAX_POLLS = 150; // 5 minutes max with 2s interval

  const poll = async () => {
    if (stopped) return;
    pollCount++;

    if (pollCount > MAX_POLLS) {
      onError(new Error("Build polling timed out"));
      return;
    }

    try {
      const result = await getBuildResult(buildId);
      console.log("[Poll] Build result:", result);

      // Emit status updates based on result
      if (result.status && result.status !== lastPhase) {
        lastPhase = result.status;
        onEvent({ buildId, type: "status", phase: result.status, message: result.message });
      }

      // Check for completion
      if (result.ok && result.previewUrl) {
        onEvent({ buildId, type: "done", success: true, previewUrl: result.previewUrl });
        stopped = true;
        return;
      }

      // Also check if status indicates success
      if (result.status === "success" || result.status === "complete" || result.status === "done") {
        onEvent({ buildId, type: "done", success: true, previewUrl: result.previewUrl });
        stopped = true;
        return;
      }

      if (result.status === "error" || result.status === "failed") {
        onEvent({ buildId, type: "error", message: result.error || "Build failed" });
        stopped = true;
        return;
      }

      // Continue polling
      if (!stopped) {
        setTimeout(poll, interval);
      }
    } catch (err) {
      console.log("[Poll] Error fetching result, retrying...", err);
      if (!stopped) {
        setTimeout(poll, interval);
      }
    }
  };

  console.log("[Poll] Starting build status polling for", buildId);
  poll();

  return () => {
    stopped = true;
  };
}

// Hybrid subscriber: tries SSE first, falls back to polling
export function subscribeToBuild(
  buildId: string,
  onEvent: (event: BuildEvent) => void,
  onError: (error: Error) => void,
): () => void {
  let usePolling = false;
  let unsubSSE: (() => void) | null = null;
  let unsubPoll: (() => void) | null = null;
  let gotFirstEvent = false;

  // Start SSE with a shorter initial timeout - switch to polling if no events
  const sseTimeout = setTimeout(() => {
    if (!gotFirstEvent && !usePolling) {
      console.log("[SSE] No events received in 5s, switching to polling...");
      usePolling = true;
      unsubSSE?.();
      unsubPoll = pollBuildStatus(buildId, onEvent, onError);
    }
  }, 5000);

  unsubSSE = subscribeToBuildEvents(
    buildId,
    (event) => {
      gotFirstEvent = true;
      clearTimeout(sseTimeout);
      onEvent(event);
    },
    (err) => {
      clearTimeout(sseTimeout);
      if (!usePolling) {
        console.log("[SSE] SSE failed, switching to polling...", err.message);
        usePolling = true;
        unsubPoll = pollBuildStatus(buildId, onEvent, onError);
      }
    }
  );

  return () => {
    clearTimeout(sseTimeout);
    unsubSSE?.();
    unsubPoll?.();
  };
}

// Get preview URL for a build
export function getPreviewUrl(buildId: string): string {
  return `${API_BASE_URL}/preview/${buildId}`;
}

// Get API base URL (useful for iframe src)
export function getApiBaseUrl(): string {
  return API_BASE_URL;
}
