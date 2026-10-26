import { defineConfig } from 'wxt';

export default defineConfig({
  srcDir: 'src',
  manifestVersion: 3,
  manifest: ({ browser }) => ({
    name: 'Emote Anywhere',
    description:
      '7TV, BTTV and FFZ emotes in any chat. Site support is added by declarative plugins, not extension updates.',
    permissions: ['storage', 'scripting', 'activeTab'],
    // Background image proxy. BTTV's CDN does not send CORS headers; the other
    // two are listed so the proxy keeps working if their headers change.
    host_permissions: [
      'https://cdn.7tv.app/*',
      'https://cdn.betterttv.net/*',
      'https://cdn.frankerfacez.com/*',
    ],
    optional_host_permissions: ['*://*/*'],
    action: { default_title: 'Emote Anywhere' },
    ...(browser === 'firefox'
      ? {
          browser_specific_settings: {
            gecko: {
              id: 'emote-anywhere@local',
              strict_min_version: '128.0',
              data_collection_permissions: {
                required: ['none'],
              },
            },
          },
        }
      : {}),
  }),
});
