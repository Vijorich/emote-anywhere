import { browser } from 'wxt/browser';
import { defineBackground } from 'wxt/utils/define-background';
import { registerRpcHandler } from '../core/rpc';
import { handleRpc } from '../background/handlers';
import { forgetTab } from '../background/contexts';
import { bootstrapRegistries, refreshRegistries } from '../background/registry';
import { resyncOpenTabs, syncContentScript } from '../background/plugins';

export default defineBackground(() => {
  registerRpcHandler(handleRpc);

  browser.tabs.onRemoved.addListener((tabId) => {
    void forgetTab(tabId);
  });
  browser.tabs.onUpdated.addListener((tabId, changeInfo) => {
    if (changeInfo.status === 'loading') void forgetTab(tabId);
  });

  browser.runtime.onInstalled.addListener((details) => {
    if (details.reason === 'install') {
      void browser.runtime.openOptionsPage().catch(() => undefined);
    }
    void refreshRegistries(true).catch((error) =>
      console.warn('[emote-anywhere] install sync failed', error),
    );
  });

  browser.runtime.onStartup.addListener(() => {
    void (async () => {
      await refreshRegistries(false);
    })().catch((error) => console.warn('[emote-anywhere] startup sync failed', error));
  });

  browser.permissions.onRemoved.addListener(() => {
    void (async () => {
      await syncContentScript();
      await resyncOpenTabs();
    })().catch(() => undefined);
  });

  void bootstrapRegistries().catch((error) =>
    console.warn('[emote-anywhere] bootstrap failed', error),
  );
});
