import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { STATE_KEY } from '../src/core/config';
import { createDefaultState } from '../src/core/state';
import type { AppSettings, InstalledPlugin } from '../src/core/types';
import { parsePluginDescriptor } from '../src/core/validate';

const mocks = vi.hoisted(() => ({
  data: {} as Record<string, unknown>,
  contains: vi.fn(),
  getRegistered: vi.fn(),
  unregister: vi.fn(),
  register: vi.fn(),
}));

vi.mock('wxt/browser', () => ({
  browser: {
    storage: {
      local: {
        get: async (key: string) => ({ [key]: mocks.data[key] }),
        set: async (values: Record<string, unknown>) => {
          Object.assign(mocks.data, values);
        },
        remove: async (key: string) => {
          delete mocks.data[key];
        },
      },
    },
    permissions: { contains: mocks.contains },
    scripting: {
      getRegisteredContentScripts: mocks.getRegistered,
      unregisterContentScripts: mocks.unregister,
      registerContentScripts: mocks.register,
    },
  },
}));

vi.mock('../src/core/emotes/cache', () => ({
  cached: async (_key: string, _ttl: number, loader: () => Promise<unknown>) => loader(),
}));

import { findPluginForUrl, syncContentScript } from '../src/background/plugins';
import { resolveEmotes } from '../src/core/emotes/resolve';
import { fetchSevenTvUser } from '../src/core/emotes/seven-tv';

function plugin(id: string, matches: string[], priority?: number): InstalledPlugin {
  return {
    key: `r:${id}`,
    registryId: 'r',
    descriptor: parsePluginDescriptor({
      schemaVersion: 1,
      id,
      name: id,
      version: '1.0.0',
      matches,
      ...(priority === undefined ? {} : { priority }),
      chat: {
        messages: ['.message'],
        channel: { from: 'constant', value: 'channel' },
      },
    }),
    enabled: true,
    addedAt: 1,
    updatedAt: 1,
  };
}

const settings: AppSettings = {
  globalMode: false,
  emoteScale: 1.2,
  autoChannel: true,
  pickerEnabled: true,
  providers: { sevenTv: false, bttv: false, ffz: false },
};

beforeEach(() => {
  mocks.data = {};
  vi.clearAllMocks();
  mocks.contains.mockResolvedValue(true);
  mocks.getRegistered.mockResolvedValue([]);
  mocks.unregister.mockResolvedValue(undefined);
  mocks.register.mockResolvedValue(undefined);
  vi.stubGlobal('fetch', vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('7TV user id trust boundary', () => {
  it('rejects arbitrary extracted values before any request', async () => {
    const invalid = [
      ['twitch', 'session_token=secret'],
      ['youtube', 'secret-token'],
      ['kick', 'kick-login'],
    ] as const;

    for (const [platform, id] of invalid) {
      await expect(fetchSevenTvUser(platform, id)).rejects.toThrow(`Invalid ${platform} user id`);
    }
    expect(fetch).not.toHaveBeenCalled();
  });

  it('keeps other emote layers working when an extracted id is invalid', async () => {
    const result = await resolveEmotes({
      binding: null,
      globalBinding: { sets: [] },
      settings,
      customSets: [
        {
          id: 'custom',
          name: 'Custom',
          enabled: true,
          emotes: [{ code: 'safe', url: 'https://cdn.example/safe.png', flags: 0 }],
        },
      ],
      sevenTv: { platform: 'twitch', id: { from: 'constant', value: 'secret' } },
      sevenTvId: 'session_token=secret',
    });

    expect(fetch).not.toHaveBeenCalled();
    expect(result.emotes.map((emote) => emote.code)).toEqual(['safe']);
    expect(result.sources).toEqual(['custom:Custom']);
    expect(result.errors).toEqual([
      '7tv:twitch:session_token=secret: Invalid twitch user id',
    ]);
  });

  it('accepts documented platform id shapes', async () => {
    vi.mocked(fetch).mockImplementation(async () =>
      new Response(JSON.stringify({ emote_set: null }), { status: 200 }),
    );
    const valid = [
      ['twitch', '123456789'],
      ['youtube', `UC${'a'.repeat(22)}`],
      ['kick', '987654321'],
    ] as const;

    for (const [platform, id] of valid) await fetchSevenTvUser(platform, id);

    expect(vi.mocked(fetch).mock.calls.map((call) => call[0])).toEqual(
      valid.map(([platform, id]) => `https://7tv.io/v3/users/${platform}/${id}`),
    );
  });
});

describe('plugin matching and registration', () => {
  it('scores only patterns that match the requested URL', () => {
    const state = createDefaultState();
    const correct = plugin('correct', ['https://example.com/chat']);
    const wrong = plugin('wrong', [
      'https://example.com/*',
      `https://other.test/${'x'.repeat(2000)}`,
    ]);
    state.plugins = { [correct.key]: correct, [wrong.key]: wrong };

    expect(findPluginForUrl(state, 'https://example.com/chat')?.key).toBe(correct.key);
  });

  it('does not re-register an unchanged enabled match set', async () => {
    const installed = plugin('chat', ['https://a.test/*', 'https://b.test/*']);
    const state = createDefaultState();
    state.plugins = { [installed.key]: installed };
    mocks.data[STATE_KEY] = state;
    mocks.getRegistered.mockResolvedValue([
      { id: 'ea-core', matches: ['https://b.test/*', 'https://a.test/*'] },
    ]);

    await syncContentScript();

    expect(mocks.unregister).not.toHaveBeenCalled();
    expect(mocks.register).not.toHaveBeenCalled();
  });
});
