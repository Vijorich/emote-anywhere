# Store screenshots

Generated from the standalone UI preview with mock data, so no personal chat
content is included. All images are 1280×800 PNG, the size required by the Chrome
Web Store.

| File | Screen |
| --- | --- |
| `01-overview.png` | Overview with providers, global binding and plugin state |
| `02-sources.png` | Provider globals, custom sets and registries |
| `03-bindings.png` | Global and per-chat 7TV bindings |
| `04-settings.png` | Behavior, emote size and cache maintenance |

Regenerate:

```bash
pnpm preview
# open http://localhost:5199/options.html#overview and the other hash routes
# capture at 1280×800, then crop the viewport to 1280×800
```

The mock extension API lives in `dev/ui/mock.ts`. Nothing in this folder is
bundled into the extension.
