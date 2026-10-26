# Default registry

This folder is the default plugin registry. The extension fetches `index.json` and
shows every plugin in it. Nothing here is bundled into the extension.

## Add a plugin

1. Add one object to the `plugins` array in `index.json`.
2. Follow [PLUGIN_API.md](PLUGIN_API.md).
3. Test locally with `pnpm registry` and a local registry URL.
4. Bump `version` when you change selectors.
5. Open a pull request.

## Rules

- Narrow match patterns. `https://site.com/*` or `https://*.site.com/*`, never
  `*://*/*` for a single-site adapter.
- Prefer stable attributes (`data-*`, `aria-*`, ids, roles) over hashed CSS classes.
- List 1-3 fallback selectors per field; sites change.
- `channel` must identify the conversation so per-chat 7TV bindings do not leak
  between chats.
- No remote code, no `javascript:` URLs, no tracking image hosts.
- One plugin per site unless the site has genuinely different chat surfaces.

## Local server

```bash
pnpm registry
# http://localhost:8787/index.json
```
