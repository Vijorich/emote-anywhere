import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const storage = vi.hoisted(() => ({
  get: vi.fn(),
  set: vi.fn(),
  remove: vi.fn(),
}));

vi.mock('wxt/browser', () => ({ browser: { storage: { local: storage } } }));

const KEY = 'emote-cache';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

async function flush(): Promise<void> {
  for (let index = 0; index < 8; index++) await Promise.resolve();
}

beforeEach(() => {
  vi.resetModules();
  storage.get.mockReset().mockResolvedValue({});
  storage.set.mockReset().mockResolvedValue(undefined);
  storage.remove.mockReset().mockResolvedValue(undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('emote cache', () => {
  it('does not restore a read that finishes during clear', async () => {
    const read = deferred<Record<string, unknown>>();
    storage.get.mockReturnValue(read.promise);
    const { cached, clearEmoteCache } = await import('../src/core/emotes/cache');
    const oldLoader = vi.fn(async () => 'old-loader');

    const request = cached('key', 1_000, oldLoader);
    const clearing = clearEmoteCache();
    read.resolve({
      [KEY]: { key: { fetchedAt: Date.now(), data: 'stored' } },
    });

    expect(await request).toBe('old-loader');
    await clearing;
    await flush();
    expect(storage.set).not.toHaveBeenCalled();

    const newLoader = vi.fn(async () => 'new');
    expect(await cached('key', 1_000, newLoader)).toBe('new');
    expect(newLoader).toHaveBeenCalledOnce();
    expect(storage.get).toHaveBeenCalledOnce();
  });

  it('serializes clear with queued writes and old loader completions', async () => {
    const { cached, clearEmoteCache } = await import('../src/core/emotes/cache');
    const stale = deferred<string>();
    const started = deferred<void>();
    const firstWrite = deferred<void>();
    const events: string[] = [];
    let writes = 0;
    storage.set.mockImplementation((value) => {
      events.push(`set:${Object.keys(value[KEY]).join(',')}`);
      writes++;
      return writes === 1 ? firstWrite.promise : Promise.resolve();
    });
    storage.remove.mockImplementation(() => {
      events.push('remove');
      return Promise.resolve();
    });

    const oldRequest = cached('stale', 1_000, () => {
      started.resolve(undefined);
      return stale.promise;
    });
    await started.promise;
    expect(await cached('one', 1_000, async () => 1)).toBe(1);
    await flush();
    expect(storage.set).toHaveBeenCalledOnce();
    expect(await cached('two', 1_000, async () => 2)).toBe(2);

    const clearing = clearEmoteCache();
    stale.resolve('old-result');
    expect(await oldRequest).toBe('old-result');
    expect(await cached('fresh', 1_000, async () => 'fresh')).toBe('fresh');
    expect(storage.remove).not.toHaveBeenCalled();

    firstWrite.resolve(undefined);
    await clearing;
    await flush();

    expect(events).toEqual(['set:one', 'remove', 'set:fresh']);
    const fallback = vi.fn(async () => 'wrong');
    expect(await cached('fresh', 1_000, fallback)).toBe('fresh');
    expect(fallback).not.toHaveBeenCalled();
  });

  it('coalesces bursts and evicts oldest entries beyond 200', async () => {
    const { cached } = await import('../src/core/emotes/cache');
    const requests = Array.from({ length: 205 }, (_, index) =>
      cached(`key-${index}`, 60_000, async () => index),
    );

    await Promise.all(requests);
    await flush();

    expect(storage.set).toHaveBeenCalledOnce();
    const snapshot = storage.set.mock.calls[0]?.[0][KEY];
    expect(Object.keys(snapshot)).toHaveLength(200);
    expect(snapshot['key-4']).toBeUndefined();
    expect(snapshot['key-5'].data).toBe(5);
    expect(snapshot['key-204'].data).toBe(204);
  });

  it('prunes expired entries while retaining stale loader fallback', async () => {
    let now = 0;
    vi.spyOn(Date, 'now').mockImplementation(() => now);
    const { cached } = await import('../src/core/emotes/cache');
    await Promise.all([
      cached('stale', 10, async () => 'old'),
      cached('expired', 10, async () => 'expired'),
    ]);
    await flush();
    expect(storage.set).toHaveBeenCalledOnce();

    now = 20;
    const loader = vi.fn(async () => {
      throw new Error('offline');
    });
    expect(await cached('stale', 10, loader)).toBe('old');
    await flush();

    expect(storage.set).toHaveBeenCalledTimes(2);
    const snapshot = storage.set.mock.calls[1]?.[0][KEY];
    expect(Object.keys(snapshot)).toEqual(['stale']);
    expect(snapshot.stale.data).toBe('old');
  });

  it('does not cache an entry larger than the byte budget', async () => {
    const { MAX_CACHE_BYTES } = await import('../src/core/config');
    const { cached } = await import('../src/core/emotes/cache');
    const big = 'x'.repeat(MAX_CACHE_BYTES + 1024);
    const loader = vi.fn(async () => big);

    expect(await cached('big', 60_000, loader)).toBe(big);
    await flush();
    expect(storage.set).not.toHaveBeenCalled();

    expect(await cached('big', 60_000, loader)).toBe(big);
    expect(loader).toHaveBeenCalledTimes(2);
  });

  it('keeps working when cache persistence fails', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    storage.set.mockRejectedValueOnce(new Error('quota exceeded'));
    const { cached } = await import('../src/core/emotes/cache');

    await expect(cached('key', 60_000, async () => 'value')).resolves.toBe('value');
    await flush();
    expect(warn).toHaveBeenCalledWith(
      '[emote-anywhere] could not persist emote cache',
      expect.any(Error),
    );
    await expect(cached('key', 60_000, async () => 'other')).resolves.toBe('value');
  });

  it('discards entries stored with an older URL format', async () => {
    storage.get.mockResolvedValue({
      [KEY]: { old: { fetchedAt: Date.now(), data: 'stored-without-version' } },
    });
    const { cached } = await import('../src/core/emotes/cache');
    const loader = vi.fn(async () => 'fresh');

    expect(await cached('old', 60_000, loader)).toBe('fresh');
    expect(loader).toHaveBeenCalledOnce();
  });

  it('deduplicates inflight loads for the same key', async () => {
    const { cached } = await import('../src/core/emotes/cache');
    const result = deferred<string>();
    const loader = vi.fn(() => result.promise);
    const otherLoader = vi.fn(async () => 'other');

    const first = cached('same', 1_000, loader);
    const second = cached('same', 1_000, otherLoader);
    await flush();
    expect(loader).toHaveBeenCalledOnce();
    expect(otherLoader).not.toHaveBeenCalled();

    result.resolve('value');
    expect(await Promise.all([first, second])).toEqual(['value', 'value']);
  });
});
