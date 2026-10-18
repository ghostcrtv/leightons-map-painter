/**
 * Where worlds are kept: IndexedDB in the browser (plenty of room for many worlds).
 * This is the storage ADAPTER — the future iPad app can swap in Capacitor storage here
 * without touching the rest of the game. If IndexedDB is blocked (some private-browsing
 * modes), worlds fall back to localStorage so the game still works.
 */
import type { SavedWorld } from './model';

const DB_NAME = 'leightons-map-painter';
const STORE = 'worlds';
const FALLBACK_KEY = 'lmp.v2.worlds';

let dbPromise: Promise<IDBDatabase | null> | null = null;

function openDb(): Promise<IDBDatabase | null> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve) => {
    try {
      if (typeof indexedDB === 'undefined') return resolve(null);
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'id' });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return dbPromise;
}

function tx<T>(db: IDBDatabase, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const req = fn(t.objectStore(STORE));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function readFallback(): Record<string, SavedWorld> {
  try {
    return JSON.parse(localStorage.getItem(FALLBACK_KEY) ?? '{}') as Record<string, SavedWorld>;
  } catch {
    return {};
  }
}

function writeFallback(all: Record<string, SavedWorld>) {
  try {
    localStorage.setItem(FALLBACK_KEY, JSON.stringify(all));
  } catch (e) {
    console.warn('Could not save the world (storage full or blocked).', e);
    throw e;
  }
}

export async function getAllWorlds(): Promise<unknown[]> {
  const db = await openDb();
  if (!db) return Object.values(readFallback());
  try {
    return await tx(db, 'readonly', (s) => s.getAll());
  } catch {
    return Object.values(readFallback());
  }
}

export async function getWorld(id: string): Promise<unknown | null> {
  const db = await openDb();
  if (!db) return readFallback()[id] ?? null;
  try {
    return (await tx(db, 'readonly', (s) => s.get(id))) ?? null;
  } catch {
    return readFallback()[id] ?? null;
  }
}

export async function putWorld(w: SavedWorld): Promise<void> {
  const db = await openDb();
  if (!db) {
    const all = readFallback();
    all[w.id] = w;
    writeFallback(all);
    return;
  }
  // Store a plain copy (structured clone of plain JSON data).
  await tx(db, 'readwrite', (s) => s.put(JSON.parse(JSON.stringify(w))));
}

export async function removeWorld(id: string): Promise<void> {
  const db = await openDb();
  if (!db) {
    const all = readFallback();
    delete all[id];
    writeFallback(all);
    return;
  }
  await tx(db, 'readwrite', (s) => s.delete(id));
}

/** Ask the browser to keep our data even when space is low (best effort). */
export function requestPersistence() {
  try {
    void navigator.storage?.persist?.();
  } catch {
    /* not supported */
  }
}
