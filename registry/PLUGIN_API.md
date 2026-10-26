# Plugin format

A plugin is one JSON object. It tells the engine where a chat lives and how to read
the chat's identity. It cannot run code.

```json
{
  "schemaVersion": 1,
  "id": "example",
  "name": "Example Chat",
  "version": "1.0.0",
  "description": "Optional, shown in settings",
  "authors": ["you"],
  "homepage": "https://example.com",
  "priority": 10,
  "matches": ["https://chat.example.com/*"],
  "chat": {
    "roots": [".chat"],
    "messages": [".message"],
    "text": [".message-text"],
    "exclude": ["a", "code", "pre", ".emoji"],
    "skip": [".deleted"],
    "channel": [
      { "from": "urlParam", "param": "channel" },
      { "from": "constant", "value": "default" }
    ],
    "sevenTv": {
      "platform": "twitch",
      "id": { "from": "urlRegex", "regex": "/channel/([^/?#]+)", "group": 1 }
    }
  },
  "composer": {
    "selectors": ["textarea", "[contenteditable=true]"],
    "kind": "auto"
  }
}
```

## Top-level fields

| Field | Required | Notes |
| --- | --- | --- |
| `schemaVersion` | yes | Must be `1`. |
| `id` | yes | Lowercase letters, digits, `.`, `_`, `-`; starts with a letter or digit. Stable forever. |
| `name` | yes | Shown in settings. |
| `version` | yes | Bump it when selectors change; the registry refresh updates enabled plugins. |
| `description` | no | Short text in settings. |
| `authors` | no | Array of names. |
| `homepage` | no | `http(s)` URL. |
| `priority` | no | Integer. Higher wins when several plugins match the same URL. Specific patterns also add score. |
| `proxyImages` | no | Fetch emote images through the background worker. Required on sites whose `img-src` CSP blocks emote CDNs (VK). |
| `matches` | yes | 1-20 Chrome/Firefox match patterns. |
| `chat` | yes | Where messages are. |
| `composer` | no | Enables the emote picker. |

## `matches`

Standard WebExtension match patterns, restricted to `http` and `https`:

- `https://vk.com/*`
- `https://*.vk.com/*` — the domain and all subdomains.
- `*://*/*` — any http/https page. Do not use this unless you truly mean it.

The path must start with `/`. Ports are not part of match patterns; a pattern for a
host covers every port. Query strings and fragments are ignored.

## `chat`

| Field | Required | Meaning |
| --- | --- | --- |
| `roots` | no | Containers to search in. Defaults to `document.body`. |
| `messages` | yes | Message element selectors. Tried in order; first selector with results wins. |
| `text` | no | Text containers inside a message. Defaults to the whole message. |
| `exclude` | no | Elements whose text is never replaced. |
| `skip` | no | Messages ignored entirely. |
| `messageIdAttr` | no | Reserved for debugging; not used by the engine today. |
| `channel` | yes | How to derive a stable key for this chat. |
| `sevenTv` | no | How to find the channel's 7TV account. |

The engine always skips `script`, `style`, `noscript`, `textarea`, `input`, `select`,
`option`, `code`, `pre`, `[contenteditable]`, and the extension's own UI.

`messages` and `text` are fallback chains: list the current selector first, then one
or two older variants. This keeps a plugin alive across small site changes.

`roots` matters on sites with several chats on one page (for example, a stream page
with a chat sidebar). The engine only processes messages inside the first root
selector that produces elements. If none match, it falls back to `document.body`.

### `channel`

The channel key becomes part of the binding key:
`<registry>:<plugin>|<channel>`. It should identify the conversation, not the user.

Rules are evaluated in order; the first non-empty result wins:

```json
"channel": [
  { "from": "urlParam", "param": "sel" },
  { "from": "urlRegex", "regex": "/im/convo/(\\d+)", "group": 1 },
  { "from": "dom", "selector": "[data-channel-id]", "attribute": "data-channel-id" },
  { "from": "constant", "value": "default" }
]
```

- `urlParam` — `new URL(location.href).searchParams.get(param)`.
- `urlRegex` — first match of the regex against the full URL. `group` defaults to 1
  when the regex has a capture group, otherwise 0.
- `dom` — `querySelector(selector)?.getAttribute(attribute)`. The content script
  retries for up to 4 seconds, so SPA-rendered attributes are fine.
