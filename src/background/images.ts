const ALLOWED_HOSTS = new Set([
  'cdn.7tv.app',
  'cdn.betterttv.net',
  'cdn.frankerfacez.com',
]);

const MAX_BYTES = 3 * 1024 * 1024;
const MAX_CACHE = 600;
const MAX_CACHE_BYTES = 32 * 1024 * 1024;
const cache = new Map<string, string>();
const inflight = new Map<string, Promise<{ dataUrl: string }>>();
let cacheBytes = 0;

function toBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const chunk = 0x8000;
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += chunk) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunk));
  }
  return btoa(binary);
}

async function readBody(response: Response): Promise<ArrayBuffer> {
  if (!response.body) {
    const buffer = await response.arrayBuffer();
    if (buffer.byteLength > MAX_BYTES) throw new Error('Image is too large');
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
      if (total > MAX_BYTES) {
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

export async function fetchImageAsDataUrl(input: string): Promise<{ dataUrl: string }> {
  const url = new URL(input);
  if (url.protocol !== 'https:' || !ALLOWED_HOSTS.has(url.hostname)) {
    throw new Error('Image host is not allowed');
  }
  const key = url.toString();
  const cached = getCached(key);
  if (cached) return { dataUrl: cached };
  const existing = inflight.get(key);
  if (existing) return existing;

  const request = (async () => {
    const response = await fetch(url, {
      cache: 'force-cache',
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) throw new Error(`Image HTTP ${response.status}`);
    const type = (response.headers.get('content-type') ?? '').split(';')[0] ?? '';
    if (!type.startsWith('image/')) throw new Error('Response is not an image');
    const dataUrl = `data:${type};base64,${toBase64(await readBody(response))}`;
    store(key, dataUrl);
    return { dataUrl };
  })();

  inflight.set(key, request);
  try {
    return await request;
  } finally {
    if (inflight.get(key) === request) inflight.delete(key);
  }
}
