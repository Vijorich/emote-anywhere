import { browser } from 'wxt/browser';
import { defineBackground } from 'wxt/utils/define-background';
import { registerRpcHandler } from '../core/rpc';
import { handleRpc } from '../background/handlers';
import { bootstrapRegistries, refreshRegistries } from '../background/registry';
import { syncContentScript } from '../background/plugins';

export default defineBackground(() => {
  registerRpcHandler(handleRpc);

  browser.runtime.onInstalled.addListener((details) => {
    void (async () => {
      await refreshRegistries(true);
      await syncContentScript();
      if (details.reason === 'install') {
        await browser.runtime.openOptionsPage().catch(() => undefined);
      }
    })().catch((error) => console.warn('[emote-anywhere] install sync failed', error));
  });

  browser.runtime.onStartup.addListener(() => {
    void (async () => {
      await refreshRegistries(false);
      await syncContentScript();
    })().catch((error) => console.warn('[emote-anywhere] startup sync failed', error));
  });

  browser.permissions.onRemoved.addListener(() => {
    void syncContentScript().catch(() => undefined);
  });

  void bootstrapRegistries()
    .then(() => syncContentScript())
    .catch((error) => console.warn('[emote-anywhere] bootstrap failed', error));
});
