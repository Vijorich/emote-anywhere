import { browser } from 'wxt/browser';
import { CACHE_KEY } from '../config';

interface CacheEntry<T> {
  fetchedAt: number;
  data: T;
}

type CacheMap = Record<string, CacheEntry<unknown>>;

let memory: CacheMap | null = null;
let loading: Promise<CacheMap> | null = null;
const inflight = new Map<string, Promise<unknown>>();
let persistQueue: Promise<void> = Promise.resolve();

async function loadCache(): Promise<CacheMap> {
  if (memory) return memory;
  if (!loading) {
    loading = (async () => {
      try {
        const stored = (await browser.storage.local.get(CACHE_KEY))[CACHE_KEY];
        memory = stored && typeof stored === 'object' ? (stored as CacheMap) : {};
      } catch {
        memory = {};
      }
      return memory;
    })();
  }
  return loading;
}

function persist(): void {
  if (!memory) return;
  const snapshot = memory;
  persistQueue = persistQueue
    .then(() => browser.storage.local.set({ [CACHE_KEY]: snapshot }))
    .then(
      () => undefined,
      () => undefined,
    );
}

export async function cached<T>(key: string, ttlMs: number, loader: () => Promise<T>): Promise<T> {
  const cache = await loadCache();
  const entry = cache[key] as CacheEntry<T> | undefined;
  if (entry && Date.now() - entry.fetchedAt < ttlMs) return entry.data;

  const existing = inflight.get(key);
  if (existing) return existing as Promise<T>;

  const request = (async () => {
    try {
      const data = await loader();
      cache[key] = { fetchedAt: Date.now(), data };
      persist();
      return data;
    } catch (error) {
      if (entry) return entry.data;
      throw error;
    } finally {
      inflight.delete(key);
    }
  })();

  inflight.set(key, request);
  return request;
}

export async function clearEmoteCache(): Promise<void> {
  memory = {};
  inflight.clear();
  await browser.storage.local.remove(CACHE_KEY);
}
