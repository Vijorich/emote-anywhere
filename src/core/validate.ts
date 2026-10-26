import { isValidMatchPattern } from './url-match';
import type {
  AppSettings,
  AppState,
  Binding,
  ChannelRule,
  ChatSpec,
  ComposerSpec,
  CustomEmote,
  CustomSet,
  InstalledPlugin,
  PluginDescriptor,
  RegistryIndex,
  RegistryRef,
  SevenTvSpec,
} from './types';
import { safeChannelKey } from './channel';

const PLUGIN_ID_RE = /^[a-z0-9][a-z0-9._-]{0,63}$/;
const VERSION_RE = /^[0-9A-Za-z.+_-]{1,32}$/;
const MAX_PLUGINS = 200;
const MAX_SELECTORS = 50;

class SchemaError extends Error {
  constructor(path: string, message: string) {
    super(`${path}: ${message}`);
    this.name = 'SchemaError';
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function record(value: unknown, path: string): Record<string, unknown> {
  if (!isRecord(value)) throw new SchemaError(path, 'expected an object');
  return value;
}

function text(value: unknown, path: string, max = 500): string {
  if (typeof value !== 'string') throw new SchemaError(path, 'expected a string');
  const trimmed = value.trim();
  if (!trimmed) throw new SchemaError(path, 'must not be empty');
  if (trimmed.length > max) throw new SchemaError(path, `longer than ${max} characters`);
  return trimmed;
}

function optionalText(value: unknown, path: string, max = 500): string | undefined {
  if (value === undefined || value === null) return undefined;
  return text(value, path, max);
}

function stringList(
  value: unknown,
  path: string,
  min: number,
  max: number,
  itemMax = 500,
): string[] {
  if (!Array.isArray(value)) throw new SchemaError(path, 'expected an array of strings');
  if (value.length < min) throw new SchemaError(path, `needs at least ${min} item(s)`);
  if (value.length > max) throw new SchemaError(path, `allows at most ${max} items`);
  return value.map((item, index) => text(item, `${path}[${index}]`, itemMax));
}

function optionalSelectorList(value: unknown, path: string): string[] | undefined {
  if (value === undefined || value === null) return undefined;
  return stringList(value, path, 0, MAX_SELECTORS);
}

function parseChannelRule(value: unknown, path: string): ChannelRule {
  const raw = record(value, path);
  const from = raw['from'];
  switch (from) {
    case 'urlParam':
      return { from, param: text(raw['param'], `${path}.param`, 100) };
    case 'urlRegex': {
      const regex = text(raw['regex'], `${path}.regex`, 500);
      try {
        new RegExp(regex);
      } catch {
        throw new SchemaError(`${path}.regex`, 'invalid regular expression');
      }
      const group = raw['group'];
      if (group !== undefined && (!Number.isInteger(group) || (group as number) < 0)) {
        throw new SchemaError(`${path}.group`, 'expected a non-negative integer');
      }
      return {
        from,
        regex,
        ...(group === undefined ? {} : { group: group as number }),
      };
    }
    case 'dom':
      return {
        from,
        selector: text(raw['selector'], `${path}.selector`, 500),
        attribute: text(raw['attribute'], `${path}.attribute`, 100),
      };
    case 'constant':
      return { from, value: text(raw['value'], `${path}.value`, 200) };
    default:
      throw new SchemaError(`${path}.from`, 'expected urlParam, urlRegex, dom or constant');
  }
}

function parseChannelRules(value: unknown, path: string): ChannelRule | ChannelRule[] {
  if (Array.isArray(value)) {
    if (value.length < 1 || value.length > 5) {
      throw new SchemaError(path, 'expected 1 to 5 rules');
    }
    return value.map((item, index) => parseChannelRule(item, `${path}[${index}]`));
  }
  return parseChannelRule(value, path);
}

function parseSevenTv(value: unknown, path: string): SevenTvSpec | undefined {
  if (value === undefined || value === null) return undefined;
  const raw = record(value, path);
  const platform = raw['platform'];
  if (platform !== 'twitch' && platform !== 'youtube' && platform !== 'kick') {
    throw new SchemaError(`${path}.platform`, 'expected twitch, youtube or kick');
  }
  return {
    platform,
    id: parseChannelRules(raw['id'], `${path}.id`),
  };
}

function parseChat(value: unknown, path: string): ChatSpec {
  const raw = record(value, path);
  const chat: ChatSpec = {
    messages: stringList(raw['messages'], `${path}.messages`, 1, 20),
    channel: parseChannelRules(raw['channel'], `${path}.channel`),
  };
  const roots = optionalSelectorList(raw['roots'], `${path}.roots`);
  if (roots) chat.roots = roots;
  const textSelectors = optionalSelectorList(raw['text'], `${path}.text`);
  if (textSelectors) chat.text = textSelectors;
  const exclude = optionalSelectorList(raw['exclude'], `${path}.exclude`);
  if (exclude) chat.exclude = exclude;
  const skip = optionalSelectorList(raw['skip'], `${path}.skip`);
  if (skip) chat.skip = skip;
  const messageIdAttr = optionalText(raw['messageIdAttr'], `${path}.messageIdAttr`, 100);
  if (messageIdAttr) chat.messageIdAttr = messageIdAttr;
  const sevenTv = parseSevenTv(raw['sevenTv'], `${path}.sevenTv`);
  if (sevenTv) chat.sevenTv = sevenTv;
  return chat;
}

function parseComposer(value: unknown, path: string): ComposerSpec | undefined {
  if (value === undefined || value === null) return undefined;
  const raw = record(value, path);
  const kind = raw['kind'];
  if (kind !== undefined && kind !== 'auto' && kind !== 'contenteditable' && kind !== 'textarea') {
    throw new SchemaError(`${path}.kind`, 'expected auto, contenteditable or textarea');
  }
  return {
    selectors: stringList(raw['selectors'], `${path}.selectors`, 1, 10),
    ...(kind ? { kind } : {}),
  };
}

export function parsePluginDescriptor(value: unknown, path = 'plugin'): PluginDescriptor {
  const raw = record(value, path);
  if (raw['schemaVersion'] !== 1) {
    throw new SchemaError(`${path}.schemaVersion`, 'expected 1');
  }
  const id = text(raw['id'], `${path}.id`, 64);
  if (!PLUGIN_ID_RE.test(id)) {
    throw new SchemaError(
      `${path}.id`,
      'use lowercase letters, digits, dot, underscore or dash, starting with a letter or digit',
    );
  }
  const version = text(raw['version'], `${path}.version`, 32);
  if (!VERSION_RE.test(version)) {
    throw new SchemaError(`${path}.version`, 'unsupported version string');
  }
  const matches = stringList(raw['matches'], `${path}.matches`, 1, 20, 2048);
  matches.forEach((pattern, index) => {
    if (!isValidMatchPattern(pattern)) {
      throw new SchemaError(`${path}.matches[${index}]`, `invalid match pattern "${pattern}"`);
    }
  });
  const priority = raw['priority'];
  if (
    priority !== undefined &&
    (!Number.isInteger(priority) || (priority as number) < -1000 || (priority as number) > 1000)
  ) {
    throw new SchemaError(`${path}.priority`, 'expected an integer between -1000 and 1000');
  }

  const descriptor: PluginDescriptor = {
    schemaVersion: 1,
    id,
    name: text(raw['name'], `${path}.name`, 80),
    version,
    matches,
    chat: parseChat(raw['chat'], `${path}.chat`),
  };
  const description = optionalText(raw['description'], `${path}.description`, 1000);
  if (description) descriptor.description = description;
  const homepage = optionalText(raw['homepage'], `${path}.homepage`, 500);
  if (homepage) {
    if (!/^https?:\/\//i.test(homepage)) {
      throw new SchemaError(`${path}.homepage`, 'expected an http(s) URL');
    }
    descriptor.homepage = homepage;
  }
  if (Array.isArray(raw['authors'])) {
    descriptor.authors = stringList(raw['authors'], `${path}.authors`, 0, 20, 100);
  }
  if (priority !== undefined) descriptor.priority = priority as number;
  if (raw['proxyImages'] === true) descriptor.proxyImages = true;
  const composer = parseComposer(raw['composer'], `${path}.composer`);
  if (composer) descriptor.composer = composer;
  return descriptor;
}

export function parseRegistryIndex(value: unknown): RegistryIndex {
  const raw = record(value, 'registry');
  const pluginsRaw = raw['plugins'];
  if (!Array.isArray(pluginsRaw)) {
    if (raw['schemaVersion'] === 1 && typeof raw['id'] === 'string') {
      const single = parsePluginDescriptor(raw);
      return { schemaVersion: 1, plugins: [single] };
    }
    throw new SchemaError('registry.plugins', 'expected an array');
  }
  if (pluginsRaw.length > MAX_PLUGINS) {
    throw new SchemaError('registry.plugins', `allows at most ${MAX_PLUGINS} plugins`);
  }
  const seen = new Set<string>();
  const plugins = pluginsRaw.map((item, index) => {
    const plugin = parsePluginDescriptor(item, `registry.plugins[${index}]`);
    if (seen.has(plugin.id)) {
      throw new SchemaError(`registry.plugins[${index}].id`, `duplicate plugin id "${plugin.id}"`);
    }
    seen.add(plugin.id);
    return plugin;
  });
  const name = optionalText(raw['name'], 'registry.name', 80);
  return { schemaVersion: 1, ...(name ? { name } : {}), plugins };
}

const EMOTE_CODE_RE = /^\S{1,64}$/;

export function parseCustomSet(value: unknown): { name: string; emotes: CustomEmote[] } {
  const raw = record(value, 'set');
  const name = text(raw['name'], 'set.name', 80);
  const emotesRaw = raw['emotes'];
  if (!Array.isArray(emotesRaw) || emotesRaw.length === 0) {
    throw new SchemaError('set.emotes', 'expected a non-empty array');
  }
  if (emotesRaw.length > 5000) throw new SchemaError('set.emotes', 'allows at most 5000 emotes');
  const seen = new Set<string>();
  const emotes: CustomEmote[] = emotesRaw.map((item, index) => {
    const emote = record(item, `set.emotes[${index}]`);
    const code = text(emote['code'], `set.emotes[${index}].code`, 64);
    if (!EMOTE_CODE_RE.test(code)) {
      throw new SchemaError(`set.emotes[${index}].code`, 'must not contain whitespace');
    }
    if (seen.has(code)) {
      throw new SchemaError(`set.emotes[${index}].code`, `duplicate code "${code}"`);
    }
    seen.add(code);
    const url = text(emote['url'], `set.emotes[${index}].url`, 2048);
    if (!/^https:\/\//i.test(url) && !/^data:image\//i.test(url)) {
      throw new SchemaError(`set.emotes[${index}].url`, 'expected an https or data:image URL');
    }
    const flags = emote['flags'];
    if (flags !== undefined && (!Number.isInteger(flags) || (flags as number) < 0)) {
      throw new SchemaError(`set.emotes[${index}].flags`, 'expected a non-negative integer');
    }
    return { code, url, ...(flags === undefined ? {} : { flags: flags as number }) };
  });
  return { name, emotes };
}

export function parseSevenTvSetId(input: string): string {
  const value = input.trim();
  const urlMatch = /emote-sets\/([A-Za-z0-9]{6,64})/.exec(value);
  const id = urlMatch?.[1] ?? value;
  if (!/^[A-Za-z0-9]{6,64}$/.test(id)) {
    throw new Error('Expected a 7TV set id or https://7tv.app/emote-sets/<id> URL');
  }
  return id;
}

export function normalizeInstalledPlugin(value: unknown): InstalledPlugin | null {
  if (!isRecord(value)) return null;
  try {
    const descriptor = parsePluginDescriptor(value['descriptor'], 'plugin.descriptor');
    const key = text(value['key'], 'plugin.key', 200);
    const registryId = text(value['registryId'], 'plugin.registryId', 100);
    return {
      key,
      registryId,
      descriptor,
      enabled: value['enabled'] === true,
      addedAt: typeof value['addedAt'] === 'number' ? value['addedAt'] : Date.now(),
      updatedAt: typeof value['updatedAt'] === 'number' ? value['updatedAt'] : Date.now(),
    };
  } catch {
    return null;
  }
}

export function normalizeRegistry(value: unknown): RegistryRef | null {
  if (!isRecord(value)) return null;
  const id = value['id'];
  const name = value['name'];
  const url = value['url'];
  if (
    typeof id !== 'string' ||
    typeof name !== 'string' ||
    typeof url !== 'string' ||
    !/^https?:\/\//i.test(url)
  ) {
    return null;
  }
  return {
    id,
    name,
    url,
    builtin: value['builtin'] === true,
    ...(typeof value['lastCheckedAt'] === 'number' ? { lastCheckedAt: value['lastCheckedAt'] } : {}),
    ...(typeof value['lastError'] === 'string' ? { lastError: value['lastError'] } : {}),
    ...(typeof value['pluginCount'] === 'number' ? { pluginCount: value['pluginCount'] } : {}),
  };
}

export function normalizeBinding(value: unknown): Binding | null {
  if (!isRecord(value)) return null;
  const key = value['key'];
  const pluginKeyValue = value['pluginKey'];
  const channelKey = value['channelKey'];
  const label = value['label'];
  const sets = value['sets'];
  if (
    typeof key !== 'string' ||
    typeof pluginKeyValue !== 'string' ||
    typeof channelKey !== 'string' ||
    typeof label !== 'string' ||
    !Array.isArray(sets)
  ) {
    return null;
  }
  const cleanSets = sets.filter((item): item is string => typeof item === 'string' && item.length > 0);
  return {
    key,
    pluginKey: pluginKeyValue,
    channelKey: safeChannelKey(channelKey),
    label,
    sets: cleanSets,
  };
}

export function normalizeCustomSet(value: unknown): CustomSet | null {
  if (!isRecord(value)) return null;
  const id = value['id'];
  const name = value['name'];
  const emotes = value['emotes'];
  if (typeof id !== 'string' || typeof name !== 'string' || !Array.isArray(emotes)) return null;
  const cleanEmotes: CustomEmote[] = [];
  for (const item of emotes) {
    if (!isRecord(item)) continue;
    const code = item['code'];
    const url = item['url'];
    if (typeof code !== 'string' || typeof url !== 'string') continue;
    cleanEmotes.push({
      code,
      url,
      flags: typeof item['flags'] === 'number' ? item['flags'] : 0,
    });
  }
  return {
    id,
    name,
    enabled: value['enabled'] !== false,
    emotes: cleanEmotes,
  };
}

export function normalizeSettings(value: unknown, defaults: AppSettings): AppSettings {
  if (!isRecord(value)) return defaults;
  const providers = isRecord(value['providers']) ? value['providers'] : {};
  const scale = value['emoteScale'];
  return {
    globalMode: value['globalMode'] === true,
    emoteScale:
      typeof scale === 'number' && Number.isFinite(scale) ? Math.min(2, Math.max(0.5, scale)) : defaults.emoteScale,
    autoChannel: value['autoChannel'] !== false,
    pickerEnabled: value['pickerEnabled'] !== false,
    providers: {
      sevenTv: providers['sevenTv'] !== false,
      bttv: providers['bttv'] !== false,
      ffz: providers['ffz'] !== false,
    },
  };
}

export function normalizeState(
  value: unknown,
  defaults: AppState,
): AppState {
  if (!isRecord(value) || value['version'] !== 1) return defaults;
  const registriesRaw = Array.isArray(value['registries']) ? value['registries'] : [];
  const registries = registriesRaw
    .map(normalizeRegistry)
    .filter((item): item is RegistryRef => item !== null);
  const pluginsRaw = isRecord(value['plugins']) ? value['plugins'] : {};
  const plugins: Record<string, InstalledPlugin> = {};
  for (const item of Object.values(pluginsRaw)) {
    const plugin = normalizeInstalledPlugin(item);
    if (plugin) plugins[plugin.key] = plugin;
  }
  const bindingsRaw = isRecord(value['bindings']) ? value['bindings'] : {};
  const bindings: Record<string, Binding> = {};
  for (const item of Object.values(bindingsRaw)) {
    const binding = normalizeBinding(item);
    if (binding) bindings[binding.key] = binding;
  }
  const setsRaw = Array.isArray(value['customSets']) ? value['customSets'] : [];
  const customSets = setsRaw
    .map(normalizeCustomSet)
    .filter((item): item is CustomSet => item !== null);
  const hasRegistries = Array.isArray(value['registries']);
  return {
    version: 1,
    settings: normalizeSettings(value['settings'], defaults.settings),
    registries: hasRegistries ? registries : defaults.registries,
    plugins,
    bindings,
    customSets,
  };
}
