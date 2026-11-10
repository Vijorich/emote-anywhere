# Privacy Policy

Emote Anywhere is a browser extension that renders 7TV, BTTV, FFZ and Twitch
emotes in web chats. This policy describes the data the extension handles.

Effective date: 2026-11-10

## No collection, no telemetry

The extension has no project backend, no analytics, no accounts and no telemetry.
It does not sell or share data. Chat text is processed inside the page and is never
uploaded by the extension.

## Data stored on your device

The extension uses browser storage for:

- settings, enabled plugins, chat sets and registry URLs;
- a cache of resolved emote sets in extension storage;
- proxied image bytes and the last resolved registration in IndexedDB owned by the
  site whose content script requested them;
- standard HTTP cache entries managed by the browser.

This data stays in your browser profile. Removing the extension deletes extension
storage; page-origin IndexedDB may remain until that site's storage is cleared.

## Network requests

The extension makes network requests to:

- `7tv.io` and `cdn.7tv.app` for 7TV sets and images;
- `api.betterttv.net` and `cdn.betterttv.net` for BTTV emotes;
- `api.frankerfacez.com` and `cdn.frankerfacez.com` for FFZ emotes;
- `static-cdn.jtvnw.net` for Twitch emotes;
- `emotes.crippled.dev` and `emotes.adamcy.pl`, used only as fallbacks for global
  7TV and Twitch emote metadata;
- `vijorich.github.io/emote-anywhere` for the plugin registry and emote snapshots;
- `wsrv.nl` when **Image fallback** is enabled and an emote CDN cannot be reached
  directly; only the image URL is sent;
- any additional registry, 7TV proxy or custom emote image URL you configure.

The default services above use HTTPS. A custom registry URL may use HTTP. If you
configure a 7TV proxy, requests to that proxy replace direct 7TV requests.

Like any web request, these expose your IP address, the requested URL and standard
HTTP headers to the host. The extension does not add identifiers to them.

## Permissions

- `storage`: settings, chat sets and the provider cache.
- `scripting`: inject the content script only on sites whose plugin you enable.
- `activeTab`: read the current tab URL when you open the popup.
- optional host access for the plugin's origins: requested when you enable a plugin, so
  the extension can read messages and render emotes on that chat site.
- optional host access for custom emote image hosts: requested when you add a set that
  uses a host outside the built-in CDNs.
- host access to the emote CDNs and `wsrv.nl`: background image proxy for sites whose
  Content Security Policy blocks external images.

The extension does not read chat messages until you enable a plugin for that site.
Opening the popup reads the active tab URL through `activeTab`; host access is
requested per plugin.

## Third parties

Emote data and images are provided by 7TV, BetterTTV, FrankerFaceZ and Twitch, or by
a custom image host you add, under their own terms and privacy policies. Fallback
metadata mirrors and `wsrv.nl` are independent third parties. The extension does not
control those services.
