const ALLOWED_HOSTS = new Set([
  'cdn.7tv.app',
  'cdn.betterttv.net',
  'cdn.frankerfacez.com',
]);

const MAX_BYTES = 3 * 1024 * 1024;
const MAX_CACHE = 100;
const cache = new Map<string, string>();

function toBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const chunk = 0x8000;
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += chunk) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunk));
  }
  return btoa(binary);
}

export async function fetchImageAsDataUrl(input: string): Promise<{ dataUrl: string }> {
  const url = new URL(input);
  if (url.protocol !== 'https:' || !ALLOWED_HOSTS.has(url.hostname)) {
    throw new Error('Image host is not allowed');
  }
  const cached = cache.get(url.toString());
  if (cached) return { dataUrl: cached };

  const response = await fetch(url, {
    cache: 'force-cache',
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`Image HTTP ${response.status}`);
  const type = (response.headers.get('content-type') ?? '').split(';')[0] ?? '';
  if (!type.startsWith('image/')) throw new Error('Response is not an image');
  const buffer = await response.arrayBuffer();
  if (buffer.byteLength > MAX_BYTES) throw new Error('Image is too large');

  const dataUrl = `data:${type};base64,${toBase64(buffer)}`;
  if (cache.size >= MAX_CACHE) {
    const oldest = cache.keys().next().value;
    if (oldest) cache.delete(oldest);
  }
  cache.set(url.toString(), dataUrl);
  return { dataUrl };
}
