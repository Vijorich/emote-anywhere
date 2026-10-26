import { browser } from 'wxt/browser';
import { defineUnlistedScript } from 'wxt/utils/define-unlisted-script';
import { bindingKey, resolveChannel, safeChannelKey } from '../core/channel';
import { rpc } from '../core/rpc';
import type {
  AppState,
  ChatRegistration,
  ContentContext,
  PluginMatch,
} from '../core/types';
import { urlMatchesAny } from '../core/url-match';
import type { ChannelRule } from '../core/types';
import { ChatEngine } from '../engine/engine';
import { EmotePicker } from '../picker/picker';

declare global {
  interface Window {
    __emoteAnywhereLoaded?: boolean;
  }
}

export default defineUnlistedScript(() => {
  if (window.__emoteAnywhereLoaded) return;
  window.__emoteAnywhereLoaded = true;
  start();
});

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function valueChanged(before: unknown, after: unknown): boolean {
  return JSON.stringify(before) !== JSON.stringify(after);
}

export function shouldSyncStateChange(
  change: { oldValue?: unknown; newValue?: unknown },
  url: string,
  context: Pick<ContentContext, 'pluginKey' | 'channelKey'> | null,
): boolean {
  const before = change.oldValue as AppState | undefined;
  const after = change.newValue as AppState | undefined;
  if (!before || !after) return true;
  if (
    valueChanged(before.settings, after.settings) ||
    valueChanged(before.globalBinding, after.globalBinding) ||
    valueChanged(before.customSets, after.customSets)
  ) {
    return true;
  }

  const pluginKeys = new Set([...Object.keys(before.plugins), ...Object.keys(after.plugins)]);
  for (const key of pluginKeys) {
    const oldPlugin = before.plugins[key];
    const newPlugin = after.plugins[key];
    if (!valueChanged(oldPlugin, newPlugin)) continue;
    if (
      (oldPlugin?.enabled && urlMatchesAny(url, oldPlugin.descriptor.matches)) ||
      (newPlugin?.enabled && urlMatchesAny(url, newPlugin.descriptor.matches))
    ) {
      return true;
    }
  }

  if (context) {
    const key = bindingKey(context.pluginKey, context.channelKey);
    return valueChanged(before.bindings[key], after.bindings[key]);
  }
  return false;
}

function start(): void {
  let generation = 0;
  let engine: ChatEngine | null = null;
  let picker: EmotePicker | null = null;
  let context: ContentContext | null = null;
  let syncTimer: number | null = null;
  let lastUrl = location.href;

  const teardown = (): void => {
    engine?.stop();
    engine = null;
    picker?.destroy();
    picker = null;
    context = null;
  };

  const scheduleSync = (delay = 200): void => {
    if (syncTimer !== null) window.clearTimeout(syncTimer);
    syncTimer = window.setTimeout(() => {
      syncTimer = null;
      void sync();
    }, delay);
  };

  const publishContext = (next: ContentContext | null): void => {
    void rpc('frame/context', { context: next }).catch(() => undefined);
  };

  const resolveWithRetry = async (
    rules: ChannelRule | ChannelRule[],
    current: number,
    timeoutMs = 4000,
  ): Promise<string | undefined> => {
    const started = Date.now();
    while (current === generation) {
      const value = resolveChannel(rules, document, location.href);
      if (value) return value;
      if (Date.now() - started >= timeoutMs) return undefined;
      await sleep(250);
    }
    return undefined;
  };

  const sync = async (): Promise<void> => {
    const current = ++generation;
    teardown();

    let match: PluginMatch | null;
    try {
      match = await rpc<PluginMatch | null>('plugin/forUrl', { url: location.href });
    } catch (error) {
      console.warn('[emote-anywhere] plugin lookup failed', error);
      publishContext(null);
      scheduleSync(3000);
      return;
    }
    if (current !== generation) return;
    if (!match) {
      publishContext(null);
      return;
    }

    const channelValue = await resolveWithRetry(match.descriptor.chat.channel, current);
    if (current !== generation) return;

    // The 7TV channel lookup must not hold up the first render. Try briefly,
    // then register without it and resync when the ID appears.
    const sevenTvRules =
      match.settings.autoChannel && match.descriptor.chat.sevenTv
        ? match.descriptor.chat.sevenTv.id
        : null;
    const sevenTvPromise = sevenTvRules
      ? resolveWithRetry(sevenTvRules, current)
      : null;
    const sevenTvId = sevenTvPromise
      ? await Promise.race([sevenTvPromise, sleep(250).then(() => undefined)])
      : undefined;
    if (current !== generation) return;

    const channelKey = safeChannelKey(channelValue);
    let registration: ChatRegistration;
    try {
      registration = await rpc<ChatRegistration>('chat/register', {
        pluginKey: match.pluginKey,
        channelKey,
        sevenTvId,
      });
    } catch (error) {
      console.warn('[emote-anywhere] emote registration failed', error);
      publishContext(null);
      scheduleSync(5000);
      return;
    }
    if (current !== generation) return;

    if (sevenTvPromise && !sevenTvId && !registration.binding) {
      void sevenTvPromise.then((id) => {
        if (id && current === generation) scheduleSync(0);
      });
    }

    context = { pluginKey: match.pluginKey, channelKey, sevenTvId, url: location.href };
    engine = new ChatEngine({
      descriptor: match.descriptor,
      emotes: registration.emotes,
      settings: match.settings,
    });
    engine.start();

    picker = new EmotePicker(match.descriptor, registration.emotes, match.settings);
    picker.start();
    publishContext(context);

    if (registration.errors.length) {
      console.warn('[emote-anywhere] some emote sources failed', registration.errors);
    }
  };

  browser.storage.onChanged.addListener((changes, area) => {
    const change = changes['state'];
    if (area === 'local' && change && shouldSyncStateChange(change, location.href, context)) {
      scheduleSync(150);
    }
  });

  window.addEventListener('pagehide', () => publishContext(null));
  window.addEventListener('pageshow', () => {
    if (context) publishContext(context);
  });

  browser.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    const type = (message as { type?: string } | null)?.type;
    if (type === 'ea/context') {
      sendResponse(context);
      return undefined;
    }
    if (type === 'ea/resync') {
      scheduleSync(0);
      sendResponse(true);
      return undefined;
    }
    return undefined;
  });

  window.setInterval(() => {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      scheduleSync(50);
    }
  }, 1000);

  void sync();
}
