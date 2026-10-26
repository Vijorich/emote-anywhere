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
        │ selectors + snapshots                 │ Alt+E / FAB
┌───────▼──────────┐                  ┌─────────▼───────────┐
│ chat DOM         │                  │ shadow-DOM picker   │
└──────────────────┘                  └─────────────────────┘
```

### Background

- Single writer for `AppState` in `browser.storage.local`. UI never writes state
  directly; it sends RPC requests.
- Fetches registries and merges plugin descriptors. Enabled flags and bindings
  survive registry refreshes.
- Resolves emotes for a `(plugin, channel)` pair and caches normalized sets for one
  hour (global sets for six hours). Cache lives under a separate storage key, so
  cache writes do not re-render the options page.
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
5. Re-run on `storage.onChanged` (debounced) and on URL changes (1 s poll, because
   page `history` calls are not visible from the isolated world).

### Engine

- Watches `document.documentElement` with a `MutationObserver`
  (`childList` + `characterData`).
- Chat mode processes message elements. Global mode processes all text in `body`.
- Per message it stores a **source snapshot**: the text with rendered emotes replaced
  by their `data-ea-text`. If the reconstructed source is unchanged, it does nothing.
  If it changed (edit, virtualized recycle, React re-render), it restores emote spans
  to text and re-renders the message. This prevents duplicate emotes and avoids an
  observer feedback loop.
- Text nodes are replaced with a fragment: text before, one `<span class="ea-e">` per
  emote group, text after. Groups keep their exact source in `data-ea-text`.
- All styles are inline with `!important`; no page CSS injection, no CSP-sensitive
  `<style>` in the page.
- Zero-width (7TV flag `256`) emotes are absolutely positioned over the previous
  emote inside the same span when only whitespace separates them.

### Picker

- Shadow DOM host appended to `documentElement`; constructed stylesheet, so page CSS
  and most CSP rules do not affect it.
- Button bottom-right plus `Alt+E`.
- Search, arrow navigation, Enter inserts `code + " "` into the composer. Textareas
  use `setRangeText`; contenteditable uses `execCommand('insertText')` with a Range
  fallback. No image upload, ever.
- Composer selectors come from the plugin. The picker re-finds the composer on SPA
  navigation.

## Emote priority

1. Manual binding for this chat (ordered list of 7TV sets).
2. Auto: 7TV channel connected to the site (`chat.sevenTv`).
3. Enabled custom sets.
4. Global 7TV, BTTV, FFZ.

The first provider that defines a code wins. Global providers are fetched in
parallel; merging is ordered, so priority is deterministic.

## Plugin lifecycle

- A registry is a JSON file with `{ schemaVersion: 1, plugins: [...] }`.
- On install, startup and manual refresh, the background fetches registries. New
  plugins are stored disabled.
- Enabling asks for the union of the plugin's `matches` as optional host permissions.
  The UI must call `permissions.request` from a user gesture.
- The content script registration is rebuilt from all enabled + granted plugins.
  Disabling a plugin removes its matches from the registration; open pages stop
  because the content script re-reads state and tears down.
- Removing a registry removes its plugins and their bindings.

## Security model

- Registry and plugin JSON are parsed with explicit allow-lists: known fields, string
  arrays, valid match patterns, compiled regexes, size limits.
- No `eval`, no `Function`, no remote scripts, no `innerHTML` with plugin data.
- A plugin can read only the text inside selectors it declares; it cannot read
  extension storage or send network requests.
- Host permissions are optional and requested per plugin. Emote API calls use CORS
  from the background; no static host permissions are needed for 7TV/BTTV/FFZ.
- Custom emote image URLs must be `https:` or `data:image/`. A page's own CSP can
  still block them; the extension does not proxy images.
- Regex rules run on URLs, not message text, so ReDoS surface is small.

## Firefox notes

- Built with WXT; the background runs as an event page, not a service worker.
- `scripting.registerContentScripts` and optional host permissions are used the same
  way. `persistAcrossSessions` is retried without it if the browser rejects it.
- `permissions.request` must be triggered by a real click; the options/popup call it
  synchronously in the event handler.
