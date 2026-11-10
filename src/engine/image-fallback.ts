import { rpc } from '../core/rpc';
import {
  clearStoredImages,
  getStoredImages,
  putStoredImage,
  removeStoredImage,
} from './image-store';

// Every frame has its own heap and the background already caches 32 MiB.
const MAX_CACHE = 200;
const MAX_CACHE_BYTES = 8 * 1024 * 1024;
const MAX_CONCURRENT_RPC = 6;
const FAILURE_TTL_MS = 60_000;
const RETRY_DELAYS = [400, 1200];

const cache = new Map<string, string>();
const inflight = new Map<string, Promise<string | null>>();
const failedUntil = new Map<string, number>();
let cacheBytes = 0;

interface ReadWaiter {
  resolve: (value: string | null) => void;
}

const readWaiters = new Map<string, ReadWaiter[]>();
let readTimer: ReturnType<typeof setTimeout> | null = null;
let activeRpc = 0;
const rpcQueue: Array<() => void> = [];

export interface ProxiedImageOptions {
  refresh?: boolean;
}

function getCached(url: string): string | undefined {
  const cached = cache.get(url);
  if (cached) {
    cache.delete(url);
    cache.set(url, cached);
  }
  return cached;
}

function store(url: string, dataUrl: string): void {
  // Background responses are base64 data URLs, whose ASCII length is their byte count.
  const bytes = dataUrl.length;
  if (bytes > MAX_CACHE_BYTES) return;
  const previous = cache.get(url);
  if (previous) {
    cache.delete(url);
    cacheBytes -= previous.length;
  }
  while (cache.size >= MAX_CACHE || cacheBytes + bytes > MAX_CACHE_BYTES) {
    const oldest = cache.keys().next().value;
    if (oldest === undefined) break;
    const value = cache.get(oldest);
    if (value !== undefined) cacheBytes -= value.length;
    cache.delete(oldest);
  }
  cache.set(url, dataUrl);
  cacheBytes += bytes;
}

function flushReads(): void {
  readTimer = null;
  const batch = Array.from(readWaiters.entries());
  readWaiters.clear();
  const urls = batch.map(([url]) => url);
  void getStoredImages(urls)
    .then((stored) => {
      for (const [url, waiters] of batch) {
        const dataUrl = stored.get(url);
        if (dataUrl?.startsWith('data:image/')) {
          store(url, dataUrl);
          for (const waiter of waiters) waiter.resolve(dataUrl);
          continue;
        }
        for (const waiter of waiters) waiter.resolve(null);
      }
    })
    .catch(() => {
      for (const [, waiters] of batch) {
        for (const waiter of waiters) waiter.resolve(null);
      }
    });
}

function readStored(url: string): Promise<string | null> {
  return new Promise((resolve) => {
    const waiters = readWaiters.get(url) ?? [];
    waiters.push({ resolve });
    readWaiters.set(url, waiters);
    if (readTimer === null) {
      readTimer = setTimeout(flushReads, 0);
    }
  });
}

function runNextRpc(): void {
  if (activeRpc >= MAX_CONCURRENT_RPC) return;
  const next = rpcQueue.shift();
  if (!next) return;
  activeRpc += 1;
  next();
}

function enqueueRpc<T>(task: () => Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    rpcQueue.push(() => {
      task()
        .then(resolve, reject)
        .finally(() => {
          activeRpc -= 1;
          runNextRpc();
        });
    });
    runNextRpc();
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function retryable(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes('host is not allowed')) return false;
  if (message.includes('temporarily unavailable')) return false;
  if (/HTTP (4\d\d)/.test(message) && !/HTTP (408|425|429)/.test(message)) return false;
  return true;
}

async function requestImage(url: string, refresh: boolean): Promise<string | null> {
  for (let attempt = 0; attempt <= RETRY_DELAYS.length; attempt += 1) {
    try {
      const result = await enqueueRpc(() =>
        rpc<{ dataUrl: string }>(
          'image/fetch',
          refresh ? { url, refresh: true } : { url },
          { timeoutMs: 25_000 },
        ),
      );
      if (result.dataUrl.startsWith('data:image/')) return result.dataUrl;
      throw new Error('Background returned an invalid image');
    } catch (error) {
      if (attempt < RETRY_DELAYS.length && retryable(error)) {
        await sleep(RETRY_DELAYS[attempt] ?? 1000);
        continue;
      }
      return null;
    }
  }
  return null;
}

/** VK's img-src CSP blocks emote CDNs; fetch bytes in the background and return a data: URL. */
export function proxiedImage(
  url: string,
  options: ProxiedImageOptions = {},
): Promise<string | null> {
  if (url.startsWith('data:image/')) return Promise.resolve(url);

  const refresh = options.refresh === true;
  if (!refresh) {
    const cached = getCached(url);
    if (cached) return Promise.resolve(cached);
  }
  const existing = inflight.get(url);
  if (existing && !refresh) return existing;

  const until = failedUntil.get(url);
  if (!refresh && until !== undefined && until > Date.now()) return Promise.resolve(null);

  const request = (async () => {
    if (refresh) {
      await removeStoredImage(url);
      failedUntil.delete(url);
    } else {
      const stored = await readStored(url);
      if (stored) return stored;
    }

    const dataUrl = await requestImage(url, refresh);
    if (!dataUrl) {
      failedUntil.set(url, Date.now() + FAILURE_TTL_MS);
      return null;
    }
    store(url, dataUrl);
    void putStoredImage(url, dataUrl);
    return dataUrl;
  })().finally(() => {
    if (inflight.get(url) === request) inflight.delete(url);
  });

  inflight.set(url, request);
  return request;
}

export function clearContentImageCache(): void {
  cache.clear();
  cacheBytes = 0;
  failedUntil.clear();
  inflight.clear();
  void clearStoredImages();
}

export function clearContentImageMemory(): void {
  cache.clear();
  cacheBytes = 0;
  failedUntil.clear();
}

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    failedUntil.clear();
  });
}
