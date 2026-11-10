import { beforeEach, describe, expect, it, vi } from 'vitest';

const http = vi.hoisted(() => ({ fetchProviderJson: vi.fn() }));
vi.mock('../src/core/emotes/http', () => http);

import {
  fetchSevenTvGlobalMirror,
  fetchTwitchGlobalMirror,
} from '../src/core/emotes/mirrors';

beforeEach(() => {
  http.fetchProviderJson.mockReset();
});

const mirror = [
  {
    provider: 1,
    code: 'catJAM',
    urls: [
      { size: '1x', url: 'https://cdn.7tv.app/emote/1/1x.webp' },
      { size: '2x', url: 'https://cdn.7tv.app/emote/1/2x.webp' },
    ],
  },
  {
    provider: 1,
    code: 'Overlay',
    zero_width: true,
    urls: [{ size: '2x', url: 'https://cdn.7tv.app/emote/2/2x.webp' }],
  },
  {
    provider: 0,
    code: 'ignored',
    urls: [{ size: '2x', url: 'https://static-cdn.jtvnw.net/2.0' }],
  },
];

describe('emote mirrors', () => {
  it('normalizes the preferred 7TV mirror and keeps zero-width flags', async () => {
    http.fetchProviderJson.mockResolvedValueOnce(mirror);
    const result = await fetchSevenTvGlobalMirror();
    expect(result?.emotes).toEqual([
      { code: 'catJAM', url: 'https://cdn.7tv.app/emote/1/2x.webp', flags: 0, provider: '7tv' },
      { code: 'Overlay', url: 'https://cdn.7tv.app/emote/2/2x.webp', flags: 256, provider: '7tv' },
    ]);
    expect(result?.zeroWidthSupported).toBe(true);
    expect(http.fetchProviderJson).toHaveBeenCalledWith(
      'https://emotes.crippled.dev/v1/global/7tv',
      expect.any(Object),
    );
  });

  it('falls back to tEmotes but marks zero-width as unsupported', async () => {
    http.fetchProviderJson
      .mockRejectedValueOnce(new Error('down'))
      .mockResolvedValueOnce(mirror.map(({ zero_width: _ignored, ...item }) => item));
    const result = await fetchSevenTvGlobalMirror();
    expect(result?.emotes[1]?.flags).toBe(0);
    expect(result?.zeroWidthSupported).toBe(false);
  });

  it('uses the Twitch mirror with provider filtering', async () => {
    http.fetchProviderJson.mockResolvedValueOnce(mirror);
    const result = await fetchTwitchGlobalMirror();
    expect(result?.emotes.map((emote) => emote.code)).toEqual(['ignored']);
    expect(result?.emotes[0]?.provider).toBe('twitch');
  });
});
