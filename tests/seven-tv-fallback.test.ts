import { beforeEach, describe, expect, it, vi } from 'vitest';

const cache = vi.hoisted(() => ({ cached: vi.fn() }));
const http = vi.hoisted(() => ({ fetchProviderJson: vi.fn() }));
const mirrors = vi.hoisted(() => ({ fetchSevenTvGlobalMirror: vi.fn() }));
const snapshots = vi.hoisted(() => ({
  sevenTvGlobalSnapshot: vi.fn(),
  sevenTvSetSnapshot: vi.fn(),
}));

vi.mock('../src/core/emotes/cache', () => cache);
vi.mock('../src/core/emotes/http', () => http);
vi.mock('../src/core/emotes/mirrors', () => mirrors);
vi.mock('../src/core/emotes/snapshots', () => snapshots);

import { DEFAULT_GLOBAL_SET_IDS } from '../src/core/defaults';
import {
  fetchSevenTvGlobal,
  fetchSevenTvSet,
} from '../src/core/emotes/seven-tv';

beforeEach(() => {
  cache.cached.mockReset().mockImplementation(async (_key, _ttl, loader) => loader());
  http.fetchProviderJson.mockReset();
  mirrors.fetchSevenTvGlobalMirror.mockReset();
  snapshots.sevenTvGlobalSnapshot.mockReset();
  snapshots.sevenTvSetSnapshot.mockReset();
});

const mirror = {
  name: 'mirror',
  source: 'mirror.test',
  zeroWidthSupported: true,
  emotes: [
    { code: 'mirrored', url: 'https://cdn.7tv.app/emote/1/2x.webp', flags: 0, provider: '7tv' },
  ],
};

const snapshot = {
  schemaVersion: 1,
  fetchedAt: '2026-11-10T00:00:00.000Z',
  provider: '7tv',
  name: 'snapshot',
  emotes: [
    { code: 'snap', url: 'https://cdn.7tv.app/emote/2/2x.webp', flags: 0, provider: '7tv' },
  ],
};

describe('7TV metadata fallbacks', () => {
  it('uses a zero-width-capable mirror when the API fails', async () => {
    http.fetchProviderJson.mockRejectedValue(new Error('blocked'));
    mirrors.fetchSevenTvGlobalMirror.mockResolvedValue(mirror);
    const result = await fetchSevenTvGlobal();
    expect(result.emotes.map((emote) => emote.code)).toEqual(['mirrored']);
  });

  it('uses a snapshot when mirrors fail', async () => {
    http.fetchProviderJson.mockRejectedValue(new Error('blocked'));
    mirrors.fetchSevenTvGlobalMirror.mockResolvedValue(null);
    snapshots.sevenTvGlobalSnapshot.mockResolvedValue(snapshot);
    const result = await fetchSevenTvGlobal();
    expect(result.emotes.map((emote) => emote.code)).toEqual(['snap']);
  });

  it('uses global 7TV as the built-in default set fallback', async () => {
    http.fetchProviderJson.mockRejectedValue(new Error('blocked'));
    snapshots.sevenTvSetSnapshot.mockResolvedValue(null);
    snapshots.sevenTvGlobalSnapshot.mockResolvedValue(snapshot);
    const result = await fetchSevenTvSet(DEFAULT_GLOBAL_SET_IDS[0] ?? '');
    expect(result.emotes.map((emote) => emote.code)).toEqual(['snap']);
    expect(result.name).toContain('fallback');
  });

  it('keeps an arbitrary set error when no snapshot exists', async () => {
    http.fetchProviderJson.mockRejectedValue(new Error('blocked'));
    snapshots.sevenTvSetSnapshot.mockResolvedValue(null);
    await expect(fetchSevenTvSet('abcdef')).rejects.toThrow('blocked');
  });
});
