import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const storage = vi.hoisted(() => ({
  get: vi.fn(async () => ({})),
  set: vi.fn(async () => undefined),
  remove: vi.fn(async () => undefined),
}));

vi.mock('wxt/browser', () => ({ browser: { storage: { local: storage } } }));

async function loadImageStore() {
  return import('../src/engine/image-store');
}

beforeEach(async () => {
  vi.resetModules();
  storage.get.mockReset().mockResolvedValue({});
  const { clearStoredImages } = await loadImageStore();
  await clearStoredImages();
});

describe('persistent image store', () => {
  it('stores, reads and removes an image', async () => {
    const store = await loadImageStore();
    await store.putStoredImage('https://cdn.7tv.app/emote/1/2x.webp', 'data:image/webp;base64,AAAA');
    const hit = await store.getStoredImages(['https://cdn.7tv.app/emote/1/2x.webp']);
    expect(hit.get('https://cdn.7tv.app/emote/1/2x.webp')).toBe('data:image/webp;base64,AAAA');

    await store.removeStoredImage('https://cdn.7tv.app/emote/1/2x.webp');
    expect(
      (await store.getStoredImages(['https://cdn.7tv.app/emote/1/2x.webp'])).size,
    ).toBe(0);
  });

  it('clears images when the cache epoch changes', async () => {
    const first = await loadImageStore();
    await first.putStoredImage('https://cdn.7tv.app/emote/2/2x.webp', 'data:image/webp;base64,BBBB');

    storage.get.mockResolvedValue({ 'image-cache-epoch': 42 });
    vi.resetModules();
    const second = await loadImageStore();
    expect(
      (await second.getStoredImages(['https://cdn.7tv.app/emote/2/2x.webp'])).size,
    ).toBe(0);
  });
});
