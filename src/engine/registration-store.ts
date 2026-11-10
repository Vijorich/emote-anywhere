import type { ChatRegistration } from '../core/types';

const DB_NAME = 'emote-anywhere-registrations';
const DB_VERSION = 2;
const STORE = 'registrations';
const MAX_REGISTRATIONS = 20;

interface StoredRegistration {
  key: string;
  at: number;
  registration: ChatRegistration;
}

let dbPromise: Promise<IDBDatabase | null> | null = null;

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed'));
  });
}

function openDb(): Promise<IDBDatabase | null> {
  if (dbPromise) return dbPromise;
  if (typeof indexedDB === 'undefined') {
    dbPromise = Promise.resolve(null);
    return dbPromise;
  }
  dbPromise = new Promise((resolve) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: 'key' });
        store.createIndex('at', 'at');
      } else {
        const store = request.transaction?.objectStore(STORE);
        if (store && !store.indexNames.contains('at')) store.createIndex('at', 'at');
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null);
    request.onblocked = () => resolve(null);
  });
  return dbPromise;
}

export async function getStoredRegistration(key: string): Promise<ChatRegistration | null> {
  const db = await openDb();
  if (!db) return null;
  try {
    const tx = db.transaction(STORE, 'readonly');
    const value = (await requestResult(tx.objectStore(STORE).get(key))) as
      | StoredRegistration
      | undefined;
    return value?.registration ?? null;
  } catch {
    return null;
  }
}

export async function putStoredRegistration(
  key: string,
  registration: ChatRegistration,
): Promise<void> {
  const db = await openDb();
  if (!db) return;
  try {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put({ key, at: Date.now(), registration } satisfies StoredRegistration);
    await new Promise<void>((resolve) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
    await evictRegistrations(db);
  } catch {
    // IDB is an optimisation; the background cache still works.
  }
}

async function evictRegistrations(db: IDBDatabase): Promise<void> {
  const readTx = db.transaction(STORE, 'readonly');
  const keys = await requestResult(
    readTx.objectStore(STORE).index('at').getAllKeys(),
  );
  if (keys.length <= MAX_REGISTRATIONS) return;
  const remove = keys.length - MAX_REGISTRATIONS;
  const tx = db.transaction(STORE, 'readwrite');
  const store = tx.objectStore(STORE);
  for (const key of keys.slice(0, remove)) store.delete(key);
  await new Promise<void>((resolve) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve();
  });
}

export async function clearStoredRegistrations(): Promise<void> {
  const db = await openDb();
  if (!db) return;
  try {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).clear();
    await new Promise<void>((resolve) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch {
    // Ignore.
  }
}
