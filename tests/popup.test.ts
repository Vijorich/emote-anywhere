// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
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

function defaultRpc(type: string, payload: Record<string, unknown> = {}): unknown {
  if (type === 'state/get') return currentState;
  if (type === 'cache/clear' || type === 'plugin/enable') return true;
  if (type === 'frame/contexts') return frameContexts;
  if (type === 'binding/remove') {
    delete currentState.bindings[payload.key as string];
    return true;
  }
  if (type === 'binding/set') {
    const key = `${payload.pluginKey as string}|${payload.channelKey as string}`;
    const binding = {
      key,
      pluginKey: payload.pluginKey as string,
      channelKey: payload.channelKey as string,
      label: payload.label as string,
      sets: [...((payload.sets as string[]) ?? [])],
    };
    currentState.bindings[key] = binding;
    return binding;
  }
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
  mocks.rpc.mockImplementation(async (type: string, payload?: Record<string, unknown>) =>
    defaultRpc(type, payload),
  );
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
  it('does not size the popup with viewport units', () => {
    // Chrome measures an action popup at 25x25 before sizing it to the content,
    // so 100vw/100dvh clamp the whole document to a 25px square.
    const css = readFileSync('src/entrypoints/popup/style.css', 'utf8').replace(
      /\/\*[\s\S]*?\*\//g,
      '',
    );
    expect(css).not.toMatch(/\b100(?:vw|dvh)\b/);
  });

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
    expect(document.body.textContent).toContain('Could not load settings.');
    expect(document.body.textContent).not.toContain('Loading…');

    const retry = [...document.querySelectorAll<HTMLButtonElement>('button')].find(
      (button) => button.textContent === 'Retry',
    )!;
    retry.click();
    await vi.waitFor(() =>
      expect(document.querySelector('input[aria-label="Enable Chat B"]')).not.toBeNull(),
    );
    expect(attempts).toBe(2);
    expect(document.body.textContent).not.toContain('Could not load settings.');
  });

  it('handles permission rejection and restores the enable switch', async () => {
    mocks.requestPermission.mockRejectedValueOnce(new Error('Permission denied'));
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await import('../src/entrypoints/popup/main');
    await vi.waitFor(() =>
      expect(document.querySelector('input[aria-label="Enable Chat B"]')).not.toBeNull(),
    );
    const input = document.querySelector<HTMLInputElement>('input[aria-label="Enable Chat B"]')!;

    input.click();
    await vi.waitFor(() => expect(errors).toHaveBeenCalled());

    const restored = document.querySelector<HTMLInputElement>('input[aria-label="Enable Chat B"]')!;
    expect(restored.checked).toBe(false);
    expect(mocks.rpc.mock.calls.some(([type]) => type === 'plugin/enable')).toBe(false);
    errors.mockRestore();
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
      expect(document.querySelector('.panel-head p')?.textContent).toBe('chat.example'),
    );
    expect(document.querySelector('.panel-head p')?.getAttribute('title')).toBe(
      'Channel frame-chat',
    );
  });

  it('removes a set immediately', async () => {
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
    expect(document.querySelector('.panel-head p')?.textContent).toBe('chat.example');

    const remove = document.querySelector<HTMLButtonElement>('.chip button')!;
    remove.click();
    await vi.waitFor(() => expect(currentState.bindings['b|default']).toBeUndefined());
    expect(mocks.rpc.mock.calls.some(([type]) => type === 'binding/remove')).toBe(true);
    await vi.waitFor(() => expect(document.querySelector('.chip')).toBeNull());
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
