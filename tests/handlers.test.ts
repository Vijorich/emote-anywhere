import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MAX_CUSTOM_SETS } from '../src/core/config';
import type { AppSettings, AppState, RpcRequest } from '../src/core/types';
import { clearFrameContexts, listFrameContexts } from '../src/background/contexts';

const state = vi.hoisted(() => ({
  getState: vi.fn(),
  mutateState: vi.fn(),
  updateSettings: vi.fn(),
}));

const permissions = vi.hoisted(() => ({ contains: vi.fn() }));

const resolver = vi.hoisted(() => ({
  resolveEmotes: vi.fn(),
  lookupSevenTvSet: vi.fn(),
}));

vi.mock('wxt/browser', () => ({
  browser: { permissions },
}));

vi.mock('../src/core/state', () => state);
vi.mock('../src/core/emotes/resolve', () => resolver);

import { clearRegistrationCache, handleRpc } from '../src/background/handlers';

const settings: AppSettings = {
  globalMode: false,
  emoteScale: 1.2,
  autoChannel: true,
  pickerEnabled: true,
  providers: { sevenTv: true, bttv: true, ffz: true },
};

function stateWithChat(): AppState {
  return {
    version: 1,
    settings,
    registries: [],
    plugins: {
      'r:chat': {
        key: 'r:chat',
        registryId: 'r',
        enabled: true,
        addedAt: 0,
        updatedAt: 0,
        descriptor: {
          schemaVersion: 1,
          id: 'chat',
          name: 'Chat',
          version: '1.0.0',
          matches: ['https://chat.example/*'],
          chat: {
            messages: ['.message'],
            channel: { from: 'constant', value: 'chat' },
          },
        },
      },
    },
    bindings: {},
    globalBinding: { sets: [] },
    customSets: [],
  };
}

beforeEach(async () => {
  await clearFrameContexts();
  clearRegistrationCache();
  state.getState.mockReset();
  state.mutateState.mockReset();
  state.updateSettings.mockReset();
  state.updateSettings.mockImplementation(async (patch: Partial<AppSettings>) => {
    return { settings: { ...settings, ...patch } } as AppState;
  });
  permissions.contains.mockReset();
  resolver.resolveEmotes.mockReset();
  resolver.lookupSevenTvSet.mockReset();
});

