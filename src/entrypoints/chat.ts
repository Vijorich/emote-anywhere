import { browser } from 'wxt/browser';
import { defineUnlistedScript } from 'wxt/utils/define-unlisted-script';
import { resolveChannel, safeChannelKey } from '../core/channel';
import { rpc } from '../core/rpc';
import type {
  ChatRegistration,
  ContentContext,
  PluginMatch,
} from '../core/types';
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
      scheduleSync(3000);
      return;
    }
    if (current !== generation || !match) return;

    const channelValue = await resolveWithRetry(match.descriptor.chat.channel, current);
    if (current !== generation) return;
    const sevenTvId = match.descriptor.chat.sevenTv
      ? await resolveWithRetry(match.descriptor.chat.sevenTv.id, current)
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
      scheduleSync(5000);
      return;
    }
    if (current !== generation) return;

    context = { pluginKey: match.pluginKey, channelKey, sevenTvId, url: location.href };
    engine = new ChatEngine({
      descriptor: match.descriptor,
      emotes: registration.emotes,
      settings: match.settings,
    });
    engine.start();

    picker = new EmotePicker(match.descriptor, registration.emotes, match.settings);
    picker.start();

    if (registration.errors.length) {
      console.warn('[emote-anywhere] some emote sources failed', registration.errors);
    }
  };

  browser.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes['state']) scheduleSync(150);
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
