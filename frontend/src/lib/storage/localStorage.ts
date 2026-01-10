// localStorage keys
const KEYS = {
  LAYOUT: 'codeforge-layout',
  CURRENT_PROJECT_ID: 'codeforge-current-project-id',
  LAST_BUILD: 'codeforge-last-build',
} as const;

// Helper to create per-project keys
const projectTabsKey = (projectId: string) => `codeforge-tabs-${projectId}`;
const projectActiveTabKey = (projectId: string) => `codeforge-active-tab-${projectId}`;

// ============ Layout ============

export function getStoredLayout(): string | null {
  try {
    return localStorage.getItem(KEYS.LAYOUT);
  } catch {
    return null;
  }
}

export function saveLayout(layoutJson: string): void {
  try {
    localStorage.setItem(KEYS.LAYOUT, layoutJson);
  } catch (e) {
    console.warn('Failed to save layout to localStorage:', e);
  }
}

// ============ Tabs (Per-Project) ============

interface StoredTab {
  id: string;
  fileId: string;
  fileName: string;
  language: string;
}

export function getStoredTabs(projectId: string): StoredTab[] {
  try {
    const data = localStorage.getItem(projectTabsKey(projectId));
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
}

export function saveTabs(projectId: string, tabs: StoredTab[]): void {
  try {
    localStorage.setItem(projectTabsKey(projectId), JSON.stringify(tabs));
  } catch (e) {
    console.warn('Failed to save tabs to localStorage:', e);
  }
}

export function getActiveTabId(projectId: string): string | null {
  try {
    return localStorage.getItem(projectActiveTabKey(projectId));
  } catch {
    return null;
  }
}

export function saveActiveTabId(projectId: string, tabId: string | null): void {
  try {
    if (tabId) {
      localStorage.setItem(projectActiveTabKey(projectId), tabId);
    } else {
      localStorage.removeItem(projectActiveTabKey(projectId));
    }
  } catch (e) {
    console.warn('Failed to save active tab ID to localStorage:', e);
  }
}

// ============ Current Project ============

export function getCurrentProjectId(): string | null {
  try {
    return localStorage.getItem(KEYS.CURRENT_PROJECT_ID);
  } catch {
    return null;
  }
}

export function saveCurrentProjectId(projectId: string): void {
  try {
    localStorage.setItem(KEYS.CURRENT_PROJECT_ID, projectId);
  } catch (e) {
    console.warn('Failed to save current project ID to localStorage:', e);
  }
}

// ============ Last Build ============

interface LastBuild {
  buildId: string;
  previewUrl: string;
  projectId: string;
  timestamp: number;
}

export function getLastBuild(): LastBuild | null {
  try {
    const data = localStorage.getItem(KEYS.LAST_BUILD);
    return data ? JSON.parse(data) : null;
  } catch {
    return null;
  }
}

export function saveLastBuild(build: LastBuild): void {
  try {
    localStorage.setItem(KEYS.LAST_BUILD, JSON.stringify(build));
  } catch (e) {
    console.warn('Failed to save last build to localStorage:', e);
  }
}

export function clearLastBuild(): void {
  try {
    localStorage.removeItem(KEYS.LAST_BUILD);
  } catch (e) {
    console.warn('Failed to clear last build from localStorage:', e);
  }
}
