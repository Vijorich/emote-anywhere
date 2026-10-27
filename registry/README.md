# Default registry

This folder is the default plugin registry. The extension fetches `index.json` and
shows every plugin in it. Nothing here is bundled into the extension.

The public copy is deployed by GitHub Actions whenever this folder changes:

```
https://vijorich.github.io/emote-anywhere/index.json
```

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
- `channel` must identify the conversation so per-chat 7TV sets do not leak
  between chats.
- No remote code, no `javascript:` URLs, no tracking image hosts.
- One plugin per site unless the site has genuinely different chat surfaces.
- Registry changes are live after the `Registry` workflow finishes. Bump a plugin
  `version` so clients refresh it.

## Local server

```bash
pnpm registry
# http://localhost:8787/index.json
```
