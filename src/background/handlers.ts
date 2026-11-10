import { browser } from 'wxt/browser';
import { bindingKey, safeChannelKey } from '../core/channel';
import {
  IMAGE_CACHE_EPOCH_KEY,
  MAX_CUSTOM_SETS,
  MAX_EMOTE_SCALE,
  MAX_TOTAL_CUSTOM_EMOTES,
  MIN_EMOTE_SCALE,
  REGISTRATION_EPOCH_KEY,
} from '../core/config';
import { clearEmoteCache } from '../core/emotes/cache';
import { lookupSevenTvSet, resolveEmotes } from '../core/emotes/resolve';
import {
  providerHealthSnapshot,
  resetProviderHealth,
} from '../core/emotes/health';
import { getState, mutateState, updateSettings } from '../core/state';
import type {
  AppSettings,
  AppState,
  Binding,
  ChatEmote,
  ChatRegistration,
  CustomSet,
  PluginMatch,
  RpcRequest,
  RpcSender,
} from '../core/types';
import { parseCustomSet, parseSevenTvSetId } from '../core/validate';
import { forgetFrameContext, listFrameContexts, rememberFrameContext } from './contexts';
import {
  findPluginForUrl,
  injectIntoOpenTabs,
  resyncOpenTabs,
  syncContentScript,
  toPluginMatch,
} from './plugins';
import { addRegistry, refreshOneRegistry, refreshRegistries, removeRegistry } from './registry';
import {
  clearImageMemoryCache,
  fetchImageAsDataUrl,
  imageMemoryCacheSize,
} from './images';

const MAX_SETS = 50;

/** Resolved sets are identical for every frame of the same tab and survive for a few minutes. */
const REGISTRATION_CACHE_TTL_MS = 5 * 60 * 1000;
const MAX_REGISTRATION_CACHE = 8;
interface RegistrationPayload {
  emotes: ChatEmote[];
  sources: string[];
  errors: string[];
  revision: string;
}
interface RegistrationCacheEntry {
  at: number;
  ttlMs: number;
  resolved: RegistrationPayload;
}
const registrationCache = new Map<string, RegistrationCacheEntry>();
const imageHostPermissions = new Map<string, { allowed: boolean; at: number }>();

export function clearRegistrationCache(): void {
  registrationCache.clear();
}

/**
 * Covers every input of resolveEmotes. Custom sets are immutable apart from
 * add/remove/toggle, so id + size is enough to detect a change.
 */
export function registrationCacheKey(
  state: AppState,
  pluginKey: string,
  pluginUpdatedAt: number,
  binding: Binding | null,
  sevenTvId: string | undefined,
): string {
  const customSets = state.customSets
    .filter((set) => set.enabled)
    .map((set) => `${set.id}:${set.emotes.length}`)
    .join(',');
  return [
    pluginKey,
    pluginUpdatedAt,
    sevenTvId ?? '',
    binding?.sets.join(',') ?? '',
    state.globalBinding.sets.join(','),
    state.settings.autoChannel ? '1' : '0',
    state.settings.providers.sevenTv ? '1' : '0',
    state.settings.providers.bttv ? '1' : '0',
    state.settings.providers.ffz ? '1' : '0',
    state.settings.providers.twitch === true ? '1' : '0',
    state.settings.sevenTvProxyUrl ?? '',
    customSets,
  ].join('|');
}

function getCachedRegistration(key: string): RegistrationPayload | null {
  const entry = registrationCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.at >= entry.ttlMs) {
    registrationCache.delete(key);
    return null;
  }
  registrationCache.delete(key);
  registrationCache.set(key, entry);
  return entry.resolved;
}

