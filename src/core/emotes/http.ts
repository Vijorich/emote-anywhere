import { MAX_PROVIDER_BYTES } from '../config';

async function readBody(response: Response): Promise<string> {
  if (!response.body) {
    const buffer = await response.arrayBuffer();
    if (buffer.byteLength > MAX_PROVIDER_BYTES) throw new Error('Provider response is too large');
    return new TextDecoder().decode(buffer);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const chunks: string[] = [];
  let bytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        chunks.push(decoder.decode());
        return chunks.join('');
      }
      bytes += value.byteLength;
      if (bytes > MAX_PROVIDER_BYTES) {
        await reader.cancel().catch(() => undefined);
        throw new Error('Provider response is too large');
      }
      chunks.push(decoder.decode(value, { stream: true }));
    }
  } finally {
    reader.releaseLock();
  }
}

/** Fetch JSON from a fixed provider API with a byte cap. */
export async function fetchProviderJson<T>(url: string): Promise<T> {
  const response = await fetch(url, {
    cache: 'no-store',
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const body = await readBody(response);
  try {
    return JSON.parse(body) as T;
  } catch {
    throw new Error('Provider returned invalid JSON');
  }
}
