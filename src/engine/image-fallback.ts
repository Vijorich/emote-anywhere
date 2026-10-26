import { rpc } from '../core/rpc';

const MAX_CACHE = 600;
const MAX_CACHE_BYTES = 32 * 1024 * 1024;
const cache = new Map<string, string>();
const inflight = new Map<string, Promise<string | null>>();
let cacheBytes = 0;

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

/**
 * Some sites (VK) have an img-src CSP that blocks emote CDNs. The background
 * worker fetches the bytes and returns a data: URL, which those sites allow.
 */
export function proxiedImage(url: string): Promise<string | null> {
  const cached = getCached(url);
  if (cached) return Promise.resolve(cached);
  const existing = inflight.get(url);
  if (existing) return existing;

  const request = (async () => {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const result = await rpc<{ dataUrl: string }>('image/fetch', { url });
        if (result.dataUrl.startsWith('data:image/')) {
          store(url, result.dataUrl);
          return result.dataUrl;
        }
      } catch {
        // A transient CDN or service-worker failure is retried once.
      }
      if (attempt === 0) {
        await new Promise((resolve) => setTimeout(resolve, 400));
      }
    }
    return null;
  })().finally(() => {
    inflight.delete(url);
  });

  inflight.set(url, request);
  return request;
}
