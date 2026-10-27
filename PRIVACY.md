# Privacy Policy

Emote Anywhere is a browser extension that renders 7TV, BTTV and FFZ emotes in web
chats. This policy describes the data the extension handles.

Effective date: 2026-10-27

## No collection, no telemetry

The extension has no backend, no analytics, no accounts and no telemetry. It does not
sell or share data. Chat text is processed inside the page and is never uploaded by
the extension.

## Data stored on your device

The extension uses the browser's local extension storage for:

- settings, enabled plugins and chat sets;
- plugin registry URLs you add;
- a cache of resolved emote sets and proxied images.

This data stays in your browser profile. Removing the extension deletes it.

## Network requests

The extension makes network requests to:

- `7tv.io` and `cdn.7tv.app` for 7TV sets and images;
- `api.betterttv.net` and `cdn.betterttv.net` for BTTV emotes;
- `api.frankerfacez.com` and `cdn.frankerfacez.com` for FFZ emotes;
- the plugin registry at `https://vijorich.github.io/emote-anywhere/index.json`;
- any additional registry or custom emote image URL you configure.

The default services above use HTTPS. A custom registry URL may use HTTP.

Like any web request, these expose your IP address, the requested URL and standard
HTTP headers to the host. The extension does not add identifiers to them.

## Permissions

- `storage`: settings, chat sets and cache.
- `scripting`: inject the content script only on sites whose plugin you enable.
- `activeTab`: read the current tab URL when you open the popup.
- optional host access for the plugin's origins: requested when you enable a plugin, so
  the extension can read messages and render emotes on that chat site.
- host access to the emote CDNs above: background image proxy for sites whose
  Content Security Policy blocks external images.

The extension does not read chat messages until you enable a plugin for that site.
Opening the popup reads the active tab URL through `activeTab`; host access is
requested per plugin.

## Third parties

Emote data and images are provided by 7TV, BetterTTV and FrankerFaceZ, or by a custom
image host you add, under their own terms and privacy policies. The extension does
not control those services.

## Contact

Questions or requests: open an issue at
<https://github.com/Vijorich/emote-anywhere/issues>.
