import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MAX_PROVIDER_BYTES } from '../src/core/config';

vi.mock('../src/core/emotes/cache', () => ({
  cached: async (_key: string, _ttl: number, loader: () => Promise<unknown>) => loader(),
}));

import { fetchBttvGlobal } from '../src/core/emotes/bttv';
import { fetchFfzGlobal } from '../src/core/emotes/ffz';
import {
  fetchSevenTvGlobal,
  fetchSevenTvSet,
  fetchSevenTvUser,
  normalizeSevenTvSet,
} from '../src/core/emotes/seven-tv';

const fetchMock = vi.fn();

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

function sevenTvEmote(id: string, code: string) {
  return {
    id,
    name: code,
    data: {
      name: code,
      host: {
        url: `//cdn.7tv.app/emote/${id}`,
        files: [{ name: '1x.webp', width: 32, height: 32 }],
      },
    },
  };
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('7TV providers', () => {
  it('normalizes aliases, zero-width flags, image preferences, and malformed entries', () => {
    const result = normalizeSevenTvSet({
      name: 'Channel set',
      emotes: [
        {
          id: 'zero-width',
          name: 'ZeroWidth',
          flags: 1,
          data: {
            name: 'Unused alias',
            flags: 256,
            host: {
              url: '//cdn.7tv.app/emote/zero-width/',
              files: [
                { name: '1x.webp', width: 32, height: 32 },
                { name: '2x.avif', width: 64, height: 64 },
                { name: '2x.webp', width: 64, height: 64 },
              ],
            },
          },
        },
        {
          id: 'fallback-id',
          data: {
            name: '  FallbackCode  ',
            host: { url: 'https://cdn.7tv.app/emote/fallback-id', files: [] },
          },
        },
        {
          id: 'duplicate',
          name: 'ZeroWidth',
          data: { name: 'ZeroWidth' },
        },
        {
          id: 'blank',
          name: '   ',
          data: { name: 'BlankAlias' },
        },
        {
          id: 'no-data',
          name: 'NoData',
          data: null,
        },
      ],
    });

    expect(result).toEqual({
      name: 'Channel set',
      emotes: [
        {
          code: 'ZeroWidth',
          url: 'https://cdn.7tv.app/emote/zero-width/2x.webp',
          flags: 257,
          provider: '7tv',
        },
        {
          code: 'FallbackCode',
          url: 'https://cdn.7tv.app/emote/fallback-id/2x.webp',
          flags: 0,
          provider: '7tv',
        },
      ],
    });
  });

  it('loads set and global payloads through the public fetch functions', async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({ name: 'Named set', emotes: [sevenTvEmote('set-id', 'SetEmote')] }),
      )
      .mockResolvedValueOnce(
        jsonResponse({ name: 'Global', emotes: [sevenTvEmote('global-id', 'GlobalEmote')] }),
      );

    const set = await fetchSevenTvSet('abc123');
    const global = await fetchSevenTvGlobal();

    expect(set.emotes.map((emote) => emote.code)).toEqual(['SetEmote']);
    expect(global.emotes.map((emote) => emote.code)).toEqual(['GlobalEmote']);
    expect(fetchMock.mock.calls.map((call) => call[0])).toEqual([
      'https://7tv.io/v3/emote-sets/abc123',
      'https://7tv.io/v3/emote-sets/global',
    ]);
  });

  it('loads channel sets and defaults an absent channel set to empty', async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({
          emote_set: {
            name: 'Channel',
            emotes: [sevenTvEmote('channel-id', 'ChannelEmote')],
          },
        }),
      )
      .mockResolvedValueOnce(jsonResponse({ emote_set: null }));

    const channel = await fetchSevenTvUser('twitch', '123456789');
    const empty = await fetchSevenTvUser('twitch', '123456789');

    expect(channel.emotes.map((emote) => emote.code)).toEqual(['ChannelEmote']);
    expect(empty).toEqual({ name: '7TV set', emotes: [] });
    expect(fetchMock).toHaveBeenCalledWith(
      'https://7tv.io/v3/users/twitch/123456789',
      expect.objectContaining({ cache: 'no-store' }),
    );
  });
});

