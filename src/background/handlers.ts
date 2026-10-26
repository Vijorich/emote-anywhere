import { browser } from 'wxt/browser';
import { bindingKey, safeChannelKey } from '../core/channel';
import { clearEmoteCache } from '../core/emotes/cache';
import { lookupSevenTvSet, resolveEmotes } from '../core/emotes/resolve';
import { getState, mutateState, updateSettings } from '../core/state';
import type {
  AppSettings,
  Binding,
  ChatRegistration,
  CustomSet,
  PluginMatch,
  RpcRequest,
} from '../core/types';
import { parseCustomSet, parseSevenTvSetId } from '../core/validate';
import { findPluginForUrl, injectIntoOpenTabs, syncContentScript, toPluginMatch } from './plugins';
import { addRegistry, refreshOneRegistry, refreshRegistries, removeRegistry } from './registry';
import { fetchImageAsDataUrl } from './images';

export async function handleRpc(request: RpcRequest, _sender: unknown): Promise<unknown> {
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
      return toPluginMatch(state, plugin) satisfies PluginMatch;
    }

    case 'chat/register': {
      const state = await getState();
      const plugin = state.plugins[request.pluginKey];
      if (!plugin || !plugin.enabled) throw new Error('Plugin is not active');
      const channelKey = safeChannelKey(request.channelKey);
      const key = bindingKey(plugin.key, channelKey);
      const binding = state.bindings[key] ?? null;
      const resolved = await resolveEmotes({
        binding,
        settings: state.settings,
        customSets: state.customSets,
        sevenTv: plugin.descriptor.chat.sevenTv,
        sevenTvId: request.sevenTvId,
      });
      const registration: ChatRegistration = {
        emotes: resolved.emotes,
        sources: resolved.sources,
        errors: resolved.errors,
        binding,
      };
      return registration;
    }

    case 'binding/set': {
      const state = await getState();
      if (!state.plugins[request.pluginKey]) throw new Error('Plugin not found');
      const channelKey = safeChannelKey(request.channelKey);
      const sets = Array.from(
        new Set(request.sets.map((value) => parseSevenTvSetId(value))),
      );
      if (!sets.length) throw new Error('Add at least one 7TV set');
      await Promise.all(sets.map((id) => lookupSevenTvSet(id)));
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

    case 'set/add': {
      const parsed = parseCustomSet({ name: request.name, emotes: request.emotes });
      const set: CustomSet = {
        id: `set_${crypto.randomUUID().slice(0, 8)}`,
        name: parsed.name,
        enabled: true,
        emotes: parsed.emotes,
      };
      await mutateState((next) => {
        next.customSets.push(set);
      });
      return set;
    }

    case 'set/remove':
      await mutateState((next) => {
        next.customSets = next.customSets.filter((set) => set.id !== request.id);
      });
      return true;

    case 'set/toggle':
      await mutateState((next) => {
        const set = next.customSets.find((item) => item.id === request.id);
        if (set) set.enabled = request.enabled;
      });
      return true;

    case 'settings/update': {
      const patch: Partial<AppSettings> = { ...request.patch };
      if (patch.emoteScale !== undefined) {
        patch.emoteScale = Math.min(2, Math.max(0.5, patch.emoteScale));
      }
      const state = await updateSettings(patch);
      return state.settings;
    }

    case 'sevenTv/lookupSet':
      return lookupSevenTvSet(request.input);

    case 'image/fetch':
      return fetchImageAsDataUrl(request.url);

    case 'cache/clear':
      await clearEmoteCache();
      return true;

    default: {
      const never: never = request;
      throw new Error(`Unknown request: ${JSON.stringify(never)}`);
    }
  }
}
