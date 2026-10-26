# Architecture

## Why declarative plugins

Chrome MV3 forbids remotely hosted code that the browser executes. A plugin system
that loads JavaScript from a URL cannot be published on the Chrome Web Store and
would need full page access anyway. Declarative JSON is data: it is allowed, it can
be updated without an extension release, and a bad plugin can at worst break its own
selectors.

A plugin describes **where** a chat is and **what** to read. It cannot run code.

## Layers

```
┌────────────────────────────────────────────────────────────┐
│ background service worker                                  │
│  state (one storage key), registry sync, permissions,      │
│  emote resolution + cache, content-script registration     │
└───────────────▲───────────────────────────┬────────────────┘
                │ RPC                       │ resolved emotes
┌───────────────┴───────────────────────────▼────────────────┐
│ content script (per frame)                                  │
│  plugin match → channel key → engine + picker               │
└────────────────────────────────────────────────────────────┘
        │ selectors + snapshots                 │ picker button
┌───────▼──────────┐                  ┌─────────▼───────────┐
│ chat DOM         │                  │ shadow-DOM picker   │
└──────────────────┘                  └─────────────────────┘
```

### Background

- Single writer for `AppState` in `browser.storage.local`. UI never writes state
  directly; it sends RPC requests.
- Fetches registries and reconciles plugin descriptors. Enabled flags and bindings
  survive updates to plugins that remain upstream; removed plugins and their bindings
  are deleted after an authoritative fresh fetch. A refresh that returns zero plugins
  is rejected instead of silently deleting every installed plugin.
- Resolves emotes for a `(plugin, channel)` pair and caches normalized sets for one
  hour (global sets for six hours). Cache lives under a separate storage key, so
  cache writes do not re-render the options page. Cache entries have a 4 MiB byte
  budget plus a 200-entry cap; quota failures are logged and fall back to the
  in-memory cache. State has a 5 MiB guard and custom sets have count/total-emote
  limits.
- Remembers content-script contexts per tab/frame in `storage.session` plus a memory
  cache, so the popup can bind chats that live inside an iframe and survives a
  service-worker restart. Entries expire after ten minutes and are dropped when a
  tab closes or navigates.
- Registers **one** dynamic content script (`ea-core`) whose `matches` is the union
  of enabled plugins' match patterns. Chrome/Firefox then inject it only on allowed
  sites. No `<all_urls>` host permission in the manifest.
- Injects the same built script into already-open tabs when a plugin is enabled.
  A `window.__emoteAnywhereLoaded` guard makes double injection harmless.

### Content script

1. Ask background for the best enabled plugin matching `location.href`.
2. Resolve `chat.channel` locally (URL/param/regex/DOM) with a short retry for
   SPA-rendered chats. Same for `chat.sevenTv.id`.
3. Ask background for the merged emote set.
4. Start `ChatEngine`; start `EmotePicker` if the descriptor has a composer.
5. Re-run on relevant `storage.onChanged` changes (debounced) and on URL changes
   (1 s poll, because page `history` calls are not visible from the isolated world).
   Registry-only freshness updates and unrelated bindings do not restart the engine.

### Engine

- Watches `document.documentElement` with a `MutationObserver`
  (`childList` + `characterData`).
- Chat mode processes message elements. Global mode processes all text in `body`.
- Per message it stores a **source snapshot**: renderable text with rendered emotes
  replaced by their `data-ea-text`. Snapshots use the same text roots and exclusions
  as rendering, so reaction, author, timestamp and attachment edits do not rerender
  the message. If the reconstructed source is unchanged, it does nothing. If it
  changed (edit, virtualized recycle, React re-render), it restores emote spans to
  text and re-renders the message. This prevents duplicate emotes and avoids an
  observer feedback loop.
- `skip` matches the message element or any descendant. This lets plugins skip a
  wrapper when the site puts a deleted/system modifier on an inner row.
- Stopping the engine restores its own spans to text, so disabling a plugin or
  removing a registry does not leave stale emotes behind.
- Text nodes are replaced with a fragment: text before, one `<span class="ea-e">` per
  emote group, text after. Groups keep their exact source in `data-ea-text`.
