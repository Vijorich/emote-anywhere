import { browser } from 'wxt/browser';
import { CACHE_KEY, MAX_CACHE_BYTES, STALE_MAX_AGE_MS } from '../config';

interface CacheEntry<T> {
  fetchedAt: number;
  data: T;
  ttlMs?: number;
  /** Bumped when the cached URL format changes; old entries are discarded. */
  version?: number;
  /** Serialized size, stored so eviction does not re-stringify every entry. */
  bytes?: number;
}

export interface CachedOptions {
  /**
   * Return an expired entry immediately and refresh it in the background.
   * Provider failures then never delay the first render.
   */
  staleWhileRevalidate?: boolean;
}

const CACHE_VERSION = 2;

type CacheMap = Record<string, CacheEntry<unknown>>;
type Inflight = { generation: number; promise: Promise<unknown> };

const MAX_CACHE = 200;

let memory: CacheMap | null = null;
let loading: Promise<CacheMap> | null = null;
let generation = 0;
let cacheBytes = 0;
let persistWarned = false;
const inflight = new Map<string, Inflight>();
let storageQueue: Promise<void> = Promise.resolve();
let pendingPersist: { generation: number } | null = null;

function enqueue(operation: () => Promise<void>): Promise<void> {
  const result = storageQueue.then(operation);
  storageQueue = result.catch(() => undefined);
  return result;
}

function measure(entry: Omit<CacheEntry<unknown>, 'bytes'>): number {
  const { bytes: _ignored, ...value } = entry as CacheEntry<unknown>;
  return new TextEncoder().encode(JSON.stringify(value)).byteLength;
}

function removeEntry(cache: CacheMap, key: string): boolean {
  const entry = cache[key];
  if (!entry) return false;
  cacheBytes -= entry.bytes ?? measure(entry);
  delete cache[key];
  return true;
}

function evict(cache: CacheMap, keep?: string): boolean {
  let changed = false;
  while (Object.keys(cache).length > MAX_CACHE || cacheBytes > MAX_CACHE_BYTES) {
    const oldest = Object.keys(cache).find((candidate) => candidate !== keep);
    if (!oldest) break;
    removeEntry(cache, oldest);
    changed = true;
  }
  return changed;
}

function reindex(cache: CacheMap): boolean {
  cacheBytes = 0;
  let changed = false;
  for (const [key, entry] of Object.entries(cache)) {
    if (entry.version !== CACHE_VERSION) {
      delete cache[key];
      changed = true;
      continue;
    }
    entry.bytes = measure(entry);
    cacheBytes += entry.bytes;
  }
  return evict(cache) || changed;
}

async function loadCache(): Promise<CacheMap> {
  if (memory) return memory;
  if (!loading) {
    const loadGeneration = generation;
    loading = (async () => {
      try {
        const stored = (await browser.storage.local.get(CACHE_KEY))[CACHE_KEY];
        if (loadGeneration === generation) {
          memory = stored && typeof stored === 'object' ? (stored as CacheMap) : {};
          if (reindex(memory)) persist();
        }
      } catch {
        if (loadGeneration === generation) memory = {};
        cacheBytes = 0;
      }
      return memory ?? {};
    })();
  }
  return loading;
}

function persist(): void {
  if (!memory || pendingPersist) return;
  const job = { generation };
  pendingPersist = job;
  void enqueue(async () => {
    if (pendingPersist === job) pendingPersist = null;
    if (job.generation !== generation || !memory) return;
    try {
      await browser.storage.local.set({ [CACHE_KEY]: memory });
      persistWarned = false;
    } catch (error) {
      // A full state/cache quota must not break emote loading. The in-memory
      // cache keeps working and the next successful write can retry.
      if (!persistWarned) {
        persistWarned = true;
        console.warn('[emote-anywhere] could not persist emote cache', error);
      }
    }
  });
}

/**
 * Drop only entries that are too old to be useful. TTL is freshness, not
 * deletion: expired entries are the offline / stale-while-revalidate fallback.
 */
function pruneAncient(cache: CacheMap, now: number, keep?: string): boolean {
  let changed = false;
  for (const [key, entry] of Object.entries(cache)) {
    if (key === keep) continue;
    if (now - entry.fetchedAt <= STALE_MAX_AGE_MS) continue;
    removeEntry(cache, key);
    changed = true;
  }
  return changed;
}

function store<T>(cache: CacheMap, key: string, data: T, ttlMs: number): boolean {
  const now = Date.now();
  const pruned = pruneAncient(cache, now);
  const hadEntry = cache[key] !== undefined;
  removeEntry(cache, key);

  const entry: CacheEntry<T> = { fetchedAt: now, data, ttlMs, version: CACHE_VERSION };
  const bytes = measure(entry);
  if (bytes > MAX_CACHE_BYTES) return pruned || hadEntry;
  entry.bytes = bytes;
  cache[key] = entry;
  cacheBytes += bytes;

  evict(cache, key);
  return true;
}

function touch(cache: CacheMap, key: string, entry: CacheEntry<unknown>): void {
  delete cache[key];
  cache[key] = entry;
}

function startRequest<T>(
  cache: CacheMap,
  key: string,
  ttlMs: number,
  loader: () => Promise<T>,
  requestGeneration = generation,
): Promise<T> {
  const existing = inflight.get(key);
  if (existing && existing.generation === generation) return existing.promise as Promise<T>;

  const request: Promise<T> = Promise.resolve().then(async () => {
    try {
      const data = await loader();
      if (requestGeneration === generation) {
        if (store(cache, key, data, ttlMs)) persist();
      }
      return data;
    } finally {
      if (inflight.get(key)?.promise === request) inflight.delete(key);
    }
  });

  inflight.set(key, { generation: requestGeneration, promise: request });
  return request;
}

export async function cached<T>(
  key: string,
  ttlMs: number,
  loader: () => Promise<T>,
  options: CachedOptions = {},
): Promise<T> {
  const requestGeneration = generation;
  const cache = await loadCache();
  const current = requestGeneration === generation;
  let entry = current ? (cache[key] as CacheEntry<T> | undefined) : undefined;
  const now = Date.now();

  if (entry && now - entry.fetchedAt > STALE_MAX_AGE_MS) {
    removeEntry(cache, key);
    persist();
    entry = undefined;
  }

  if (entry && now - entry.fetchedAt < ttlMs) {
    touch(cache, key, entry);
    return entry.data;
  }

  if (entry && options.staleWhileRevalidate) {
    touch(cache, key, entry);
    void startRequest(cache, key, ttlMs, loader, requestGeneration).catch(() => undefined);
    return entry.data;
  }

  try {
    return await startRequest(cache, key, ttlMs, loader, requestGeneration);
  } catch (error) {
    // A failed refresh must keep the last known good value available.
    if (entry) {
      touch(cache, key, entry);
      return entry.data;
    }
    throw error;
  }
}

export function clearEmoteCache(): Promise<void> {
  generation++;
  memory = {};
  cacheBytes = 0;
  pendingPersist = null;
  persistWarned = false;
  inflight.clear();
  return enqueue(() => browser.storage.local.remove(CACHE_KEY));
}
