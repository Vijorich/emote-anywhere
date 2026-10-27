import { describe, expect, it, vi } from 'vitest';
import type { AppState, InstalledPlugin } from '../src/core/types';
import { shouldSyncStateChange } from '../src/entrypoints/chat';

vi.mock('wxt/browser', () => ({ browser: {} }));
vi.mock('wxt/utils/define-unlisted-script', () => ({ defineUnlistedScript: () => ({}) }));

const URL = 'https://example.com/chat';
const MATCH = 'https://example.com/*';
const OTHER_MATCH = 'https://other.test/*';
const context = { pluginKey: 'current', channelKey: 'chan' };

function plugin(key: string, matches: string[], enabled = true): InstalledPlugin {
  return {
    key,
    registryId: 'registry',
    enabled,
    addedAt: 1,
    updatedAt: 1,
    descriptor: {
      schemaVersion: 1,
      id: key,
      name: key,
      version: '1.0.0',
      matches,
      chat: {
        messages: ['.msg'],
        channel: { from: 'constant', value: 'chan' },
      },
    },
  };
}

function makeState(): AppState {
  return {
    version: 1,
    settings: {
      globalMode: false,
      emoteScale: 1,
      autoChannel: true,
      pickerEnabled: true,
      providers: { sevenTv: true, bttv: true, ffz: true },
    },
    registries: [{ id: 'registry', name: 'Registry', url: 'https://registry.test/' }],
    plugins: {
      current: plugin('current', [MATCH]),
      other: plugin('other', [OTHER_MATCH]),
      disabled: plugin('disabled', [MATCH], false),
    },
    bindings: {
      'current|chan': {
        key: 'current|chan',
        pluginKey: 'current',
        channelKey: 'chan',
        label: 'chan',
        sets: ['current-set'],
      },
      'other|chan': {
        key: 'other|chan',
        pluginKey: 'other',
        channelKey: 'chan',
        label: 'other',
        sets: ['other-set'],
      },
    },
    globalBinding: { sets: ['global-set'] },
    customSets: [
      {
        id: 'custom',
        name: 'Custom',
        enabled: true,
        emotes: [{ code: 'customEmote', url: 'https://cdn.test/custom.png' }],
      },
    ],
  };
}

function check(edit: (state: AppState) => void): boolean {
  const before = makeState();
  const after = structuredClone(before);
  edit(after);
  return shouldSyncStateChange({ oldValue: before, newValue: after }, URL, context);
}

describe('chat state synchronization filter', () => {
  it('ignores cloned state and registry-only freshness writes', () => {
    const before = makeState();
    const after = structuredClone(before);
    expect(shouldSyncStateChange({ oldValue: before, newValue: after }, URL, context)).toBe(
      false,
    );

    after.registries[0]!.lastCheckedAt = 123;
    after.registries[0]!.lastError = 'offline';
    expect(shouldSyncStateChange({ oldValue: before, newValue: after }, URL, context)).toBe(
      false,
    );
  });

  it('syncs for settings, global binding, and custom set changes', () => {
    expect(check((state) => void (state.settings.emoteScale = 2))).toBe(true);
    expect(check((state) => void (state.globalBinding.sets = ['new-set']))).toBe(true);
    expect(check((state) => void (state.customSets[0]!.enabled = false))).toBe(true);
  });

  it('syncs when an enabled plugin affecting the URL is added, changed, or removed', () => {
    expect(check((state) => void (state.plugins.current!.descriptor.priority = 20))).toBe(true);
    expect(check((state) => void (state.plugins.current!.descriptor.chat.messages = ['.new']))).toBe(
      true,
    );
    expect(check((state) => void (state.plugins.current!.enabled = false))).toBe(true);
    expect(check((state) => void delete state.plugins.current)).toBe(true);
    expect(check((state) => void (state.plugins.added = plugin('added', [MATCH])))).toBe(true);
  });

  it('detects match changes entering or leaving the current URL', () => {
    expect(check((state) => void (state.plugins.current!.descriptor.matches = [OTHER_MATCH]))).toBe(
      true,
    );
    expect(check((state) => void (state.plugins.other!.descriptor.matches = [MATCH]))).toBe(true);
  });

  it('ignores unrelated and disabled plugin changes', () => {
    expect(check((state) => void (state.plugins.other!.descriptor.version = '2.0.0'))).toBe(false);
    expect(check((state) => void (state.plugins.disabled!.descriptor.priority = 50))).toBe(false);
  });

  it('compares large custom sets without stringifying them', () => {
    const before = makeState();
    before.customSets[0]!.emotes = Array.from({ length: 2000 }, (_, index) => ({
      code: `emote${index}`,
      url: `https://cdn.test/${index}.png`,
    }));
    const after = structuredClone(before);
    const stringify = vi.spyOn(JSON, 'stringify');

    expect(shouldSyncStateChange({ oldValue: before, newValue: after }, URL, context)).toBe(false);
    const stringifiedSets = stringify.mock.calls.some(
      ([value]) => value === before.customSets || value === after.customSets,
    );
    expect(stringifiedSets).toBe(false);
  });

  it('syncs only for the current plugin and channel binding', () => {
    expect(check((state) => void (state.bindings['current|chan']!.sets = ['new-set']))).toBe(true);
    expect(check((state) => void delete state.bindings['current|chan'])).toBe(true);
    expect(check((state) => void (state.bindings['other|chan']!.sets = ['new-set']))).toBe(false);
  });
});
