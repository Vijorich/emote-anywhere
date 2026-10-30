// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppState } from '../src/core/types';

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  addStorageListener: vi.fn(),
  containsPermission: vi.fn(async () => true),
  requestPermission: vi.fn(async () => true),
  getManifest: vi.fn(() => ({ version: '1.0.0' })),
}));

vi.mock('wxt/browser', () => ({
  browser: {
    runtime: { getManifest: mocks.getManifest },
    storage: { onChanged: { addListener: mocks.addStorageListener } },
    permissions: {
      contains: mocks.containsPermission,
      request: mocks.requestPermission,
    },
  },
}));
vi.mock('../src/core/rpc', () => ({ rpc: mocks.rpc }));

function makeState(): AppState {
  return {
    version: 1,
    settings: {
      globalMode: false,
      emoteScale: 1.2,
      autoChannel: true,
      pickerEnabled: true,
      providers: { sevenTv: true, bttv: false, ffz: true },
    },
    registries: [],
    plugins: {},
    bindings: {},
    globalBinding: { sets: [] },
    customSets: [
      { id: 'on', name: 'Enabled set', enabled: true, emotes: [] },
      { id: 'off', name: 'Disabled set', enabled: false, emotes: [] },
    ],
  };
}

let currentState: AppState;

function defaultRpc(type: string, payload: Record<string, unknown> = {}): unknown {
  if (type === 'state/get') return currentState;
  if (type === 'cache/clear') return true;
  if (type === 'globalBinding/set') {
    currentState.globalBinding = { sets: [...((payload.sets as string[]) ?? [])] };
    return currentState.globalBinding;
  }
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
  if (type === 'set/remove') {
    currentState.customSets = currentState.customSets.filter((set) => set.id !== payload.id);
    return true;
  }
  if (type === 'set/toggle') {
    const set = currentState.customSets.find((item) => item.id === payload.id);
    if (set) set.enabled = payload.enabled === true;
    return true;
  }
  if (type === 'set/add') {
    const set = {
      id: `new_${currentState.customSets.length + 1}`,
      name: payload.name as string,
      enabled: true,
      emotes: (payload.emotes as AppState['customSets'][number]['emotes']) ?? [],
    };
    currentState.customSets.push(set);
    return set;
  }
  if (type === 'set/restore') {
    const set = payload.set as AppState['customSets'][number];
    const index = Math.min(Number(payload.index), currentState.customSets.length);
    currentState.customSets.splice(index, 0, set);
    return set;
  }
  throw new Error(`Unexpected request: ${type}`);
}

async function waitFor<T extends Element>(selector: string): Promise<T> {
  await vi.waitFor(() => expect(document.querySelector(selector)).not.toBeNull());
  return document.querySelector<T>(selector) as T;
}

beforeEach(() => {
  vi.resetModules();
  mocks.rpc.mockReset();
  mocks.addStorageListener.mockClear();
  currentState = makeState();
  mocks.rpc.mockImplementation(async (type: string, payload?: Record<string, unknown>) =>
    defaultRpc(type, payload),
  );
  document.body.innerHTML = '<div id="app"></div>';
  window.history.replaceState({}, '', '#sources');
  window.scrollTo = vi.fn();
});

