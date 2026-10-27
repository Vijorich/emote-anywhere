// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppState, InstalledPlugin } from '../src/core/types';

const TAB_URL = 'https://chat.example/im';
const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  queryTabs: vi.fn(),
  sendMessage: vi.fn(),
  createTab: vi.fn(async () => ({})),
  reloadTab: vi.fn(async () => undefined),
  requestPermission: vi.fn(),
  addStorageListener: vi.fn(),
  urlMatchesAny: vi.fn(),
  matchSpecificity: vi.fn(),
}));

vi.mock('wxt/browser', () => ({
  browser: {
    permissions: { request: mocks.requestPermission },
    storage: { onChanged: { addListener: mocks.addStorageListener } },
    tabs: {
      query: mocks.queryTabs,
      sendMessage: mocks.sendMessage,
      create: mocks.createTab,
      reload: mocks.reloadTab,
    },
  },
}));
vi.mock('../src/core/rpc', () => ({ rpc: mocks.rpc }));
vi.mock('../src/core/url-match', () => ({
  urlMatchesAny: mocks.urlMatchesAny,
  matchSpecificity: mocks.matchSpecificity,
}));

function plugin(key: string, name: string, priority: number): InstalledPlugin {
  return {
    key,
    registryId: 'test',
    enabled: false,
    addedAt: 0,
    updatedAt: 0,
    descriptor: {
      schemaVersion: 1,
      id: key,
      name,
      version: '1.0.0',
      priority,
      matches: ['https://chat.example/*'],
      chat: { messages: ['.message'], channel: { from: 'constant', value: 'default' } },
    },
  };
}

function makeState(): AppState {
  return {
    version: 1,
    settings: {
      globalMode: false,
      emoteScale: 1.2,
      autoChannel: true,
      pickerEnabled: true,
      providers: { sevenTv: true, bttv: true, ffz: true },
    },
    registries: [],
    plugins: { a: plugin('a', 'Chat A', 1), b: plugin('b', 'Chat B', 2) },
    bindings: {},
    globalBinding: { sets: [] },
    customSets: [],
  };
}

let currentState: AppState;
let setName: string;
let frameContexts: unknown[];

function defaultRpc(type: string): unknown {
  if (type === 'state/get') return currentState;
  if (type === 'cache/clear' || type === 'plugin/enable') return true;
  if (type === 'frame/contexts') return frameContexts;
  if (type === 'sevenTv/lookupSet') {
    return { id: 'set', name: setName, emoteCount: 1, preview: [] };
  }
  throw new Error(`Unexpected request: ${type}`);
}

beforeEach(() => {
  vi.resetModules();
  for (const mock of Object.values(mocks)) mock.mockReset();
  currentState = makeState();
  setName = 'Set';
  frameContexts = [];
  mocks.rpc.mockImplementation(async (type: string) => defaultRpc(type));
  mocks.queryTabs.mockResolvedValue([{ id: 7, url: TAB_URL }]);
  mocks.sendMessage.mockImplementation(async (_id: number, message: { type?: string }) =>
    message.type === 'ea/context'
      ? { pluginKey: 'b', channelKey: 'default', url: TAB_URL }
      : undefined,
  );
  mocks.requestPermission.mockResolvedValue(true);
  mocks.urlMatchesAny.mockReturnValue(true);
  mocks.matchSpecificity.mockImplementation((_patterns: string[], priority = 0) => priority);
  document.body.innerHTML = '<main id="app"></main>';
});

describe('popup UI', () => {
  it('shows a load error and retries instead of loading forever', async () => {
    let attempts = 0;
    mocks.rpc.mockImplementation(async (type: string) => {
      if (type === 'state/get') {
        attempts++;
        if (attempts === 1) throw new Error('State unavailable');
      }
      return defaultRpc(type);
    });
    await import('../src/entrypoints/popup/main');

    await vi.waitFor(() =>
      expect([...document.querySelectorAll('button')].some((button) => button.textContent === 'Retry')).toBe(true),
    );
    expect(document.querySelector('.banner.error')?.textContent).toBe('State unavailable');
    expect(document.body.textContent).not.toContain('Loading…');

    const retry = [...document.querySelectorAll<HTMLButtonElement>('button')].find(
      (button) => button.textContent === 'Retry',
    )!;
    retry.click();
    await vi.waitFor(() =>
      expect(document.querySelector('input[aria-label="Enable Chat B"]')).not.toBeNull(),
    );
    expect(attempts).toBe(2);
  });

  it('handles permission rejection and restores the enable switch', async () => {
    mocks.requestPermission.mockRejectedValueOnce(new Error('Permission denied'));
    await import('../src/entrypoints/popup/main');
    await vi.waitFor(() =>
      expect(document.querySelector('input[aria-label="Enable Chat B"]')).not.toBeNull(),
    );
    const input = document.querySelector<HTMLInputElement>('input[aria-label="Enable Chat B"]')!;

    input.click();
    await vi.waitFor(() =>
      expect(document.querySelector('.banner.error')?.textContent).toContain('Permission denied'),
    );

    const restored = document.querySelector<HTMLInputElement>('input[aria-label="Enable Chat B"]')!;
    expect(restored.checked).toBe(false);
    expect(mocks.rpc.mock.calls.some(([type]) => type === 'plugin/enable')).toBe(false);
  });

  it('prefers the enabled plugin when a disabled plugin has higher priority', async () => {
    currentState.plugins.a!.enabled = true;
    currentState.plugins.b!.enabled = false;
    mocks.sendMessage.mockRejectedValue(new Error('no content context'));
    await import('../src/entrypoints/popup/main');

    await vi.waitFor(() =>
      expect(document.querySelector('.plugin-name')?.textContent).toBe('Chat A'),
    );
  });

  it('uses a registered iframe context instead of the top frame', async () => {
    currentState.plugins.b!.enabled = true;
    frameContexts = [
      {
        tabId: 7,
        frameId: 4,
        pluginKey: 'b',
        channelKey: 'frame-chat',
        url: 'https://chat.example/embed',
        updatedAt: Date.now(),
      },
    ];
    await import('../src/entrypoints/popup/main');

    await vi.waitFor(() =>
      expect(document.querySelector('.panel-head .mono')?.textContent).toBe('Channel frame-chat'),
    );
  });

  it('clears presentation lookups before Reload emotes refreshes previews', async () => {
    currentState.plugins.b!.enabled = true;
    currentState.bindings['b|default'] = {
      key: 'b|default',
      pluginKey: 'b',
      channelKey: 'default',
      label: 'Chat B · default',
      sets: ['set'],
    };
    setName = 'Before';
    await import('../src/entrypoints/popup/main');
    await vi.waitFor(() =>
      expect(document.querySelector('.chip-label')?.textContent).toBe('Before'),
    );
    setName = 'After';
    const reload = [...document.querySelectorAll<HTMLButtonElement>('button')].find(
      (button) => button.textContent === 'Reload emotes',
    )!;

    reload.click();
    await vi.waitFor(
      () => expect(document.querySelector('.chip-label')?.textContent).toBe('After'),
      { timeout: 2000 },
    );

    expect(mocks.rpc.mock.calls.filter(([type]) => type === 'sevenTv/lookupSet')).toHaveLength(2);
  });
});
