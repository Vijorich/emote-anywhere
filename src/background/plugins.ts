import { browser } from 'wxt/browser';
import { CONTENT_SCRIPT_FILE } from '../core/config';
import { getState } from '../core/state';
import type { AppState, InstalledPlugin, PluginMatch } from '../core/types';
import { matchSpecificity, urlMatchesAny } from '../core/url-match';

const REGISTRATION_ID = 'ea-core';
let syncQueue: Promise<void> = Promise.resolve();

export function findPluginForUrl(state: AppState, url: string): InstalledPlugin | null {
  const candidates = Object.values(state.plugins).filter(
    (plugin) => plugin.enabled && urlMatchesAny(url, plugin.descriptor.matches),
  );
  candidates.sort((left, right) => {
    const leftScore = matchSpecificity(left.descriptor.matches, left.descriptor.priority, url);
    const rightScore = matchSpecificity(right.descriptor.matches, right.descriptor.priority, url);
    return rightScore - leftScore;
  });
  return candidates[0] ?? null;
}

export function toPluginMatch(state: AppState, plugin: InstalledPlugin): PluginMatch {
  return {
    pluginKey: plugin.key,
    descriptor: plugin.descriptor,
    settings: state.settings,
  };
}

export function syncContentScript(): Promise<void> {
  const run = syncQueue.then(doSync, doSync);
  syncQueue = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

async function doSync(): Promise<void> {
  const state = await getState();
  const matches = new Set<string>();

  for (const plugin of Object.values(state.plugins)) {
    if (!plugin.enabled) continue;
    let granted = false;
    try {
      granted = await browser.permissions.contains({ origins: plugin.descriptor.matches });
    } catch {
      granted = false;
    }
    if (!granted) continue;
    for (const pattern of plugin.descriptor.matches) matches.add(pattern);
  }

  const registered = await browser.scripting.getRegisteredContentScripts().catch(() => []);
  const existing = registered.filter((script) => script.id === REGISTRATION_ID);
  const existingMatches = new Set(existing[0]?.matches ?? []);
  if (
    existing.length <= 1 &&
    existingMatches.size === matches.size &&
    Array.from(matches).every((pattern) => existingMatches.has(pattern))
  ) {
    return;
  }

  if (existing.length) {
    await browser.scripting
      .unregisterContentScripts({ ids: [REGISTRATION_ID] })
      .catch(() => undefined);
  }
  if (!matches.size) return;

  const script = {
    id: REGISTRATION_ID,
    matches: Array.from(matches),
    js: [CONTENT_SCRIPT_FILE],
    runAt: 'document_idle' as const,
    allFrames: true,
    persistAcrossSessions: true,
  };

  try {
    await browser.scripting.registerContentScripts([script]);
  } catch (error) {
    const { persistAcrossSessions: _ignored, ...withoutPersistence } = script;
    try {
      await browser.scripting.registerContentScripts([withoutPersistence]);
    } catch {
      throw error;
    }
  }
}

export async function injectIntoOpenTabs(matches: string[]): Promise<void> {
  if (!matches.length) return;
  let tabs: Array<{ id?: number }> = [];
  try {
    tabs = await browser.tabs.query({ url: matches });
  } catch {
    return;
  }
  for (const tab of tabs) {
    if (tab.id === undefined) continue;
    try {
      await browser.scripting.executeScript({
        target: { tabId: tab.id, allFrames: true },
        files: [CONTENT_SCRIPT_FILE],
      });
    } catch {
      // Tabs with restricted pages are expected to fail.
    }
  }
}

/** Ask every open tab to re-check its plugin after a permission change. */
export async function resyncOpenTabs(): Promise<void> {
  let tabs: Array<{ id?: number }> = [];
  try {
    tabs = await browser.tabs.query({});
  } catch {
    return;
  }
  await Promise.all(
    tabs.map(async (tab) => {
      if (tab.id === undefined) return;
      await browser.tabs.sendMessage(tab.id, { type: 'ea/resync' }).catch(() => undefined);
    }),
  );
}
