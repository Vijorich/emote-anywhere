import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SevenTvSetInfo } from '../src/core/types';

const mocks = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock('../src/core/rpc', () => ({ rpc: mocks.rpc }));

function info(name: string): SevenTvSetInfo {
  return { id: 'set', name, emoteCount: 1, preview: [{ code: 'hi', url: 'https://img' }] };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

beforeEach(() => {
  vi.resetModules();
  mocks.rpc.mockReset();
});

describe('set presentation lookup', () => {
  it('retries failures and caches later successes', async () => {
    mocks.rpc.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(info('Fresh'));
    const { lookupSet } = await import('../src/ui/sets');

    expect(await lookupSet('set')).toBeNull();
    expect(await lookupSet('set')).toEqual(info('Fresh'));
    expect(await lookupSet('set')).toEqual(info('Fresh'));
    expect(mocks.rpc).toHaveBeenCalledTimes(2);
  });

  it('deduplicates pending lookups and clears cached successes', async () => {
    const request = deferred<SevenTvSetInfo>();
    mocks.rpc.mockReturnValueOnce(request.promise).mockResolvedValueOnce(info('Updated'));
    const { clearSetLookupCache, lookupSet } = await import('../src/ui/sets');

    const first = lookupSet('set');
    const duplicate = lookupSet('set');
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
    request.resolve(info('Original'));
    expect(await first).toEqual(info('Original'));
    expect(await duplicate).toEqual(info('Original'));
    expect(await lookupSet('set')).toEqual(info('Original'));
    expect(mocks.rpc).toHaveBeenCalledTimes(1);

    clearSetLookupCache();
    expect(await lookupSet('set')).toEqual(info('Updated'));
    expect(mocks.rpc).toHaveBeenCalledTimes(2);
  });

  it('does not let lookups from before a clear replace newer pending data', async () => {
    const oldRequest = deferred<SevenTvSetInfo>();
    const newRequest = deferred<SevenTvSetInfo>();
    mocks.rpc.mockReturnValueOnce(oldRequest.promise).mockReturnValueOnce(newRequest.promise);
    const { clearSetLookupCache, lookupSet } = await import('../src/ui/sets');

    const stale = lookupSet('set');
    clearSetLookupCache();
    const fresh = lookupSet('set');
    oldRequest.resolve(info('Stale'));
    expect(await stale).toEqual(info('Stale'));

    const duplicate = lookupSet('set');
    expect(mocks.rpc).toHaveBeenCalledTimes(2);
    newRequest.resolve(info('Fresh'));
    expect(await fresh).toEqual(info('Fresh'));
    expect(await duplicate).toEqual(info('Fresh'));
    expect(await lookupSet('set')).toEqual(info('Fresh'));
    expect(mocks.rpc).toHaveBeenCalledTimes(2);
  });
});
