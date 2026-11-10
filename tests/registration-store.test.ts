import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const storage = vi.hoisted(() => ({
  get: vi.fn(async () => ({})),
  set: vi.fn(async () => undefined),
  remove: vi.fn(async () => undefined),
}));

vi.mock('wxt/browser', () => ({ browser: { storage: { local: storage } } }));

async function loadStore() {
  return import('../src/engine/registration-store');
}

beforeEach(async () => {
  vi.resetModules();
  storage.get.mockResolvedValue({});
  const { clearStoredRegistrations } = await loadStore();
  await clearStoredRegistrations();
});

describe('persistent registration store', () => {
  it('stores and reloads a registration revision', async () => {
    const store = await loadStore();
    const registration = {
      emotes: [{ code: 'catJAM', url: 'https://cdn.7tv.app/emote/1/2x.webp', flags: 0 }],
      sources: ['7tv:global'],
      errors: [],
      binding: null,
      revision: 'rev-1',
    };
    await store.putStoredRegistration('plugin|channel', registration);
    await expect(store.getStoredRegistration('plugin|channel')).resolves.toEqual(registration);
  });

  it('clears all registrations', async () => {
    const store = await loadStore();
    await store.putStoredRegistration('a|b', {
      emotes: [],
      sources: [],
      errors: [],
      binding: null,
      revision: 'rev',
    });
    await store.clearStoredRegistrations();
    await expect(store.getStoredRegistration('a|b')).resolves.toBeNull();
  });
});
