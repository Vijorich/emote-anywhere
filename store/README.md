# Store screenshots

Generated from the standalone UI preview with mock data, so no personal chat
content is included. All images are 1280×800 PNG, a size accepted by the Chrome Web
Store. The Sources screenshot includes a demo custom set named "Stream faces"; it is
mock data, not a shipped set.

| File | Screen |
| --- | --- |
| `01-sources.png` | Providers, custom sets and registries |
| `02-bindings.png` | Sets: global and chat sets |
| `03-settings.png` | Chat options, emote size and cache |
| `04-help.png` | Links and common problems |

Regenerate:

```bash
pnpm preview
# open http://localhost:5199/options.html?theme=dark#sources
# #bindings, #settings, #help for the other screens
# capture at 1280×800
```

The mock extension API lives in `dev/ui/mock.ts`. Nothing in this folder is
bundled into the extension.
