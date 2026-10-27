# Store publishing

Release builds are produced by `.github/workflows/release.yml` when the version in
`package.json` changes on `main`. It creates the tag `v<version>`, runs all checks
and attaches these files to the GitHub release:

- `emote-anywhere-<version>-chrome.zip`: Chrome Web Store and Microsoft Edge Add-ons
- `emote-anywhere-<version>-firefox.zip`: Firefox Add-ons (AMO)
- `emote-anywhere-<version>-sources.zip`: AMO source review

Bump `version`, add a `CHANGELOG.md` entry, and push. Do not create the tag by hand.

## Listing copy

**Name:** Emote Anywhere

**Short description (132 chars):**
7TV, BTTV and FFZ emotes in VK Messenger and other chats with a plugin. Site support
updates without an extension release.

**Category:** Social & Communication (Chrome), Social & Communication (Edge),
Chat & IM (Firefox)

**Detailed description:**

> Bring 7TV, BTTV and FrankerFaceZ emotes to VK Messenger and other chats with a
> plugin.
>
> Emote Anywhere renders the emote sets you already use directly in the page. Open the
> built-in picker to search a set and insert an emote, add sets per chat, or add a
> global set that loads everywhere.
>
> Site support comes from plugins, not extension updates. VK Messenger is supported
> today; more chats can be added through the public registry.
>
> • 7TV, BTTV and FFZ global emotes
> • Global and per-chat sets
> • Searchable emote picker with keyboard navigation
> • Adjustable emote size
> • Custom emote sets
> • No account, no telemetry, no backend
>
> The extension does not read chat messages until you enable a plugin. Opening the
> popup reads the active tab URL; host access is requested per plugin. Chat text never
> leaves the page.
>
> Open source: https://github.com/Vijorich/emote-anywhere

**Homepage:** https://github.com/Vijorich/emote-anywhere

**Privacy policy:** https://github.com/Vijorich/emote-anywhere/blob/main/PRIVACY.md

**Support:** https://github.com/Vijorich/emote-anywhere/issues

## Permission justifications

- **storage**: save settings, enabled plugins, chat sets and the emote cache locally.
- **scripting**: register the content script only for enabled plugin hosts.
- **activeTab**: read the active tab URL so the popup can show the current chat.
- **Host access to 7TV/BTTV/FFZ CDNs**: background image proxy for sites whose CSP
  blocks third-party images.
- **Optional host access (`*://*/*`)**: the manifest allows any origin, but the
  extension requests only the enabled plugin's origins. It does not read chat messages
  before that.

## Screenshots

Store screenshots are generated from the standalone UI preview (`pnpm preview`) with
mock data, so no personal chat content is included. See `store/screenshots/` and
`store/README.md`.

## Submission checklist

1. Confirm the GitHub release exists and the three zips download.
2. Chrome Web Store → new item → upload the Chrome zip.
3. Fill listing copy, category, privacy policy URL and permission justifications.
4. Upload screenshots (1280×800 or 640×400 PNG/JPEG) and the 128×128 icon.
5. Submit for review.
6. Edge Add-ons → reuse the same Chrome zip and listing copy.
7. AMO → upload the Firefox zip and the sources zip for review.
8. After approval, add the store links to the README and repository homepage.

## Review notes

- The remote registry is data only. It is validated against an allow-list and cannot
  execute code (`docs/ARCHITECTURE.md`, "Security model").
- Optional host permissions are requested from a user gesture on the Sources screen.
- No remotely hosted code, no `eval`, no telemetry.
