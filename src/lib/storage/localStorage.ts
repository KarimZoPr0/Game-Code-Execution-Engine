// localStorage keys
const KEYS = {
  LAYOUT: 'codeforge-layout',
  OPEN_TABS: 'codeforge-open-tabs',
  ACTIVE_TAB_ID: 'codeforge-active-tab-id',
  CURRENT_PROJECT_ID: 'codeforge-current-project-id',
  LAST_BUILD: 'codeforge-last-build',
} as const;

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

// ============ Tabs ============

interface StoredTab {
  id: string;
  fileId: string;
  fileName: string;
  language: string;
}

export function getStoredTabs(): StoredTab[] {
  try {
    const data = localStorage.getItem(KEYS.OPEN_TABS);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
}

export function saveTabs(tabs: StoredTab[]): void {
  try {
    localStorage.setItem(KEYS.OPEN_TABS, JSON.stringify(tabs));
  } catch (e) {
    console.warn('Failed to save tabs to localStorage:', e);
  }
}

export function getActiveTabId(): string | null {
  try {
    return localStorage.getItem(KEYS.ACTIVE_TAB_ID);
  } catch {
    return null;
  }
}

export function saveActiveTabId(tabId: string | null): void {
  try {
    if (tabId) {
      localStorage.setItem(KEYS.ACTIVE_TAB_ID, tabId);
    } else {
      localStorage.removeItem(KEYS.ACTIVE_TAB_ID);
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
