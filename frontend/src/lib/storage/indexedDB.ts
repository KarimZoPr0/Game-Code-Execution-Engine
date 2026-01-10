import { Project, ProjectFile } from '@/types/playground';

const DB_NAME = 'codeforge-db';
const DB_VERSION = 1;

interface ExcalidrawDrawing {
  projectId: string;
  data: unknown;
  updatedAt: Date;
}

let dbPromise: Promise<IDBDatabase> | null = null;

function openDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;

      // Projects store
      if (!db.objectStoreNames.contains('projects')) {
        db.createObjectStore('projects', { keyPath: 'id' });
      }

      // Excalidraw drawings store
      if (!db.objectStoreNames.contains('excalidraw')) {
        db.createObjectStore('excalidraw', { keyPath: 'projectId' });
      }
    };
  });

  return dbPromise;
}

// ============ Projects ============

export async function getAllProjects(): Promise<Project[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('projects', 'readonly');
    const store = transaction.objectStore('projects');
    const request = store.getAll();

    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const projects = request.result.map((p: Project) => ({
        ...p,
        createdAt: new Date(p.createdAt),
        updatedAt: new Date(p.updatedAt),
      }));
      resolve(projects);
    };
  });
}

export async function getProject(id: string): Promise<Project | undefined> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('projects', 'readonly');
    const store = transaction.objectStore('projects');
    const request = store.get(id);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      if (request.result) {
        resolve({
          ...request.result,
          createdAt: new Date(request.result.createdAt),
          updatedAt: new Date(request.result.updatedAt),
        });
      } else {
        resolve(undefined);
      }
    };
  });
}

export async function saveProject(project: Project): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('projects', 'readwrite');
    const store = transaction.objectStore('projects');
    const request = store.put(project);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve();
  });
}

export async function deleteProject(id: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('projects', 'readwrite');
    const store = transaction.objectStore('projects');
    const request = store.delete(id);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve();
  });
}

export async function saveAllProjects(projects: Project[]): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('projects', 'readwrite');
    const store = transaction.objectStore('projects');

    transaction.onerror = () => reject(transaction.error);
    transaction.oncomplete = () => resolve();

    for (const project of projects) {
      store.put(project);
    }
  });
}

// ============ Excalidraw Drawings ============

export async function getExcalidrawDrawing(projectId: string): Promise<unknown | undefined> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('excalidraw', 'readonly');
    const store = transaction.objectStore('excalidraw');
    const request = store.get(projectId);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      resolve(request.result?.data);
    };
  });
}

export async function saveExcalidrawDrawing(projectId: string, data: unknown): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('excalidraw', 'readwrite');
    const store = transaction.objectStore('excalidraw');
    const drawing: ExcalidrawDrawing = {
      projectId,
      data,
      updatedAt: new Date(),
    };
    const request = store.put(drawing);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve();
  });
}

export async function deleteExcalidrawDrawing(projectId: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('excalidraw', 'readwrite');
    const store = transaction.objectStore('excalidraw');
    const request = store.delete(projectId);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve();
  });
}

export async function getAllExcalidrawDrawings(): Promise<ExcalidrawDrawing[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('excalidraw', 'readonly');
    const store = transaction.objectStore('excalidraw');
    const request = store.getAll();

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
}
