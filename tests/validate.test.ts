import { describe, expect, it } from 'vitest';
import { DEFAULT_GLOBAL_SET_IDS, DEFAULT_SETTINGS } from '../src/core/defaults';
import { createDefaultState } from '../src/core/state';
import {
  normalizeCustomSet,
  normalizeSettings,
  normalizeState,
  parseCustomSet,
  parsePluginDescriptor,
  parseRegistryIndex,
  parseSevenTvSetId,
} from '../src/core/validate';

const validPlugin = {
  schemaVersion: 1,
  id: 'example',
  name: 'Example chat',
  version: '1.0.0',
  matches: ['https://example.com/*'],
  chat: {
    messages: ['.message'],
    channel: { from: 'urlParam', param: 'channel' },
  },
};

describe('plugin schema', () => {
  it('accepts a minimal plugin', () => {
    const plugin = parsePluginDescriptor(validPlugin);
    expect(plugin.id).toBe('example');
    expect(plugin.chat.messages).toEqual(['.message']);
  });

  it('rejects bad match patterns and ids', () => {
    expect(() => parsePluginDescriptor({ ...validPlugin, matches: ['example.com'] })).toThrow();
    expect(() => parsePluginDescriptor({ ...validPlugin, id: 'Bad Id' })).toThrow();
  });

  it('rejects invalid regex rules', () => {
    expect(() =>
      parsePluginDescriptor({
        ...validPlugin,
        chat: { ...validPlugin.chat, channel: { from: 'urlRegex', regex: '(' } },
      }),
    ).toThrow();
  });

  it('accepts a single plugin as a registry', () => {
    const registry = parseRegistryIndex(validPlugin);
    expect(registry.plugins).toHaveLength(1);
  });

  it('requires schema version 1 for registry arrays', () => {
    expect(() => parseRegistryIndex({ plugins: [validPlugin] })).toThrow(/schemaVersion/);
    expect(() => parseRegistryIndex({ schemaVersion: 2, plugins: [validPlugin] })).toThrow(
      /schemaVersion/,
    );
  });

  it('rejects duplicate plugin ids', () => {
    expect(() =>
      parseRegistryIndex({ schemaVersion: 1, plugins: [validPlugin, validPlugin] }),
    ).toThrow(/duplicate/);
  });
});

describe('custom sets', () => {
  it('accepts codes and https urls', () => {
    const set = parseCustomSet({
      name: 'Mine',
      emotes: [{ code: 'hello', url: 'https://cdn.example/hello.png' }],
    });
    expect(set.emotes[0]?.code).toBe('hello');
  });

  it('rejects whitespace codes and javascript urls', () => {
    expect(() =>
      parseCustomSet({ name: 'Bad', emotes: [{ code: 'a b', url: 'https://x.test/a.png' }] }),
    ).toThrow();
    expect(() =>
      parseCustomSet({ name: 'Bad', emotes: [{ code: 'a', url: 'javascript:alert(1)' }] }),
    ).toThrow();
  });

  it('sanitizes persisted custom sets instead of trusting storage', () => {
    const set = normalizeCustomSet({
      id: 'set',
      name: 'Mine',
      enabled: true,
      emotes: [
        { code: 'ok', url: 'https://cdn.example/ok.png' },
        { code: 'bad code', url: 'https://cdn.example/bad.png' },
        { code: 'script', url: 'javascript:alert(1)' },
        { code: 'file', url: 'file:///etc/passwd' },
        { code: 'ok', url: 'https://cdn.example/duplicate.png' },
      ],
    });

    expect(set?.emotes).toEqual([
      { code: 'ok', url: 'https://cdn.example/ok.png', flags: 0 },
    ]);
  });
});

describe('settings', () => {
  it('defaults emote size to 1.2x and clamps the range', () => {
    expect(DEFAULT_SETTINGS.emoteScale).toBe(1.2);
    expect(normalizeSettings(undefined, DEFAULT_SETTINGS).emoteScale).toBe(1.2);
    expect(normalizeSettings({ emoteScale: 0.1 }, DEFAULT_SETTINGS).emoteScale).toBe(0.5);
    expect(normalizeSettings({ emoteScale: 9 }, DEFAULT_SETTINGS).emoteScale).toBe(3);
  });
});

describe('global binding', () => {
  it('adds the default 7TV set to state saved before global bindings existed', () => {
    const defaults = createDefaultState();
    const legacy = {
      version: 1,
      settings: defaults.settings,
      registries: defaults.registries,
      plugins: {},
      bindings: {},
      customSets: [],
    };
    expect(normalizeState(legacy, defaults).globalBinding.sets).toEqual(DEFAULT_GLOBAL_SET_IDS);
  });

  it('keeps an intentionally empty global binding', () => {
    const defaults = createDefaultState();
    const state = normalizeState(
      { ...createDefaultState(), globalBinding: { sets: [] } },
      defaults,
    );
    expect(state.globalBinding.sets).toEqual([]);
  });

  it('drops malformed set ids', () => {
    const defaults = createDefaultState();
    const state = normalizeState(
      { ...createDefaultState(), globalBinding: { sets: ['bad id', 'abcdef', 'abcdef'] } },
      defaults,
    );
    expect(state.globalBinding.sets).toEqual(['abcdef']);
  });
});

describe('7tv set ids', () => {
  it('reads ids from urls', () => {
    expect(parseSevenTvSetId('https://7tv.app/emote-sets/643b0a1c2d3e4f5a6b7c8d9e')).toBe(
      '643b0a1c2d3e4f5a6b7c8d9e',
    );
  });

  it('rejects short input', () => {
    expect(() => parseSevenTvSetId('abc')).toThrow();
  });
});