function registrationRevision(cacheKey: string, emotes: ChatEmote[]): string {
  // Stable across service-worker restarts, but changes when provider data does.
  let hash = 2166136261;
  for (const emote of emotes) {
    const value = `${emote.code}\u0000${emote.url}\u0000${emote.flags}`;
    for (let index = 0; index < value.length; index += 1) {
      hash ^= value.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
  }
  return `${(hash >>> 0).toString(36)}:${cacheKey}`;
}

function storeRegistration(key: string, resolved: RegistrationPayload): void {
  registrationCache.delete(key);
  while (registrationCache.size >= MAX_REGISTRATION_CACHE) {
    const oldest = registrationCache.keys().next().value;
    if (oldest === undefined) break;
    registrationCache.delete(oldest);
  }
  registrationCache.set(key, {
    at: Date.now(),
    // Partial results are retried quickly, but still stop repeated slow
    // provider failures on every frame and reload.
    ttlMs: resolved.errors.length ? 60_000 : REGISTRATION_CACHE_TTL_MS,
    resolved,
  });
}

async function prepareSets(
  values: string[],
  allowEmpty = false,
  proxyUrl?: string,
): Promise<string[]> {
  if (!Array.isArray(values)) throw new Error('Expected a list of 7TV sets');
  if (values.length > MAX_SETS) throw new Error(`Add at most ${MAX_SETS} sets`);
  const sets = Array.from(new Set(values.map((value) => parseSevenTvSetId(value))));
  if (!sets.length && !allowEmpty) throw new Error('Add at least one 7TV set');
  await Promise.all(sets.map((id) => lookupSevenTvSet(id, { proxyUrl })));
  return sets;
}

function assertCustomSetCapacity(state: AppState, emotes: number): void {
  if (state.customSets.length >= MAX_CUSTOM_SETS) {
    throw new Error(`Add at most ${MAX_CUSTOM_SETS} custom sets`);
  }
  const totalEmotes = state.customSets.reduce(
    (total, existing) => total + existing.emotes.length,
    0,
  );
  if (totalEmotes + emotes > MAX_TOTAL_CUSTOM_EMOTES) {
    throw new Error(`Custom sets allow at most ${MAX_TOTAL_CUSTOM_EMOTES} emotes in total`);
  }
}

function customImageHosts(state: AppState): string[] {
  const hosts = new Set<string>();
  for (const set of state.customSets) {
    if (!set.enabled) continue;
    for (const emote of set.emotes) {
      if (!emote.url.startsWith('https://')) continue;
      try {
        hosts.add(new URL(emote.url).hostname);
      } catch {
        // Invalid custom URL is already rejected by the parser.
      }
    }
  }
  return Array.from(hosts);
}

async function allowedCustomImageHosts(state: AppState): Promise<Set<string>> {
  const allowed = new Set<string>();
  for (const host of customImageHosts(state)) {
    const cached = imageHostPermissions.get(host);
    if (cached && Date.now() - cached.at < 60_000) {
      if (cached.allowed) allowed.add(host);
      continue;
    }
    let granted = false;
    try {
      granted = await browser.permissions.contains({ origins: [`https://${host}/*`] });
    } catch {
      granted = false;
    }
    imageHostPermissions.set(host, { allowed: granted, at: Date.now() });
    if (granted) allowed.add(host);
  }
  return allowed;
}

async function registrationEpoch(): Promise<number> {
  try {
    const value = (await browser.storage.local.get(REGISTRATION_EPOCH_KEY))[REGISTRATION_EPOCH_KEY];
    return typeof value === 'number' && Number.isFinite(value) ? value : 0;
  } catch {
    return 0;
  }
}

async function bumpRegistrationEpoch(): Promise<void> {
  try {
    await browser.storage.local.set({ [REGISTRATION_EPOCH_KEY]: Date.now() });
  } catch {
    // The revision still changes if the storage write succeeds next time.
  }
}

async function broadcastImageCacheClear(): Promise<void> {
  try {
    await browser.storage.local.set({ [IMAGE_CACHE_EPOCH_KEY]: Date.now() });
  } catch {
    // Cache epoch is an optimisation; the in-memory clear still works.
  }
  try {
    const tabs = await browser.tabs.query({});
    await Promise.all(
      tabs.map(async (tab) => {
        if (tab.id === undefined) return;
        await browser.tabs
          .sendMessage(tab.id, { type: 'ea/image-cache-clear' })
          .catch(() => undefined);
      }),
    );
  } catch {
    // Tabs permission or restricted pages may be unavailable.
  }
}

export async function handleRpc(
  request: RpcRequest,
  sender: RpcSender | null = null,
): Promise<unknown> {
  switch (request.type) {
    case 'state/get':
      return getState();

    case 'registry/add':
      return addRegistry(request.url, request.name);

    case 'registry/remove':
      await removeRegistry(request.id);
      return true;

    case 'registry/refresh':
      return request.id ? refreshOneRegistry(request.id) : refreshRegistries(true);

    case 'plugin/enable': {
      const state = await getState();
      const plugin = state.plugins[request.key];
      if (!plugin) throw new Error('Plugin not found');
      let granted = false;
      try {
        granted = await browser.permissions.contains({ origins: plugin.descriptor.matches });
      } catch {
        granted = false;
      }
      if (!granted) {
        throw new Error(
          'Host permission is missing. Turn the plugin on again and allow access to its sites.',
        );
      }
      await mutateState((next) => {
        const target = next.plugins[request.key];
        if (target) target.enabled = true;
      });
      await syncContentScript();
      await injectIntoOpenTabs(plugin.descriptor.matches);
      return true;
    }

    case 'plugin/disable':
      await mutateState((next) => {
        const target = next.plugins[request.key];
        if (target) target.enabled = false;
      });
      await syncContentScript();
      return true;

    case 'plugin/remove':
      await mutateState((next) => {
        delete next.plugins[request.key];
        for (const [key, binding] of Object.entries(next.bindings)) {
          if (binding.pluginKey === request.key) delete next.bindings[key];
        }
      });
      await syncContentScript();
      return true;

    case 'plugin/forUrl': {
      const state = await getState();
      const plugin = findPluginForUrl(state, request.url);
      if (!plugin) return null;
      let granted = false;
      try {
        granted = await browser.permissions.contains({ origins: plugin.descriptor.matches });
      } catch {
        granted = false;
      }
      if (!granted) return null;
      return toPluginMatch(state, plugin) satisfies PluginMatch;
    }

    case 'chat/register': {
      const state = await getState();
      const plugin = state.plugins[request.pluginKey];
      if (!plugin || !plugin.enabled) throw new Error('Plugin is not active');
      const channelKey = safeChannelKey(request.channelKey);
      const key = bindingKey(plugin.key, channelKey);
      const binding = state.bindings[key] ?? null;
      const cacheKey = `${registrationCacheKey(
        state,
        plugin.key,
        plugin.updatedAt,
        binding,
        request.sevenTvId,
      )}|epoch:${await registrationEpoch()}`;
      let registration = getCachedRegistration(cacheKey);
      if (!registration) {
        const resolved = await resolveEmotes({
          binding,
          globalBinding: state.globalBinding,
          settings: state.settings,
          customSets: state.customSets,
          sevenTv: plugin.descriptor.chat.sevenTv,
          sevenTvId: request.sevenTvId,
        });
        const emotes = resolved.emotes.map(({ code, url, flags }) => ({ code, url, flags }));
        registration = {
          // Strip the provider: content scripts never use it and it is sizable
          // at 30k resolved entries.
          emotes,
          sources: resolved.sources,
          errors: resolved.errors,
          revision: registrationRevision(cacheKey, emotes),
        };
        storeRegistration(cacheKey, registration);
      }
      if (request.knownRevision && registration.revision === request.knownRevision) {
        return {
          ...registration,
          emotes: [],
          sources: [],
          errors: [],
          binding,
          unchanged: true,
        } satisfies ChatRegistration;
      }
      return { ...registration, binding } satisfies ChatRegistration;
    }

    case 'binding/set': {
      const state = await getState();
      if (!state.plugins[request.pluginKey]) throw new Error('Plugin not found');
      const channelKey = safeChannelKey(request.channelKey);
      const sets = await prepareSets(request.sets, false, state.settings.sevenTvProxyUrl);
      const key = bindingKey(request.pluginKey, channelKey);
      const binding: Binding = {
        key,
        pluginKey: request.pluginKey,
        channelKey,
        label: request.label.trim().slice(0, 200) || channelKey,
        sets,
      };
      await mutateState((next) => {
        next.bindings[key] = binding;
      });
      return binding;
    }

    case 'binding/remove':
      await mutateState((next) => {
        delete next.bindings[request.key];
      });
      return true;

    case 'globalBinding/set': {
      const state = await getState();
      const sets = await prepareSets(request.sets, true, state.settings.sevenTvProxyUrl);
      await mutateState((next) => {
        next.globalBinding = { sets };
      });
      return { sets };
    }

    case 'set/add': {
      const parsed = parseCustomSet({ name: request.name, emotes: request.emotes });
      const set: CustomSet = {
        id: `set_${crypto.randomUUID().slice(0, 8)}`,
        name: parsed.name,
        enabled: true,
        emotes: parsed.emotes,
      };
      await mutateState((next) => {
        assertCustomSetCapacity(next, parsed.emotes.length);
        next.customSets.push(set);
      });
      imageHostPermissions.clear();
      return set;
    }

    case 'set/remove':
      await mutateState((next) => {
        next.customSets = next.customSets.filter((set) => set.id !== request.id);
      });
      imageHostPermissions.clear();
      return true;

    case 'set/toggle':
      await mutateState((next) => {
        const set = next.customSets.find((item) => item.id === request.id);
        if (set) set.enabled = request.enabled;
      });
      imageHostPermissions.clear();
      return true;

    case 'settings/update': {
      const patch: Partial<AppSettings> = { ...request.patch };
      if (patch.emoteScale !== undefined) {
        patch.emoteScale = Math.min(MAX_EMOTE_SCALE, Math.max(MIN_EMOTE_SCALE, patch.emoteScale));
      }
      const state = await updateSettings(patch);
      return state.settings;
    }

    case 'sevenTv/lookupSet': {
      const state = await getState();
      return lookupSevenTvSet(request.input, { proxyUrl: state.settings.sevenTvProxyUrl });
    }

    case 'frame/context': {
      const tabId = sender?.tab?.id;
      if (tabId === undefined) return false;
      const frameId = sender?.frameId ?? 0;
      if (!request.context) {
        await forgetFrameContext(tabId, frameId);
        return true;
      }
      await rememberFrameContext(tabId, frameId, {
        pluginKey: request.context.pluginKey.slice(0, 200),
        channelKey: safeChannelKey(request.context.channelKey),
        ...(request.context.sevenTvId
          ? { sevenTvId: request.context.sevenTvId.slice(0, 100) }
          : {}),
        url: request.context.url.slice(0, 2048),
      });
      return true;
    }

    case 'frame/contexts':
      if (!Number.isInteger(request.tabId) || request.tabId < 0) {
        throw new Error('Invalid tab id');
      }
      return listFrameContexts(request.tabId);

    case 'image/fetch': {
      const state = await getState();
      return fetchImageAsDataUrl(request.url, {
        refresh: request.refresh === true,
        allowFallback: state.settings.imageProxyFallback !== false,
        allowedHosts: await allowedCustomImageHosts(state),
        proxyUrl: state.settings.sevenTvProxyUrl,
      });
    }

    case 'diagnostics/get': {
      const state = await getState();
      return {
        providers: await providerHealthSnapshot(),
        imageMemoryEntries: imageMemoryCacheSize(),
        settings: state.settings,
      };
    }

    case 'providers/retry':
      await resetProviderHealth();
      clearRegistrationCache();
      await bumpRegistrationEpoch();
      await resyncOpenTabs();
      return true;

    case 'cache/clear':
      clearRegistrationCache();
      clearImageMemoryCache();
      await clearEmoteCache();
      await resetProviderHealth();
      await bumpRegistrationEpoch();
      await broadcastImageCacheClear();
      await resyncOpenTabs();
      return true;

    default: {
      const never: never = request;
      throw new Error(`Unknown request: ${JSON.stringify(never)}`);
    }
  }
}