- All styles are inline with `!important`; no page CSS injection, no CSP-sensitive
  `<style>` in the page.
- Zero-width (7TV flag `256`) emotes are absolutely positioned over the previous
  emote inside the same span when only whitespace separates them.

### Picker

- Shadow DOM host appended to `documentElement`; constructed stylesheet, so page CSS
  and most CSP rules do not affect it.
- Button bottom-right in the chat. There is no global keyboard shortcut.
- Search, grid-aware arrow navigation and Enter insert `code + " "` into the
  composer. The picker preserves and restores the composer selection before focusing
  its own UI. Textareas use `setRangeText`; contenteditable uses
  `execCommand('insertText')` with a Range fallback. No image upload, ever.
- Composer selectors come from the plugin. The picker re-finds a missing composer on
  SPA navigation and leaves a connected composer undisturbed.

## Emote priority

1. Manual binding for this chat (ordered list of 7TV sets).
2. Global binding sets (7TV sets that load in every chat).
3. Auto: 7TV channel connected to the site (`chat.sevenTv`), when no per-chat
   binding exists.
4. Enabled custom sets.
5. Global 7TV, BTTV, FFZ.

The first provider that defines a code wins. Global providers are fetched in
parallel; merging is ordered, so priority is deterministic.

The default state includes the `emote everywhere default set`
(`01M5VFKKAQEH8WEF0N0PNRK2YP`) in `globalBinding`. `normalizeState` adds that
default when an older state has no `globalBinding` field, so existing installs
receive it on upgrade. An explicitly empty list stays empty.

## Settings and popup

- `src/entrypoints/options` is a hash-routed app shell: Overview, Sources,
  Bindings, Settings and Help. One view per area; no long page of every setting.
  The manifest opens it in a full tab.
- `src/entrypoints/popup` is the per-chat control surface: plugin state, the
  binding for the open channel, global set summary and emote size.
- `src/ui` holds the shared theme tokens, components, set lookup cache and
  product mark. Both pages use it, in light and dark (`prefers-color-scheme`).
- `dev/ui` is a Vite-only preview harness with a mocked extension API. It renders
  the real entrypoints for design review; it is not part of the extension build.

## Plugin lifecycle

- A registry is a JSON file with `{ schemaVersion: 1, plugins: [...] }`.
- On install, startup and manual refresh, the background fetches registries. New
  plugins are stored disabled.
- Enabling asks for the union of the plugin's `matches` as optional host permissions.
  The UI must call `permissions.request` from a user gesture.
- The content script registration is rebuilt from all enabled + granted plugins.
  Disabling a plugin removes its matches from the registration; open pages stop
  because the content script re-reads state and tears down.
- Removing a registry removes its plugins and their bindings. A successful upstream
  refresh also removes plugins that no longer exist and cascades their bindings.

## Security model

- Registry and plugin JSON are parsed with explicit allow-lists: known fields, string
  arrays, valid match patterns, compiled regexes, size limits.
- No `eval`, no `Function`, no remote scripts, no `innerHTML` with plugin data.
- A plugin can read only the values inside selectors it declares; it cannot read
  extension storage or call extension APIs. Provider requests are mediated by the
  background. Auto-channel IDs are validated against platform formats before any
  7TV lookup, rejecting values outside those formats.
- Host permissions are optional and requested per plugin. Emote API calls use CORS
  from the background; no static host permissions are needed for 7TV/BTTV/FFZ.
  Disabling a plugin unregisters its script but does not revoke an origin grant;
  revoking it in the browser triggers a resync and teardown.
- Custom emote image URLs must be `https:` or `data:image/`. A page's own CSP can
  still block them; the extension does not proxy images.
- Regex rules run on URLs, not message text, so ReDoS surface is small.

## Firefox notes

- Built with WXT; the background runs as an event page, not a service worker.
- `scripting.registerContentScripts` and optional host permissions are used the same
  way. `persistAcrossSessions` is retried without it if the browser rejects it.
- `permissions.request` must be triggered by a real click; the options/popup call it
  synchronously in the event handler.
