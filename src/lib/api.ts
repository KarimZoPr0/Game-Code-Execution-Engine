// API client for communicating with the backend build server
// ========== CHANGE THIS URL WHEN YOUR BACKEND CHANGES ==========
const API_BASE_URL = "https://expanding-recipients-valued-cool.trycloudflare.com";
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
      "ngrok-skip-browser-warning": "true",
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

  // NEW: track whether we ever got a terminal event
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
          "ngrok-skip-browser-warning": "true",
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
          // IMPORTANT FIX:
          // Stream ended. If we didn't receive a terminal event, treat this as an unexpected disconnect
          // and reconnect (or ultimately error out).
          if (!gotTerminalEvent && !closed) {
            scheduleReconnect();
          }
          return; // exit connect()
        }

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            try {
              const data = JSON.parse(line.slice(6)) as BuildEvent;
              onEvent(data);

              // Terminal events must end the stream from the UI perspective
              if (data.type === "done" || data.type === "error") {
                gotTerminalEvent = true;
                closed = true;
                return;
              }

              // Optional: treat any status as "connection is alive"
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
        return; // aborted intentionally
      }

      // Reconnect on errors, up to max attempts
      scheduleReconnect();
    }
  };

  // Start the connection
  connect();

  // Return cleanup function
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

// Get build result
export async function getBuildResult(buildId: string): Promise<BuildResult> {
  const response = await fetch(`${API_BASE_URL}/api/build/${buildId}/result`, {
    headers: {
      "ngrok-skip-browser-warning": "true",
    },
  });

  if (!response.ok) {
    if (response.status === 404) {
      throw new Error("Build not found");
    }
    throw new Error("Failed to get build result");
  }

  return response.json();
}

// Get preview URL for a build
export function getPreviewUrl(buildId: string): string {
  // Add ngrok-skip-browser-warning to bypass ngrok's interstitial page
  return `${API_BASE_URL}/preview/${buildId}?ngrok-skip-browser-warning=1`;
}

// Get API base URL (useful for iframe src)
export function getApiBaseUrl(): string {
  return API_BASE_URL;
}
