import { beforeEach, describe, expect, it, vi } from 'vitest';

const rpc = vi.hoisted(() => vi.fn());
const store = vi.hoisted(() => ({
  getStoredImages: vi.fn(),
  putStoredImage: vi.fn(async () => undefined),
  removeStoredImage: vi.fn(async () => undefined),
  clearStoredImages: vi.fn(async () => undefined),
}));

vi.mock('../src/core/rpc', () => ({ rpc }));
vi.mock('../src/engine/image-store', () => store);

import { proxiedImage } from '../src/engine/image-fallback';

beforeEach(() => {
  rpc.mockReset();
  store.getStoredImages.mockReset().mockResolvedValue(new Map());
  store.putStoredImage.mockClear();
  store.removeStoredImage.mockClear();
});

describe('persistent content image cache', () => {
  it('returns an IndexedDB hit without an RPC', async () => {
    store.getStoredImages.mockResolvedValue(
      new Map([['https://cdn.7tv.app/emote/1/2x.webp', 'data:image/webp;base64,AAAA']]),
    );
    await expect(proxiedImage('https://cdn.7tv.app/emote/1/2x.webp')).resolves.toBe(
      'data:image/webp;base64,AAAA',
    );
    expect(rpc).not.toHaveBeenCalled();
  });

  it('stores a background result for the next page load', async () => {
    rpc.mockResolvedValue({ dataUrl: 'data:image/webp;base64,BBBB' });
    await expect(proxiedImage('https://cdn.7tv.app/emote/2/2x.webp')).resolves.toBe(
      'data:image/webp;base64,BBBB',
    );
    expect(store.putStoredImage).toHaveBeenCalledWith(
      'https://cdn.7tv.app/emote/2/2x.webp',
      'data:image/webp;base64,BBBB',
    );
  });

  it('refresh removes the stale persistent entry', async () => {
    store.getStoredImages.mockResolvedValue(
      new Map([['https://cdn.7tv.app/emote/3/2x.webp', 'data:image/webp;base64,OLD']]),
    );
    rpc.mockResolvedValue({ dataUrl: 'data:image/webp;base64,NEW' });
    await expect(proxiedImage('https://cdn.7tv.app/emote/3/2x.webp')).resolves.toBe(
      'data:image/webp;base64,OLD',
    );
    await expect(
      proxiedImage('https://cdn.7tv.app/emote/3/2x.webp', { refresh: true }),
    ).resolves.toBe('data:image/webp;base64,NEW');
    expect(store.removeStoredImage).toHaveBeenCalledWith('https://cdn.7tv.app/emote/3/2x.webp');
  });

  it('limits concurrent image RPCs', async () => {
    let active = 0;
    let max = 0;
    rpc.mockImplementation(async () => {
      active += 1;
      max = Math.max(max, active);
      await new Promise((resolve) => setTimeout(resolve, 5));
      active -= 1;
      return { dataUrl: 'data:image/png;base64,AAAA' };
    });

    await Promise.all(
      Array.from({ length: 20 }, (_, index) =>
        proxiedImage(`https://cdn.7tv.app/emote/${index}/2x.webp`),
      ),
    );
    expect(max).toBeLessThanOrEqual(6);
    expect(max).toBeGreaterThan(1);
  });
});