describe('BTTV provider', () => {
  it('parses global emotes, trims codes, and skips duplicates', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse([
        { id: 'cat-id', code: 'catJAM' },
        { id: 'clap-id', code: '  Clap  ' },
        { id: 'duplicate-id', code: 'catJAM' },
      ]),
    );

    await expect(fetchBttvGlobal()).resolves.toEqual([
      {
        code: 'catJAM',
        url: 'https://cdn.betterttv.net/emote/cat-id/2x',
        flags: 0,
        provider: 'bttv',
      },
      {
        code: 'Clap',
        url: 'https://cdn.betterttv.net/emote/clap-id/2x',
        flags: 0,
        provider: 'bttv',
      },
    ]);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      'https://api.betterttv.net/3/cached/emotes/global',
    );
  });

  it('returns an empty list for empty or incomplete global data', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse([]))
      .mockResolvedValueOnce(
        jsonResponse([
          {},
          { id: 'id-only' },
          { code: 'code-only' },
          { id: 'blank-id', code: '   ' },
        ]),
      );

    await expect(fetchBttvGlobal()).resolves.toEqual([]);
    await expect(fetchBttvGlobal()).resolves.toEqual([]);
  });

  it('rejects oversized provider responses', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response('x'.repeat(MAX_PROVIDER_BYTES + 1), { status: 200 }),
    );

    await expect(fetchBttvGlobal()).rejects.toThrow('Provider response is too large');
  });
});

describe('FFZ provider', () => {
  it('parses default sets, URL preferences, fallbacks, and duplicates', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        default_sets: [3, 2, 999],
        sets: {
          '2': {
            emoticons: [
              {
                id: 20,
                name: 'peepoHappy',
                urls: { '2': 'https://cdn.frankerfacez.com/emoticon/20/2' },
              },
            ],
          },
          '3': {
            emoticons: [
              {
                id: 10,
                name: '  peepoHappy  ',
                urls: {
                  '1': 'https://cdn.frankerfacez.com/emoticon/10/1',
                  '2': 'https://cdn.frankerfacez.com/emoticon/10/2',
                },
              },
              {
                id: 11,
                name: 'OneX',
                urls: {
                  '1': 'https://cdn.frankerfacez.com/emoticon/11/1',
                  '4': 'https://cdn.frankerfacez.com/emoticon/11/4',
                },
              },
              {
                id: 12,
                name: 'FourX',
                urls: { '4': 'https://cdn.frankerfacez.com/emoticon/12/4' },
              },
              { id: 13, name: 'Fallback' },
            ],
          },
        },
      }),
    );

    await expect(fetchFfzGlobal()).resolves.toEqual([
      {
        code: 'peepoHappy',
        url: 'https://cdn.frankerfacez.com/emoticon/10/2',
        flags: 0,
        provider: 'ffz',
      },
      {
        code: 'OneX',
        url: 'https://cdn.frankerfacez.com/emoticon/11/1',
        flags: 0,
        provider: 'ffz',
      },
      {
        code: 'FourX',
        url: 'https://cdn.frankerfacez.com/emoticon/12/4',
        flags: 0,
        provider: 'ffz',
      },
      {
        code: 'Fallback',
        url: 'https://cdn.frankerfacez.com/emoticon/13/2',
        flags: 0,
        provider: 'ffz',
      },
    ]);
    expect(fetchMock.mock.calls[0]?.[0]).toBe('https://api.frankerfacez.com/v1/set/global');
  });

  it('returns an empty list for empty, missing, or incomplete set data', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({}))
      .mockResolvedValueOnce(
        jsonResponse({
          default_sets: [1, 404],
          sets: {
            '1': {
              emoticons: [
                {},
                { id: 1 },
                { name: 'NoUrl', urls: {} },
                { name: '   ', urls: { '2': 'https://cdn.example/blank/2' } },
              ],
            },
          },
        }),
      );

    await expect(fetchFfzGlobal()).resolves.toEqual([]);
    await expect(fetchFfzGlobal()).resolves.toEqual([]);
  });
});
