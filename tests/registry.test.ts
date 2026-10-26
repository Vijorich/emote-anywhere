import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  MAX_REGISTRY_BYTES,
  REGISTRY_TTL_MS,
  STATE_KEY,
} from '../src/core/config';
import { createDefaultState, getState } from '../src/core/state';
import type {
  AppState,
  Binding,
  InstalledPlugin,
  PluginDescriptor,
  RegistryIndex,
} from '../src/core/types';
import { parsePluginDescriptor, parseRegistryIndex } from '../src/core/validate';

const mocks = vi.hoisted(() => ({
  data: {} as Record<string, unknown>,
  sync: vi.fn(),
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
  },
}));

vi.mock('../src/background/plugins', () => ({ syncContentScript: mocks.sync }));

import { addRegistry, fetchRegistry, refreshRegistries } from '../src/background/registry';

function load(path: string): unknown {
  return JSON.parse(readFileSync(fileURLToPath(new URL(path, import.meta.url)), 'utf8'));
}

function descriptor(id: string): PluginDescriptor {
  return parsePluginDescriptor({
    schemaVersion: 1,
    id,
    name: id,
    version: '1.0.0',
    matches: ['https://example.com/*'],
    chat: {
      messages: ['.message'],
      channel: { from: 'constant', value: 'channel' },
    },
  });
}

function index(...ids: string[]): RegistryIndex {
  return { schemaVersion: 1, plugins: ids.map(descriptor) };
}

function installed(registryId: string, id: string, updatedAt = 10): InstalledPlugin {
  return {
    key: `${registryId}:${id}`,
    registryId,
    descriptor: descriptor(id),
    enabled: true,
    addedAt: 5,
    updatedAt,
  };
}

function binding(key: string, pluginKey: string): Binding {
  return { key, pluginKey, channelKey: 'channel', label: key, sets: [] };
}

function stateWithRegistry(url: string): AppState {
  const state = createDefaultState();
  state.registries = [{ id: 'r', name: 'Registry', url, lastCheckedAt: 1 }];
  return state;
}

function json(value: unknown): Response {
  return new Response(JSON.stringify(value), { status: 200 });
}

let nextUrl = 0;
function registryUrl(): string {
  nextUrl += 1;
  return `https://registry.test/${nextUrl}.json`;
}

