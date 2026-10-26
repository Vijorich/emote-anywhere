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

vi.mock('wxt/browser', () => ({
  browser: { permissions },
}));

vi.mock('../src/core/state', () => state);

import { handleRpc } from '../src/background/handlers';

const settings: AppSettings = {
  globalMode: false,
  emoteScale: 1.2,
  autoChannel: true,
  pickerEnabled: true,
  providers: { sevenTv: true, bttv: true, ffz: true },
};

beforeEach(async () => {
  await clearFrameContexts();
  state.getState.mockReset();
  state.mutateState.mockReset();
  state.updateSettings.mockReset();
  state.updateSettings.mockImplementation(async (patch: Partial<AppSettings>) => {
    return { settings: { ...settings, ...patch } } as AppState;
  });
  permissions.contains.mockReset();
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

  it('rejects an unknown RPC request', async () => {
    const request = { type: 'unknown/request' } as unknown as RpcRequest;

    await expect(handleRpc(request, null)).rejects.toThrow('Unknown request');
  });
});
