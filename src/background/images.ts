import { isAllowedImageUrl, smallerImageUrl, webpSibling } from '../core/emotes/image-urls';
import {
  isProviderBlocked,
  recordProviderFailure,
  recordProviderSuccess,
} from '../core/emotes/health';

const MAX_BYTES = 3 * 1024 * 1024;
const MAX_FALLBACK_BYTES = 6 * 1024 * 1024;
const MAX_CACHE = 600;
const MAX_CACHE_BYTES = 32 * 1024 * 1024;
const cache = new Map<string, string>();
const inflight = new Map<string, Promise<{ dataUrl: string }>>();
let cacheBytes = 0;

export interface ImageFetchOptions {
  refresh?: boolean;
  allowFallback?: boolean;
  /** Custom HTTPS hosts whose optional origin permission was granted. */
  allowedHosts?: Iterable<string>;
  /** Optional self-hosted 7TV CDN mirror. */
  proxyUrl?: string;
}

interface ImageData {
  buffer: ArrayBuffer;
  type: string;
}

interface HttpError extends Error {
  status?: number;
}

function toBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const chunk = 0x8000;
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += chunk) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunk));
  }
  return btoa(binary);
}

async function readBody(response: Response, maxBytes: number): Promise<ArrayBuffer> {
  if (!response.body) {
    const buffer = await response.arrayBuffer();
    if (buffer.byteLength > maxBytes) throw new Error('Image is too large');
    return buffer;
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel().catch(() => undefined);
        throw new Error('Image is too large');
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes.buffer;
}

async function readText(response: Response, maxBytes: number): Promise<string> {
  return new TextDecoder().decode(await readBody(response, maxBytes));
}

function getCached(key: string): string | undefined {
  const cached = cache.get(key);
  if (cached) {
    cache.delete(key);
    cache.set(key, cached);
  }
  return cached;
}

function store(key: string, dataUrl: string): void {
  // Base64 data URLs are ASCII, so length is their encoded byte count.
  const bytes = dataUrl.length;
  if (bytes > MAX_CACHE_BYTES) return;
  const previous = cache.get(key);
  if (previous) {
    cache.delete(key);
    cacheBytes -= previous.length;
  }
  while (cache.size >= MAX_CACHE || cacheBytes + bytes > MAX_CACHE_BYTES) {
    const oldest = cache.keys().next().value;
    if (oldest === undefined) break;
    const value = cache.get(oldest);
    if (value !== undefined) cacheBytes -= value.length;
    cache.delete(oldest);
  }
  cache.set(key, dataUrl);
  cacheBytes += bytes;
}

function isAllowedInput(url: URL, options: ImageFetchOptions): boolean {
  if (isAllowedImageUrl(url.toString())) return true;
  if (url.protocol !== 'https:') return false;
  if (!options.allowedHosts) return false;
  return Array.from(options.allowedHosts).includes(url.hostname);
}

function directUrl(url: URL, options: ImageFetchOptions): URL {
  if (url.hostname !== 'cdn.7tv.app' || !options.proxyUrl) return url;
  try {
    const base = new URL(options.proxyUrl);
    base.pathname = `${base.pathname.replace(/\/$/, '')}${url.pathname}`;
    base.search = url.search;
    return base;
  } catch {
    return url;
  }
}

function wsrvUrl(url: URL): string {
  const source = url.hostname === 'cdn.7tv.app' ? webpSibling(url.toString()) : url.toString();
  const params = new URLSearchParams({
    url: source,
    n: '-1',
    encoding: 'base64',
  });
  return `https://wsrv.nl/?${params.toString()}`;
}

async function fetchDirect(url: URL): Promise<ImageData> {
  const response = await fetch(url, {
    cache: 'force-cache',
    signal: AbortSignal.timeout(6_000),
  });
  if (!response.ok) {
    const error: HttpError = new Error(`Image HTTP ${response.status}`);
    error.status = response.status;
    throw error;
  }
  const type = (response.headers.get('content-type') ?? '').split(';')[0] ?? '';
  if (!type.startsWith('image/')) throw new Error('Response is not an image');
  return { buffer: await readBody(response, MAX_BYTES), type };
}

async function fetchWithSmaller(url: URL): Promise<ImageData> {
  try {
    return await fetchDirect(url);
  } catch (error) {
    if (!(error instanceof Error) || error.message !== 'Image is too large') throw error;
    const smaller = smallerImageUrl(url.toString());
    if (!smaller || smaller === url.toString()) throw error;
    return fetchDirect(new URL(smaller));
  }
}

async function fetchFallback(url: URL): Promise<string> {
  const response = await fetch(wsrvUrl(url), {
    cache: 'force-cache',
    signal: AbortSignal.timeout(12_000),
  });
  if (!response?.ok) {
    const error: HttpError = new Error('Image fallback request failed');
    error.status = response?.status;
    throw error;
  }
  const text = (await readText(response, MAX_FALLBACK_BYTES)).trim();
  if (!text.startsWith('data:image/')) throw new Error('Image fallback returned invalid data');
  return text;
}

function shouldRecordFailure(error: unknown): boolean {
  if (error instanceof Error && error.message === 'Image is too large') return false;
  if (error instanceof Error && error.message.includes('temporarily unavailable')) return false;
  const status = (error as HttpError | undefined)?.status;
  if (status === undefined) return true;
  return status === 408 || status === 425 || status === 429 || status >= 500;
}

export async function fetchImageAsDataUrl(
  input: string,
  options: ImageFetchOptions = {},
): Promise<{ dataUrl: string }> {
  if (input.startsWith('data:image/')) return { dataUrl: input };

  const url = new URL(input);
  if (!isAllowedInput(url, options)) {
    throw new Error('Image host is not allowed');
  }
  const key = url.toString();
  if (!options.refresh) {
    const cached = getCached(key);
    if (cached) return { dataUrl: cached };
    const existing = inflight.get(key);
    if (existing) return existing;
  }

  const request = (async () => {
    const source = directUrl(url, options);
    const sourceKey = source.toString();
    let directError: unknown;

    try {
      if (await isProviderBlocked(sourceKey)) {
        throw new Error('Image host temporarily unavailable');
      }
      const image = await fetchWithSmaller(source);
      await recordProviderSuccess(sourceKey);
      const dataUrl = `data:${image.type};base64,${toBase64(image.buffer)}`;
      store(key, dataUrl);
      return { dataUrl };
    } catch (error) {
      directError = error;
      if (shouldRecordFailure(error)) await recordProviderFailure(sourceKey);
    }

    if (options.allowFallback !== false) {
      try {
        const dataUrl = await fetchFallback(url);
        store(key, dataUrl);
        return { dataUrl };
      } catch (fallbackError) {
        throw fallbackError instanceof Error ? fallbackError : directError;
      }
    }
    throw directError instanceof Error ? directError : new Error(String(directError));
  })();

  inflight.set(key, request);
  try {
    return await request;
  } finally {
    if (inflight.get(key) === request) inflight.delete(key);
  }
}

export function clearImageMemoryCache(): void {
  cache.clear();
  cacheBytes = 0;
  inflight.clear();
}

/** Exposed for tests and diagnostics. */
export function imageMemoryCacheSize(): number {
  return cache.size;
}
