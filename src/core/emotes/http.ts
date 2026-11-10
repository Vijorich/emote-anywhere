import { MAX_PROVIDER_BYTES, PROVIDER_RETRY_DELAY_MS, PROVIDER_TIMEOUT_MS } from '../config';
import {
  isProviderBlocked,
  recordProviderFailure,
  recordProviderSuccess,
} from './health';

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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function retryable(status: number | undefined): boolean {
  if (status === undefined) return true;
  return status === 408 || status === 425 || status === 429 || status >= 500;
}

interface HttpError extends Error {
  status?: number;
}

export interface ProviderRequestOptions {
  timeoutMs?: number;
  retries?: number;
}

/** Fetch JSON from a fixed provider API with a byte cap, timeout and one retry. */
export async function fetchProviderJson<T>(
  url: string,
  options: ProviderRequestOptions = {},
): Promise<T> {
  if (await isProviderBlocked(url)) {
    throw new Error('Provider is temporarily unavailable');
  }

  const timeoutMs = options.timeoutMs ?? PROVIDER_TIMEOUT_MS;
  const retries = options.retries ?? 1;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const response = await fetch(url, {
        cache: 'no-store',
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!response.ok) {
        const error: HttpError = new Error(`HTTP ${response.status}`);
        error.status = response.status;
        throw error;
      }
      const body = await readBody(response);
      let parsed: T;
      try {
        parsed = JSON.parse(body) as T;
      } catch {
        throw new Error('Provider returned invalid JSON');
      }
      await recordProviderSuccess(url);
      return parsed;
    } catch (error) {
      const status = (error as HttpError | undefined)?.status;
      const message = error instanceof Error ? error.message : '';
      const permanent =
        message.includes('too large') ||
        message.includes('invalid JSON') ||
        message.includes('temporarily unavailable');
      if (!permanent && attempt < retries && retryable(status)) {
        await sleep(PROVIDER_RETRY_DELAY_MS * (attempt + 1));
        continue;
      }
      if (!message.includes('too large') && (status === undefined || retryable(status))) {
        await recordProviderFailure(url);
      }
      throw error;
    }
  }

  await recordProviderFailure(url);
  throw new Error('Provider request failed');
}
