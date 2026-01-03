// API client for communicating with the backend build server
const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

export interface BuildFile {
  path: string;
  content: string;
}

export interface BuildRequest {
  files: BuildFile[];
  entry: string;
  language: 'c' | 'cpp';
}

export interface BuildResponse {
  buildId: string;
  status: 'queued';
}

export interface BuildEvent {
  buildId: string;
  type: 'log' | 'error' | 'status' | 'done';
  message?: string;
  phase?: string;
  stream?: 'stdout' | 'stderr';
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
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'ngrok-skip-browser-warning': 'true',
    },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Network error' }));

    if (response.status === 429) {
      const retryAfter = response.headers.get('Retry-After');
      throw new Error(
        error.message || `Rate limited. ${retryAfter ? `Retry after ${retryAfter}s` : 'Please try again later.'}`
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
  onError: (error: Error) => void
): () => void {
  const eventSource = new EventSource(`${API_BASE_URL}/api/build/${buildId}/events`);

  eventSource.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data) as BuildEvent;
      onEvent(data);
      
      // Close on done or error
      if (data.type === 'done' || data.type === 'error') {
        eventSource.close();
      }
    } catch (e) {
      console.error('Failed to parse build event:', e);
    }
  };

  eventSource.onerror = () => {
    eventSource.close();
    onError(new Error('Build event stream disconnected'));
  };

  return () => {
    eventSource.close();
  };
}

// Get build result
export async function getBuildResult(buildId: string): Promise<BuildResult> {
  const response = await fetch(`${API_BASE_URL}/api/build/${buildId}/result`, {
    headers: {
      'ngrok-skip-browser-warning': 'true',
    },
  });

  if (!response.ok) {
    if (response.status === 404) {
      throw new Error('Build not found');
    }
    throw new Error('Failed to get build result');
  }

  return response.json();
}

// Get preview URL for a build
export function getPreviewUrl(buildId: string): string {
  return `${API_BASE_URL}/preview/${buildId}`;
}

// Get API base URL (useful for iframe src)
export function getApiBaseUrl(): string {
  return API_BASE_URL;
}
