import { rpc } from '../core/rpc';

const MAX_CACHE = 300;
const cache = new Map<string, string>();
const inflight = new Map<string, Promise<string | null>>();

/**
 * Some sites (VK) have an img-src CSP that blocks emote CDNs. The background
 * worker fetches the bytes and returns a data: URL, which those sites allow.
 */
export function proxiedImage(url: string): Promise<string | null> {
  const cached = cache.get(url);
  if (cached) return Promise.resolve(cached);
  const existing = inflight.get(url);
  if (existing) return existing;

  const request = rpc<{ dataUrl: string }>('image/fetch', { url })
    .then((result) => {
      if (!result.dataUrl.startsWith('data:image/')) return null;
      if (cache.size >= MAX_CACHE) {
        const oldest = cache.keys().next().value;
        if (oldest) cache.delete(oldest);
      }
      cache.set(url, result.dataUrl);
      return result.dataUrl;
    })
    .catch(() => null)
    .finally(() => {
      inflight.delete(url);
    });

  inflight.set(url, request);
  return request;
}
