import { beforeEach, describe, expect, it, vi } from 'vitest';

const storage = vi.hoisted(() => ({
  get: vi.fn(async () => ({})),
  set: vi.fn(async () => undefined),
  remove: vi.fn(async () => undefined),
}));

vi.mock('wxt/browser', () => ({ browser: { storage: { local: storage } } }));

import {
  isProviderBlocked,
  recordProviderFailure,
  recordProviderSuccess,
  resetProviderHealth,
} from '../src/core/emotes/health';

beforeEach(async () => {
  vi.restoreAllMocks();
  storage.get.mockResolvedValue({});
  storage.set.mockClear();
  storage.remove.mockClear();
  await resetProviderHealth();
});

describe('provider circuit breaker', () => {
  it('blocks a host after repeated failures and resets on success', async () => {
    expect(await isProviderBlocked('https://7tv.io/v3/test')).toBe(false);
    await recordProviderFailure('https://7tv.io/v3/test');
    expect(await isProviderBlocked('https://7tv.io/v3/test')).toBe(false);
    await recordProviderFailure('https://7tv.io/v3/test');
    expect(await isProviderBlocked('https://7tv.io/v3/global')).toBe(true);

    await recordProviderSuccess('https://7tv.io/v3/global');
    expect(await isProviderBlocked('https://7tv.io/v3/global')).toBe(false);
  });

  it('does not share a circuit between unrelated hosts', async () => {
    await recordProviderFailure('https://7tv.io/a');
    await recordProviderFailure('https://7tv.io/b');
    expect(await isProviderBlocked('https://7tv.io/c')).toBe(true);
    expect(await isProviderBlocked('https://api.betterttv.net/x')).toBe(false);
  });
});
