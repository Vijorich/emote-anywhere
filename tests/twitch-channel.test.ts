import { beforeEach, describe, expect, it, vi } from 'vitest';

const cache = vi.hoisted(() => ({
  cached: vi.fn(),
}));
const http = vi.hoisted(() => ({ fetchProviderJson: vi.fn() }));
const mirrors = vi.hoisted(() => ({ fetchTwitchGlobalMirror: vi.fn() }));
const snapshots = vi.hoisted(() => ({ twitchGlobalSnapshot: vi.fn() }));

vi.mock('../src/core/emotes/cache', () => cache);
vi.mock('../src/core/emotes/http', () => http);
vi.mock('../src/core/emotes/mirrors', () => mirrors);
vi.mock('../src/core/emotes/snapshots', () => snapshots);

import { fetchBttvChannel } from '../src/core/emotes/bttv';
import { fetchFfzChannel } from '../src/core/emotes/ffz';
import { fetchTwitchGlobal } from '../src/core/emotes/twitch';

beforeEach(() => {
  cache.cached.mockReset().mockImplementation(async (_key, _ttl, loader) => loader());
  http.fetchProviderJson.mockReset();
  mirrors.fetchTwitchGlobalMirror.mockReset();
  snapshots.twitchGlobalSnapshot.mockReset();
});

describe('Twitch and channel providers', () => {
  it('uses a live Twitch mirror before its snapshot', async () => {
    mirrors.fetchTwitchGlobalMirror.mockResolvedValue({
      emotes: [
        { code: 'Kappa', url: 'https://static-cdn.jtvnw.net/1.0', flags: 0, provider: 'twitch' },
      ],
    });
    await expect(fetchTwitchGlobal()).resolves.toHaveLength(1);
    expect(snapshots.twitchGlobalSnapshot).toHaveBeenCalled();
  });

  it('falls back to the Twitch snapshot', async () => {
    mirrors.fetchTwitchGlobalMirror.mockResolvedValue(null);
    snapshots.twitchGlobalSnapshot.mockResolvedValue({
      emotes: [
        { code: 'Kappa', url: 'https://static-cdn.jtvnw.net/1.0', flags: 0, provider: 'twitch' },
      ],
    });
    const result = await fetchTwitchGlobal();
    expect(result[0]?.code).toBe('Kappa');
  });

  it('normalizes BTTV channel and shared emotes', async () => {
    http.fetchProviderJson.mockResolvedValue({
      channelEmotes: [{ id: 'a', code: 'channelA' }],
      sharedEmotes: [{ id: 'b', code: 'sharedB' }],
    });
    const result = await fetchBttvChannel('123');
    expect(result.map((emote) => emote.code)).toEqual(['channelA', 'sharedB']);
    expect(http.fetchProviderJson).toHaveBeenCalledWith(
      'https://api.betterttv.net/3/cached/users/twitch/123',
    );
  });

  it('normalizes FFZ room sets', async () => {
    http.fetchProviderJson.mockResolvedValue({
      sets: {
        '1': {
          emoticons: [
            { id: 1, name: 'ffzA', urls: { '2': 'https://cdn.frankerfacez.com/emote/1/2' } },
          ],
        },
      },
    });
    const result = await fetchFfzChannel('123');
    expect(result).toEqual([
      {
        code: 'ffzA',
        url: 'https://cdn.frankerfacez.com/emote/1/2',
        flags: 0,
        provider: 'ffz',
      },
    ]);
  });
});