- `constant` — same key for every page. Useful for single-chat sites.

Use `constant` as the last fallback so a binding still works when the site changes
its URL scheme.

### `sevenTv`

Optional. When `autoChannel` is enabled in settings and the user has no manual
binding, the extension resolves the 7TV channel set:

```json
"sevenTv": {
  "platform": "twitch",
  "id": { "from": "dom", "selector": "[data-channel-id]", "attribute": "data-channel-id" }
}
```

Supported platforms: `twitch`, `youtube`, `kick`. `id` accepts a rule or an array of
rules, same as `channel`. **`id` is the platform's user id, not the login name**:
7TV's v3 API resolves `twitch/<numeric id>`, `youtube/<channel id>`,
`kick/<id>`. A Twitch plugin has to read the numeric id from the page (or a small
lookup service) before using auto-channel. For VK there is no 7TV platform
connection, so VK users bind a 7TV set manually in the popup.

## `composer`

```json
"composer": {
  "selectors": [".chat-input [contenteditable=true]", "textarea"],
  "kind": "auto"
}
```

- `selectors` — fallback chain. The first matching editable element wins.
- `kind` — `auto` (default), `contenteditable`, or `textarea`. Use `textarea` to
  avoid matching a search box before the real input.

The picker inserts the emote code as **text** followed by a space. It never uploads
images. Users without the extension see the code, exactly like 7TV on Twitch.

## Display rules

- Codes are matched case-sensitively, as whole whitespace-separated tokens.
- Surrounding punctuation is stripped: `peepoSad,` and `(peepoSad)` work.
- `:peepoSad:` is also accepted; the picker inserts the bare code.
- Leading/trailing punctuation includes `.,!?;:()[]{}<>"'`…—–*~|/\`.
- A token split across two HTML elements cannot be matched.
- Zero-width emotes use 7TV `data.flags` bit `256` or active `flags` bit `1`. They
  are drawn over the previous emote when only whitespace separates them.

## `proxyImages` and CSP

Some chats (VK) set `img-src` so that `cdn.7tv.app` cannot be loaded directly. With
`proxyImages: true`, the content script asks the background worker for the image
bytes and renders a `data:` URL, which those sites allow. The background only
proxies `cdn.7tv.app`, `cdn.betterttv.net` and `cdn.frankerfacez.com`; custom set
images are not proxied.

## Registry format

One JSON file:

```json
{
  "schemaVersion": 1,
  "name": "My registry",
  "plugins": [ { "...": "plugin object" } ]
}
```

Limits: 200 plugins, 2 MB file. Plugin ids must be unique inside a registry. A single
plugin object is also accepted as a registry, which makes a one-plugin URL easy.

## Local testing

1. Put the file in `registry/index.json`.
2. `pnpm registry` (CORS-enabled server on port 8787).
3. Extension settings → Add registry → `http://localhost:8787/index.json`.
4. Enable the plugin, allow its hosts, reload the chat page.
5. Open DevTools console. The content script logs failed emote sources and invalid
   selectors. Inspect a message: rendered emotes are `span.ea-e` with
   `data-ea-code` and `data-ea-text`.

Checklist before publishing:

- Open a chat and confirm messages get `span.ea-e` children.
- Send a message with an emote code; confirm it renders after the site re-renders.
- Scroll up and down a virtualized list; confirm no duplicate emotes.
- Confirm the composer picker inserts text and the site sends it.
- Confirm the channel key changes when you switch conversations.
- Bump `version`.

## Security rules for authors

- No JavaScript, no remote code, no `eval`. The loader only parses JSON.
- Selectors are passed to `querySelector`/`closest`. Invalid selectors are logged and
  ignored; they cannot execute anything.
- `urlRegex` runs against the page URL only. Keep it simple and anchored.
- Emote image URLs come from providers or a user's custom set; a plugin cannot add
  image URLs.

## Publishing

Fork the repository, edit `registry/index.json`, and open a pull request. A plugin
review checks:

- match patterns are as narrow as possible;
- selectors are stable attributes, not hashed class names when an alternative exists;
- `channel` identifies the conversation;
- no `*://*/*` for a single-site adapter;
- `description` and `homepage` are accurate.

Users can also host their own registry URL and add it in settings. No extension
release is needed for selector fixes.