describe('RPC boundaries', () => {
  it('clamps emoteScale before updating settings', async () => {
    await expect(
      handleRpc({ type: 'settings/update', patch: { emoteScale: -10 } }, null),
    ).resolves.toMatchObject({ emoteScale: 0.5 });
    await expect(
      handleRpc({ type: 'settings/update', patch: { emoteScale: 10 } }, null),
    ).resolves.toMatchObject({ emoteScale: 3 });
    await expect(
      handleRpc({ type: 'settings/update', patch: { emoteScale: 1.35 } }, null),
    ).resolves.toMatchObject({ emoteScale: 1.35 });

    expect(state.updateSettings).toHaveBeenNthCalledWith(1, { emoteScale: 0.5 });
    expect(state.updateSettings).toHaveBeenNthCalledWith(2, { emoteScale: 3 });
    expect(state.updateSettings).toHaveBeenNthCalledWith(3, { emoteScale: 1.35 });
  });

  it('rejects an invalid custom set without mutating state', async () => {
    await expect(
      handleRpc(
        {
          type: 'set/add',
          name: 'Bad set',
          emotes: [{ code: 'two words', url: 'https://cdn.example/emote.png' }],
        },
        null,
      ),
    ).rejects.toThrow('must not contain whitespace');

    expect(state.mutateState).not.toHaveBeenCalled();
  });

  it('rejects a custom set when the custom-set limit is reached', async () => {
    const current: AppState = {
      version: 1,
      settings,
      registries: [],
      plugins: {},
      bindings: {},
      globalBinding: { sets: [] },
      customSets: Array.from({ length: MAX_CUSTOM_SETS }, (_, index) => ({
        id: `set-${index}`,
        name: `Set ${index}`,
        enabled: true,
        emotes: [],
      })),
    };
    state.mutateState.mockImplementation(async (change: (next: AppState) => unknown) => {
      const result = await change(current);
      return { state: current, result };
    });

    await expect(
      handleRpc(
        {
          type: 'set/add',
          name: 'One more',
          emotes: [{ code: 'ok', url: 'https://cdn.example/ok.png' }],
        },
        null,
      ),
    ).rejects.toThrow(`at most ${MAX_CUSTOM_SETS}`);
  });

  it('does not hand out a plugin without host permission', async () => {
    const appState: AppState = {
      version: 1,
      settings,
      registries: [],
      plugins: {
        'r:chat': {
          key: 'r:chat',
          registryId: 'r',
          enabled: true,
          addedAt: 0,
          updatedAt: 0,
          descriptor: {
            schemaVersion: 1,
            id: 'chat',
            name: 'Chat',
            version: '1.0.0',
            matches: ['https://chat.example/*'],
            chat: {
              messages: ['.message'],
              channel: { from: 'constant', value: 'chat' },
            },
          },
        },
      },
      bindings: {},
      globalBinding: { sets: [] },
      customSets: [],
    };
    state.getState.mockResolvedValue(appState);

    permissions.contains.mockResolvedValueOnce(false);
    await expect(
      handleRpc({ type: 'plugin/forUrl', url: 'https://chat.example/x' }, null),
    ).resolves.toBeNull();

    permissions.contains.mockResolvedValueOnce(true);
    await expect(
      handleRpc({ type: 'plugin/forUrl', url: 'https://chat.example/x' }, null),
    ).resolves.toMatchObject({ pluginKey: 'r:chat' });
  });

  it('registers and clears a frame context using sender metadata', async () => {
    const sender = { tab: { id: 7 }, frameId: 3 };

    await handleRpc(
      {
        type: 'frame/context',
        context: {
          pluginKey: 'default:vk',
          channelKey: 'chat-1',
          sevenTvId: '123',
          url: 'https://vk.com/im?sel=1',
        },
      },
      sender,
    );

    expect(await listFrameContexts(7)).toEqual([
      expect.objectContaining({
        tabId: 7,
        frameId: 3,
        pluginKey: 'default:vk',
        channelKey: 'chat-1',
        sevenTvId: '123',
      }),
    ]);
    await expect(handleRpc({ type: 'frame/contexts', tabId: 7 }, null)).resolves.toHaveLength(1);

    await handleRpc({ type: 'frame/context', context: null }, sender);
    expect(await listFrameContexts(7)).toEqual([]);
  });

  it('rejects invalid frame-context tab ids', async () => {
    await expect(handleRpc({ type: 'frame/contexts', tabId: -1 }, null)).rejects.toThrow(
      'Invalid tab id',
    );
  });

  it('reuses resolved emotes across frames until their inputs change', async () => {
    const appState = stateWithChat();
    state.getState.mockResolvedValue(appState);
    resolver.resolveEmotes.mockResolvedValue({
      emotes: [{ code: 'peepoSad', url: 'https://cdn.example/e.png', flags: 0, provider: '7tv' }],
      sources: ['7tv:global'],
      errors: [],
    });
    const request = {
      type: 'chat/register' as const,
      pluginKey: 'r:chat',
      channelKey: 'chan',
    };

    const first = (await handleRpc(request, null)) as {
      emotes: Array<Record<string, unknown>>;
    };
    await handleRpc(request, null);
    expect(resolver.resolveEmotes).toHaveBeenCalledTimes(1);
    expect(first.emotes[0]).toEqual({
      code: 'peepoSad',
      url: 'https://cdn.example/e.png',
      flags: 0,
    });

    const changed = structuredClone(appState);
    changed.settings.providers.bttv = false;
    state.getState.mockResolvedValue(changed);
    await handleRpc(request, null);
    expect(resolver.resolveEmotes).toHaveBeenCalledTimes(2);
  });

  it('does not cache registrations with provider errors', async () => {
    state.getState.mockResolvedValue(stateWithChat());
    resolver.resolveEmotes.mockResolvedValue({
      emotes: [],
      sources: [],
      errors: ['7tv:global: HTTP 503'],
    });
    const request = {
      type: 'chat/register' as const,
      pluginKey: 'r:chat',
      channelKey: 'chan',
    };

    await handleRpc(request, null);
    await handleRpc(request, null);

    expect(resolver.resolveEmotes).toHaveBeenCalledTimes(2);
  });

  it('rejects an unknown RPC request', async () => {
    const request = { type: 'unknown/request' } as unknown as RpcRequest;

    await expect(handleRpc(request, null)).rejects.toThrow('Unknown request');
  });
});
