# Emote Anywhere

7TV, BTTV and FFZ emotes in any web chat. Site support is not built into the
extension: each chat is described by a declarative JSON plugin, so selectors can be
fixed without shipping a new extension version.

## Status

Early development. Chrome/Edge and Firefox MV3. The engine, plugin registry, option
page, popup and emote picker are implemented; the VK adapter is the first plugin.

## How it works

Three independent layers:

- **Engine** (`src/engine`) — finds messages, tokenizes text, renders `<img>` emotes,
  survives re-renders and virtualized lists, groups zero-width emotes.
- **Plugin** (`registry/`) — data only: URL patterns, CSS selectors, how to derive a
  channel key, where the composer is. No JavaScript, no network, no extension APIs.
- **Providers** (`src/core/emotes`) — 7TV, BTTV and FFZ clients plus custom
  `code → URL` sets.

Emote size is a setting (slider in settings and popup). The default is **1.2×**
(1.8em at the 1.5em base); the range is 0.5–2.0×.

The background worker owns all state and emote resolution. Content scripts ask it for
the plugin matching the current URL and for the resolved emote set. There is no
remote code execution: a registry is JSON, not a script.

## Development

```bash
pnpm install
pnpm dev          # Chrome, loads .output/chrome-mv3-dev
pnpm dev:firefox
pnpm test
pnpm typecheck
pnpm build
```

The local default registry is served by:

```bash
pnpm registry     # http://localhost:8787/index.json
```

`.env` points the development build at that URL. `.env.production` points at
`https://raw.githubusercontent.com/Vijorich/emote-anywhere/main/registry/index.json`;
change it to your fork before publishing.

### Try it in Chrome

1. `pnpm dev`
2. `chrome://extensions` → Developer mode → Load unpacked → `.output/chrome-mv3-dev`
3. Open the extension settings. The local registry is fetched on first run.
4. Enable the VK plugin and allow access to `vk.com` / `vk.ru`.
5. Reload the VK tab, open a chat, and check the console for
   `[emote-anywhere]` warnings.

## Adding a chat

1. Copy the `vk` entry from `registry/index.json` or start from the schema in
   [`registry/PLUGIN_API.md`](registry/PLUGIN_API.md).
2. Set `id`, `matches`, `chat.messages`, `chat.text`, `chat.channel` and `composer`.
3. Add the plugin to `registry/index.json`.
4. Reload the registry in the extension settings and enable the plugin.
5. Fix selectors when the site changes; bump `version` so clients pick it up.

## Permissions

- `storage` — settings, plugins, bindings, cache.
- `scripting` — register the content script only for enabled plugin hosts.
- `activeTab` — read the current tab URL from the popup.
- `host_permissions` for `cdn.7tv.app`, `cdn.betterttv.net`,
  `cdn.frankerfacez.com` — background image proxy. BTTV's CDN has no CORS headers.
- `optional_host_permissions: *://*/*` — requested per plugin when you enable it.
  The extension has no access to chat sites until you turn a plugin on.

## Privacy

Emote lookups go directly to 7TV/BTTV/FFZ. The extension sends no telemetry and has
no backend. Chat text never leaves the page.

## Layout

```
src/
  core/          types, storage, validation, URL matching, emote providers
  engine/        tokenizer, renderer, MutationObserver pipeline
  picker/        shadow-DOM emote picker and text insertion
  background/    state owner, registry sync, content-script registration
  entrypoints/   background, content script, options, popup
registry/        default JSON registry and plugin authoring docs
tests/           engine, tokenizer, schema and URL matching tests
```

## Known limits

- Tokens are matched inside one text node. A code split across two elements is not
  matched.
- Zero-width emotes attach to the previous emote only when whitespace separates them.
- A site with a strict `img-src` CSP can block emote images. VK is handled with
  `proxyImages` (background fetch → `data:` URL); other strict sites need the same
  flag in their plugin.
- Firefox MV3 host permission prompts are controlled by the browser; the options
  page requests each plugin's origins explicitly.

## VK specifics

The VK plugin (`registry/index.json`, id `vk`) targets the current Convo UI:

- root: `#reforged-root`
- message row: `.ConvoHistory__messageWrapper`
- composer: `.ComposerInput__input` (contenteditable span)
- channel key: `?sel=` or `/im/convo/<id>`
- `proxyImages: true` because VK's `img-src` blocks `cdn.7tv.app` but allows
  `data:`.

The plugin deliberately reads the whole message row and excludes the author header,
time/status, attachments, reactions and buttons. This avoids depending on the exact
internal class of the text bubble.

When VK changes the UI, update `registry/index.json` and bump `version`; users get
the fix on the next registry refresh without an extension update.
