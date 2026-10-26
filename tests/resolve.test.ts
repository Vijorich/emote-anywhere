import { describe, expect, it, vi } from 'vitest';
import type { Emote } from '../src/core/types';

vi.mock('../src/core/emotes/cache', () => ({
  cached: async (_key: string, _ttl: number, loader: () => Promise<unknown>) => loader(),
  clearEmoteCache: async () => undefined,
}));

vi.mock('../src/core/emotes/seven-tv', () => ({
  fetchSevenTvSet: vi.fn(async (id: string) => ({
    name: id,
    emotes: [emote(`set-${id}`, `https://cdn.example/set-${id}.png`)],
  })),
  fetchSevenTvUser: vi.fn(async () => ({
    name: 'channel',
    emotes: [emote('channel-emote', 'https://cdn.example/channel.png')],
  })),
  fetchSevenTvGlobal: vi.fn(async () => ({
    name: 'global',
    emotes: [emote('global-emote', 'https://cdn.example/global.png')],
  })),
}));

vi.mock('../src/core/emotes/bttv', () => ({
  fetchBttvGlobal: vi.fn(async () => []),
}));

vi.mock('../src/core/emotes/ffz', () => ({
  fetchFfzGlobal: vi.fn(async () => []),
}));

import { resolveEmotes, type ResolveOptions } from '../src/core/emotes/resolve';

function emote(code: string, url: string): Emote {
  return { code, url, flags: 0, provider: '7tv' };
}

const settings = {
  globalMode: false,
  emoteScale: 1.2,
  autoChannel: true,
  pickerEnabled: true,
  providers: { sevenTv: true, bttv: false, ffz: false },
};

function options(overrides: Partial<ResolveOptions> = {}): ResolveOptions {
  return {
    binding: null,
    globalBinding: { sets: ['bbbbbb'] },
    settings,
    customSets: [],
    sevenTv: { platform: 'twitch' as const, id: { from: 'constant' as const, value: 'chan' } },
    sevenTvId: 'chan',
    ...overrides,
  };
}

describe('resolveEmotes', () => {
  it('loads per-chat, global, channel and provider layers in priority order', async () => {
    const result = await resolveEmotes(
      options({
        binding: {
          key: 'p|c',
          pluginKey: 'p',
          channelKey: 'c',
          label: 'chat',
          sets: ['aaaaaa'],
        },
      }),
    );

    expect(result.sources).toEqual([
      '7tv:set:aaaaaa',
      '7tv:global-set:bbbbbb',
      '7tv:global',
    ]);
    expect(result.emotes.map((item) => item.code)).toEqual([
      'set-aaaaaa',
      'set-bbbbbb',
      'global-emote',
    ]);
  });

  it('applies global sets when no per-chat binding exists', async () => {
    const result = await resolveEmotes(options());
    expect(result.sources).toContain('7tv:global-set:bbbbbb');
  });

  it('lets a per-chat set win a duplicate code', async () => {
    const { fetchSevenTvSet } = await import('../src/core/emotes/seven-tv');
    vi.mocked(fetchSevenTvSet).mockImplementationOnce(async () => ({
      name: 'chat',
      emotes: [emote('global-emote', 'https://cdn.example/chat-wins.png')],
    }));

    const result = await resolveEmotes(
      options({
        binding: {
          key: 'p|c',
          pluginKey: 'p',
          channelKey: 'c',
          label: 'chat',
          sets: ['aaaaaa'],
        },
      }),
    );

    const winner = result.emotes.find((item) => item.code === 'global-emote');
    expect(winner?.url).toBe('https://cdn.example/chat-wins.png');
  });
});
