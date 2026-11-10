import { browser } from 'wxt/browser';
import { IMAGE_CACHE_EPOCH_KEY } from '../core/config';

const DB_NAME = 'emote-anywhere-images';
const DB_VERSION = 1;
const IMAGE_STORE = 'images';
const META_STORE = 'meta';
const MAX_BYTES = 24 * 1024 * 1024;
const MAX_ENTRIES = 400;

interface StoredImage {
  url: string;
  dataUrl: string;
  bytes: number;
  at: number;
}

interface CacheStats {
  key: 'stats';
  bytes: number;
  count: number;
  epoch: number;
}

let dbPromise: Promise<IDBDatabase | null> | null = null;
let writeQueue: Promise<void> = Promise.resolve();

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed'));
  });
}

async function currentEpoch(): Promise<number> {
  try {
    const value = (await browser.storage.local.get(IMAGE_CACHE_EPOCH_KEY))[IMAGE_CACHE_EPOCH_KEY];
    return typeof value === 'number' && Number.isFinite(value) ? value : 0;
  } catch {
    return 0;
  }
}

async function ensureEpoch(db: IDBDatabase): Promise<void> {
  const epoch = await currentEpoch();
  const readTx = db.transaction(META_STORE, 'readonly');
  const stats = (await requestResult(readTx.objectStore(META_STORE).get('stats'))) as
    | CacheStats
    | undefined;
  if (stats && stats.epoch === epoch) return;
  const tx = db.transaction([IMAGE_STORE, META_STORE], 'readwrite');
  tx.objectStore(IMAGE_STORE).clear();
  tx.objectStore(META_STORE).put({
    key: 'stats',
    bytes: 0,
    count: 0,
    epoch,
  } satisfies CacheStats);
  await new Promise<void>((resolve) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve();
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
      if (!db.objectStoreNames.contains(IMAGE_STORE)) {
        const store = db.createObjectStore(IMAGE_STORE, { keyPath: 'url' });
        store.createIndex('at', 'at');
      }
      if (!db.objectStoreNames.contains(META_STORE)) {
        db.createObjectStore(META_STORE, { keyPath: 'key' });
      }
    };
    request.onsuccess = () => {
      const db = request.result;
      ensureEpoch(db)
        .catch(() => undefined)
        .finally(() => resolve(db));
    };
    request.onerror = () => resolve(null);
    request.onblocked = () => resolve(null);
  });
  return dbPromise;
}

async function getStats(db: IDBDatabase): Promise<CacheStats> {
  const tx = db.transaction(META_STORE, 'readonly');
  const stats = (await requestResult(tx.objectStore(META_STORE).get('stats'))) as
    | CacheStats
    | undefined;
  return stats ?? { key: 'stats', bytes: 0, count: 0, epoch: await currentEpoch() };
}

async function evictIfNeeded(db: IDBDatabase): Promise<void> {
  const stats = await getStats(db);
  if (stats.bytes <= MAX_BYTES && stats.count <= MAX_ENTRIES) return;

  const tx = db.transaction([IMAGE_STORE, META_STORE], 'readwrite');
  const imageStore = tx.objectStore(IMAGE_STORE);
  const metaStore = tx.objectStore(META_STORE);
  let bytes = stats.bytes;
  let count = stats.count;

  await new Promise<void>((resolve) => {
    const cursor = imageStore.index('at').openCursor();
    cursor.onsuccess = () => {
      const current = cursor.result;
      if (!current || (bytes <= MAX_BYTES && count <= MAX_ENTRIES)) {
        metaStore.put({ ...stats, bytes: Math.max(0, bytes), count: Math.max(0, count) });
        resolve();
        return;
      }
      const value = current.value as StoredImage;
      bytes -= value.bytes;
      count -= 1;
      current.delete();
      current.continue();
    };
    cursor.onerror = () => resolve();
  });
}

export async function getStoredImages(urls: string[]): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  const db = await openDb();
  if (!db || !urls.length) return result;
  try {
    const tx = db.transaction(IMAGE_STORE, 'readonly');
    const store = tx.objectStore(IMAGE_STORE);
    const values = await Promise.all(urls.map((url) => requestResult<StoredImage | undefined>(store.get(url))));
    for (const value of values) {
      if (value?.dataUrl) result.set(value.url, value.dataUrl);
    }
  } catch {
    return result;
  }
  return result;
}

async function getStoredImage(db: IDBDatabase, url: string): Promise<StoredImage | undefined> {
  const tx = db.transaction(IMAGE_STORE, 'readonly');
  return requestResult<StoredImage | undefined>(tx.objectStore(IMAGE_STORE).get(url));
}

export function putStoredImage(url: string, dataUrl: string): Promise<void> {
  const operation = writeQueue.then(async () => {
    const db = await openDb();
    if (!db) return;
    const bytes = dataUrl.length;
    try {
      const previous = await getStoredImage(db, url);
      const base = await getStats(db);
      const tx = db.transaction([IMAGE_STORE, META_STORE], 'readwrite');
      const imageStore = tx.objectStore(IMAGE_STORE);
      const metaStore = tx.objectStore(META_STORE);
      imageStore.put({ url, dataUrl, bytes, at: Date.now() } satisfies StoredImage);
      metaStore.put({
        ...base,
        bytes: Math.max(0, base.bytes - (previous?.bytes ?? 0) + bytes),
        count: base.count + (previous ? 0 : 1),
      } satisfies CacheStats);
      await new Promise<void>((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error ?? new Error('IndexedDB write failed'));
      });
      await evictIfNeeded(db);
    } catch {
      // A full or unavailable page database must not break emote rendering.
    }
  });
  writeQueue = operation.catch(() => undefined);
  return operation;
}

export function removeStoredImage(url: string): Promise<void> {
  const operation = writeQueue.then(async () => {
    const db = await openDb();
    if (!db) return;
    try {
      const previous = await getStoredImage(db, url);
      if (!previous) return;
      const stats = await getStats(db);
      const tx = db.transaction([IMAGE_STORE, META_STORE], 'readwrite');
      tx.objectStore(IMAGE_STORE).delete(url);
      tx.objectStore(META_STORE).put({
        key: 'stats',
        bytes: Math.max(0, stats.bytes - previous.bytes),
        count: Math.max(0, stats.count - 1),
        epoch: stats.epoch,
      } satisfies CacheStats);
      await new Promise<void>((resolve) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      });
    } catch {
      // Ignore; memory fallback still works.
    }
  });
  writeQueue = operation.catch(() => undefined);
  return operation;
}

export function clearStoredImages(): Promise<void> {
  const operation = writeQueue.then(async () => {
    const db = await openDb();
    if (!db) return;
    try {
      const epoch = await currentEpoch();
      const tx = db.transaction([IMAGE_STORE, META_STORE], 'readwrite');
      tx.objectStore(IMAGE_STORE).clear();
      tx.objectStore(META_STORE).put({
        key: 'stats',
        bytes: 0,
        count: 0,
        epoch,
      } satisfies CacheStats);
      await new Promise<void>((resolve) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      });
    } catch {
      // Ignore.
    }
  });
  writeQueue = operation.catch(() => undefined);
  return operation;
}