describe('options UI', () => {
  it('preserves an invalid custom-set draft, disclosure, and focus', async () => {
    window.history.replaceState({}, '', '#sources');
    await import('../src/entrypoints/options/main');
    const details = await waitFor<HTMLDetailsElement>('.disclosure');
    const name = details.querySelector<HTMLInputElement>('input') as HTMLInputElement;
    const json = details.querySelector<HTMLTextAreaElement>('textarea') as HTMLTextAreaElement;
    const form = details.querySelector<HTMLFormElement>('form') as HTMLFormElement;
    details.open = true;
    name.value = 'Draft set';
    json.value = '{';
    json.focus();

    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));

    expect(document.querySelector('.disclosure')).toBe(details);
    expect(details.open).toBe(true);
    expect(json.value).toBe('{');
    expect(name.value).toBe('Draft set');
    expect(document.activeElement).toBe(json);
    expect(document.querySelector('[data-notice]')?.className).toContain('error');
  });

  it('preserves a custom-set draft when the RPC fails', async () => {
    mocks.rpc.mockImplementation(async (type: string) => {
      if (type === 'set/add') throw new Error('Set rejected');
      return defaultRpc(type);
    });
    window.history.replaceState({}, '', '#sources');
    await import('../src/entrypoints/options/main');
    const details = await waitFor<HTMLDetailsElement>('.disclosure');
    const name = details.querySelector<HTMLInputElement>('input') as HTMLInputElement;
    const json = details.querySelector<HTMLTextAreaElement>('textarea') as HTMLTextAreaElement;
    const form = details.querySelector<HTMLFormElement>('form') as HTMLFormElement;
    details.open = true;
    name.value = 'Draft set';
    json.value = '[{"code":"hi","url":"https://img"}]';
    json.focus();

    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await vi.waitFor(() =>
      expect(document.querySelector('[data-notice]')?.textContent).toContain('Set rejected'),
    );

    expect(document.querySelector('textarea')).toBe(json);
    expect(json.value).toContain('"code":"hi"');
    expect(name.value).toBe('Draft set');
    expect(details.open).toBe(true);
    expect(document.activeElement).toBe(json);
  });

  it('renders only once for a successful refresh with a message', async () => {
    window.history.replaceState({}, '', '#sources');
    await import('../src/entrypoints/options/main');
    const details = await waitFor<HTMLDetailsElement>('.disclosure');
    const json = details.querySelector<HTMLTextAreaElement>('textarea') as HTMLTextAreaElement;
    const form = details.querySelector<HTMLFormElement>('form') as HTMLFormElement;
    details.open = true;
    details.querySelector<HTMLInputElement>('input')!.value = 'Draft set';
    json.value = '[]';
    const replaceChildren = vi.spyOn(document.querySelector<HTMLElement>('#app')!, 'replaceChildren');

    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await vi.waitFor(() =>
      expect(document.querySelector('[data-notice]')?.textContent).toBe('Set added'),
    );

    expect(replaceChildren).toHaveBeenCalledTimes(1);
    replaceChildren.mockRestore();
  });

  it('restores the plugin switch after an enable failure', async () => {
    currentState.registries = [
      { id: 'r', name: 'Registry', url: 'https://registry.test/index.json', builtin: true },
    ];
    currentState.plugins = {
      'r:chat': {
        key: 'r:chat',
        registryId: 'r',
        enabled: false,
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
    };
    mocks.rpc.mockImplementation(async (type: string) => {
      if (type === 'plugin/enable') throw new Error('Enable failed');
      return defaultRpc(type);
    });
    window.history.replaceState({}, '', '#sources');
    await import('../src/entrypoints/options/main');

    const input = await waitFor<HTMLInputElement>('input[aria-label="Enable Chat"]');
    input.click();

    await vi.waitFor(() =>
      expect(document.querySelector('.banner.error')?.textContent).toContain('Enable failed'),
    );
    const restored = document.querySelector<HTMLInputElement>('input[aria-label="Enable Chat"]')!;
    expect(restored.checked).toBe(false);
  });

  it('keeps the advanced add-registry form collapsed', async () => {
    window.history.replaceState({}, '', '#sources');
    await import('../src/entrypoints/options/main');
    await waitFor('.disclosure');

    const registry = [...document.querySelectorAll<HTMLDetailsElement>('details.disclosure')].find(
      (details) => details.querySelector('summary')?.textContent === 'Add registry',
    );
    expect(registry).not.toBeUndefined();
    expect(registry?.open).toBe(false);
    expect(registry?.querySelector('input[aria-label="Registry URL"]')).not.toBeNull();
  });

  it('removes a global set immediately and restores it with Undo', async () => {
    currentState.globalBinding.sets = ['01ABC', '02DEF'];
    mocks.rpc.mockImplementation(async (type: string, payload?: Record<string, unknown>) => {
      if (type === 'sevenTv/lookupSet') {
        return { id: '01ABC', name: 'Test set', emoteCount: 1, preview: [] };
      }
      return defaultRpc(type, payload);
    });
    window.history.replaceState({}, '', '#bindings');
    await import('../src/entrypoints/options/main');

    const remove = await waitFor<HTMLButtonElement>('[aria-label="Remove 7TV set 01ABC"]');
    const confirm = vi.spyOn(window, 'confirm');
    remove.click();
    await vi.waitFor(() =>
      expect(document.querySelector('[data-notice]')?.textContent).toContain('Set removed'),
    );
    expect(confirm).not.toHaveBeenCalled();
    expect(currentState.globalBinding.sets).toEqual(['02DEF']);

    const undo = await waitFor<HTMLButtonElement>('.notice-action');
    undo.click();
    await vi.waitFor(() =>
      expect(document.querySelector('[data-notice]')?.textContent).toContain('Set restored'),
    );
    expect(currentState.globalBinding.sets).toEqual(['01ABC', '02DEF']);
    confirm.mockRestore();
  });

  it('removes a custom set immediately and restores it with Undo', async () => {
    currentState.customSets = [
      {
        id: 'set1',
        name: 'Set one',
        enabled: false,
        emotes: [{ code: 'hi', url: 'https://img' }],
      },
    ];
    window.history.replaceState({}, '', '#sources');
    await import('../src/entrypoints/options/main');

    const remove = await waitFor<HTMLButtonElement>('.rows .row .btn.danger');
    const confirm = vi.spyOn(window, 'confirm');
    remove.click();
    await vi.waitFor(() => expect(currentState.customSets).toHaveLength(0));
    expect(confirm).not.toHaveBeenCalled();

    const undo = await waitFor<HTMLButtonElement>('.notice-action');
    undo.click();
    await vi.waitFor(() =>
      expect(document.querySelector('[data-notice]')?.textContent).toContain('Set restored'),
    );
    expect(currentState.customSets).toHaveLength(1);
    expect(currentState.customSets[0]).toMatchObject({
      name: 'Set one',
      enabled: false,
      emotes: [{ code: 'hi', url: 'https://img' }],
    });
    confirm.mockRestore();
  });

  it('keeps focus on a settings switch after the refresh render', async () => {
    window.history.replaceState({}, '', '#settings');
    mocks.rpc.mockImplementation(async (type: string) => {
      if (type === 'settings/update') {
        currentState.settings.globalMode = true;
        return currentState.settings;
      }
      return defaultRpc(type);
    });
    await import('../src/entrypoints/options/main');

    const input = await waitFor<HTMLInputElement>(
      'input[data-focus-key="setting-globalMode"]',
    );
    input.focus();
    input.click();

    await vi.waitFor(() => {
      const next = document.querySelector<HTMLInputElement>(
        'input[data-focus-key="setting-globalMode"]',
      );
      expect(next?.checked).toBe(true);
      expect(document.activeElement).toBe(next);
    });
  });

  it('shows an initial loading shell, load error, and working Retry', async () => {
    let attempts = 0;
    mocks.rpc.mockImplementation(async (type: string) => {
      if (type === 'state/get') {
        attempts++;
        if (attempts === 1) throw new Error('State unavailable');
      }
      return defaultRpc(type);
    });
    await import('../src/entrypoints/options/main');

    const retry = await waitFor<HTMLButtonElement>('.view .btn.primary');
    expect(retry.textContent).toBe('Retry');
    expect(document.querySelector('.app')).not.toBeNull();
    expect(document.querySelector('[data-notice]')?.textContent).toBe('State unavailable');
    expect(document.body.textContent).not.toContain('Loading settings…');

    retry.click();
    await waitFor('.disclosure');
    expect(attempts).toBe(2);
    expect(document.querySelector('[data-notice]')).toBeNull();
  });

  it('shows one read-only preview and labels complementary landmarks', async () => {
    window.history.replaceState({}, '', '#bindings');
    await import('../src/entrypoints/options/main');
    await vi.waitFor(() => expect(document.querySelector('.view h1')?.textContent).toBe('Sets'));

    const sections = [...document.querySelectorAll('.bindings-main .section-head h2')].map(
      (heading) => heading.textContent,
    );
    expect(sections).toEqual(['Global sets', 'Chat sets']);
    expect(document.querySelector('.bindings-side')?.textContent).toContain('Preview');
    expect(document.body.textContent).not.toContain('Emote priority');
    expect(document.body.textContent).not.toContain('First 12');
    expect(document.querySelectorAll('main')).toHaveLength(1);
    const labels = [...document.querySelectorAll('aside')].map((aside) =>
      aside.getAttribute('aria-label'),
    );
    expect(labels).toEqual(['Options sidebar', 'Set details']);
    expect(new Set(labels).size).toBe(labels.length);
  });

  it('links bound sets and opens full plugin details', async () => {
    currentState.globalBinding.sets = ['01ABC'];
    currentState.registries = [
      { id: 'r', name: 'Registry', url: 'https://registry.test/index.json' },
    ];
    currentState.plugins = {
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
          description: 'A long plugin description with the full selector details.',
          authors: ['Tester'],
          homepage: 'https://example.test/plugin',
          matches: [
            'https://chat.example/*',
            'https://*.chat.example/*',
            'https://alt.example/*',
            'https://four.example/*',
            'https://five.example/*',
          ],
          chat: {
            messages: ['.message'],
            channel: { from: 'constant', value: 'chat' },
          },
        },
      },
    };
    mocks.rpc.mockImplementation(async (type: string) => {
      if (type === 'sevenTv/lookupSet') {
        return { id: '01ABC', name: 'Test set', emoteCount: 3, preview: [] };
      }
      return defaultRpc(type);
    });
    window.history.replaceState({}, '', '#bindings');
    await import('../src/entrypoints/options/main');

    const setLink = await vi.waitFor(() => {
      const link = document.querySelector<HTMLAnchorElement>('.set-row-link');
      expect(link).not.toBeNull();
      return link as HTMLAnchorElement;
    });
    expect(setLink.href).toBe('https://7tv.app/emote-sets/01ABC');

    window.location.hash = '#sources';
    const button = await waitFor<HTMLButtonElement>('.plugin-details');
    expect(button.getAttribute('aria-label')).toBe('Details for Chat');
    const row = button.closest('.row');
    expect(row?.querySelector('.row-copy')?.textContent).not.toContain(
      'A long plugin description',
    );
    expect(row?.querySelector('.row-copy')?.textContent).toContain('5 sites');
    expect(row?.querySelector('.row-chevron')).not.toBeNull();

    const dialog = row?.querySelector('dialog') as HTMLDialogElement;
    expect(dialog.textContent).toContain('A long plugin description with the full selector details.');
    expect(dialog.textContent).toContain('https://five.example/*');
    expect(dialog.querySelector('a[href="https://example.test/plugin"]')).not.toBeNull();
    expect(dialog.querySelector('.plugin-dialog-actions .switch input')).not.toBeNull();
    expect(dialog.querySelector('.plugin-dialog-actions .btn.danger')?.textContent).toBe('Remove');

    Object.defineProperty(HTMLDialogElement.prototype, 'showModal', {
      configurable: true,
      value(this: HTMLDialogElement) {
        this.setAttribute('open', '');
      },
    });
    button.click();
    expect(dialog.hasAttribute('open')).toBe(true);
  });

  it('focuses the new heading after hash navigation', async () => {
    await import('../src/entrypoints/options/main');
    await waitFor('.disclosure');
    const link = document.querySelector<HTMLAnchorElement>('#nav-help')!;
    link.focus();

    window.location.hash = '#help';
    await vi.waitFor(() => expect(document.querySelector('.view h1')?.textContent).toBe('Help'));

    const heading = document.querySelector<HTMLElement>('.view h1')!;
    expect(heading.getAttribute('tabindex')).toBe('-1');
    expect(document.activeElement).toBe(heading);
  });

  it('skips to the heading and reports mobile menu state', async () => {
    await import('../src/entrypoints/options/main');
    await waitFor('.disclosure');

    const skip = document.querySelector<HTMLButtonElement>('.skip-link')!;
    expect(skip).not.toBeNull();
    skip.click();
    expect(document.activeElement).toBe(document.querySelector('.view h1'));
    expect(document.querySelector('.view h1')?.getAttribute('tabindex')).toBe('-1');

    const menu = document.querySelector<HTMLButtonElement>('.menu-button')!;
    const dialog = document.querySelector<HTMLDialogElement>('#nav-dialog')!;
    expect(menu.getAttribute('aria-controls')).toBe('nav-dialog');
    expect(menu.getAttribute('aria-expanded')).toBe('false');

    Object.defineProperty(HTMLDialogElement.prototype, 'showModal', {
      configurable: true,
      value(this: HTMLDialogElement) {
        this.setAttribute('open', '');
      },
    });
    menu.click();
    expect(menu.getAttribute('aria-expanded')).toBe('true');

    dialog.dispatchEvent(new Event('close'));
    expect(menu.getAttribute('aria-expanded')).toBe('false');
  });
});