beforeEach(() => {
  mocks.data = {};
  vi.clearAllMocks();
  vi.stubGlobal('fetch', vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('shipped registries', () => {
  it('parses the default registry', () => {
    const registry = parseRegistryIndex(load('../registry/index.json'));
    const vk = registry.plugins.find((plugin) => plugin.id === 'vk');
    expect(vk).toBeDefined();
    expect(vk?.matches).toContain('https://vk.ru/*');
    expect(vk?.chat.messages).toContain('.ConvoHistory__messageWrapper');
    expect(vk?.proxyImages).toBe(true);
  });

  it('parses the local development registry', () => {
    const registry = parseRegistryIndex(load('../registry/dev.json'));
    expect(registry.plugins[0]?.id).toBe('mock');
  });
});

describe('registry refresh', () => {
  it('keeps a user-provided registry name when the index has a name', async () => {
    const url = registryUrl();
    mocks.data[STATE_KEY] = createDefaultState();
    vi.mocked(fetch).mockResolvedValueOnce(
      json({ schemaVersion: 1, name: 'Upstream name', plugins: [descriptor('one')] }),
    );

    const created = await addRegistry(url, 'My registry');

    expect(created.name).toBe('My registry');
    const next = await getState();
    expect(next.registries.find((registry) => registry.url === url)?.name).toBe('My registry');
  });

  it('refuses to delete existing plugins when a registry returns an empty list', async () => {
    const url = registryUrl();
    const state = stateWithRegistry(url);
    state.plugins = { 'r:keep': installed('r', 'keep') };
    state.bindings = { keep: binding('keep', 'r:keep') };
    mocks.data[STATE_KEY] = state;
    vi.mocked(fetch).mockResolvedValueOnce(json(index()));

    const errors = await refreshRegistries(true);
    expect(errors).toEqual({ r: 'Registry returned no plugins; keeping the existing plugins' });

    const next = await getState();
    expect(Object.keys(next.plugins)).toEqual(['r:keep']);
    expect(Object.keys(next.bindings)).toEqual(['keep']);
    expect(next.registries[0]?.lastError).toContain('no plugins');
  });

  it('removes upstream-absent plugins and bindings, preserving unchanged timestamps', async () => {
    const url = registryUrl();
    const state = stateWithRegistry(url);
    state.plugins = { 'r:keep': installed('r', 'keep'), 'r:gone': installed('r', 'gone') };
    state.bindings = {
      keep: binding('keep', 'r:keep'),
      gone: binding('gone', 'r:gone'),
    };
    state.registries[0]!.lastError = 'old error';
    mocks.data[STATE_KEY] = state;
    vi.mocked(fetch).mockResolvedValueOnce(json(index('keep')));

    expect(await refreshRegistries(true)).toEqual({});

    const next = await getState();
    expect(Object.keys(next.plugins)).toEqual(['r:keep']);
    expect(Object.keys(next.bindings)).toEqual(['keep']);
    expect(next.plugins['r:keep']?.addedAt).toBe(5);
    expect(next.plugins['r:keep']?.updatedAt).toBe(10);
    expect(next.registries[0]?.lastError).toBeUndefined();
    expect(next.registries[0]?.lastCheckedAt).toBeGreaterThan(1);
  });

  it('does not apply stale cached data or mark a failed check fresh', async () => {
    let now = 1_000_000;
    vi.spyOn(Date, 'now').mockImplementation(() => now);
    const url = registryUrl();
    vi.mocked(fetch).mockResolvedValueOnce(json(index('cached')));
    await fetchRegistry(url, true);

    const state = stateWithRegistry(url);
    state.registries[0]!.lastCheckedAt = now;
    state.registries[0]!.lastError = 'previous error';
    state.plugins = { 'r:local': installed('r', 'local', 20) };
    state.bindings = { local: binding('local', 'r:local') };
    mocks.data[STATE_KEY] = state;
    now += REGISTRY_TTL_MS + 1;
    vi.mocked(fetch).mockResolvedValueOnce(new Response('', { status: 503 }));

    expect(await refreshRegistries(false)).toEqual({ r: 'HTTP 503' });

    const next = await getState();
    expect(next.registries[0]?.lastCheckedAt).toBe(1_000_000);
    expect(next.registries[0]?.lastError).toBe('HTTP 503');
    expect(Object.keys(next.plugins)).toEqual(['r:local']);
    expect(next.plugins['r:local']?.updatedAt).toBe(20);
    expect(Object.keys(next.bindings)).toEqual(['local']);
  });

  it('surfaces forced refresh errors instead of using cached data', async () => {
    const url = registryUrl();
    vi.mocked(fetch).mockResolvedValueOnce(json(index('cached')));
    await fetchRegistry(url, true);

    const state = stateWithRegistry(url);
    state.registries[0]!.lastCheckedAt = 50;
    state.plugins = { 'r:local': installed('r', 'local') };
    state.bindings = { local: binding('local', 'r:local') };
    mocks.data[STATE_KEY] = state;
    vi.mocked(fetch).mockResolvedValueOnce(new Response('', { status: 500 }));

    expect(await refreshRegistries(true)).toEqual({ r: 'HTTP 500' });

    const next = await getState();
    expect(next.registries[0]?.lastCheckedAt).toBe(50);
    expect(next.registries[0]?.lastError).toBe('HTTP 500');
    expect(Object.keys(next.plugins)).toEqual(['r:local']);
    expect(Object.keys(next.bindings)).toEqual(['local']);
  });

  it('does not coalesce forced refresh with an incompatible normal run', async () => {
    const url = registryUrl();
    const state = stateWithRegistry(url);
    mocks.data[STATE_KEY] = state;
    let resolveFirst!: (response: Response) => void;
    const first = new Promise<Response>((resolve) => {
      resolveFirst = resolve;
    });
    vi.mocked(fetch)
      .mockImplementationOnce(() => first)
      .mockResolvedValueOnce(new Response('', { status: 502 }));

    const normal = refreshRegistries(false);
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    const forced = refreshRegistries(true);
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    resolveFirst(json(index('fresh')));

    expect(await normal).toEqual({});
    expect(await forced).toEqual({ r: 'HTTP 502' });
  });

  it('syncs content scripts even when no registry needs refresh', async () => {
    const state = stateWithRegistry(registryUrl());
    state.registries[0]!.lastCheckedAt = Date.now();
    mocks.data[STATE_KEY] = state;

    expect(await refreshRegistries(false)).toEqual({});
    expect(fetch).not.toHaveBeenCalled();
    expect(mocks.sync).toHaveBeenCalledTimes(1);
  });
});

describe('registry body limits', () => {
  it('counts streamed bytes and cancels an oversized body', async () => {
    let cancelled = false;
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(MAX_REGISTRY_BYTES + 1));
      },
      cancel() {
        cancelled = true;
      },
    });
    vi.mocked(fetch).mockResolvedValueOnce(new Response(body, { status: 200 }));

    await expect(fetchRegistry(registryUrl(), true)).rejects.toThrow('Registry file is too large');
    expect(cancelled).toBe(true);
  });
});
