# Store publishing guide

Step-by-step: from the GitHub release to a published listing on the Chrome Web
Store, Microsoft Edge Add-ons and Firefox Add-ons (AMO). Listing copy and
permission justifications for the store forms are in the second half.

Every release produces three artifacts, attached to the
[GitHub release](https://github.com/Vijorich/emote-anywhere/releases) by
`.github/workflows/release.yml` when the `v<version>` tag is published (the
tag is created by release-please when the release pull request is merged):

| File | Store |
| --- | --- |
| `emote-anywhere-<version>-chrome.zip` | Chrome Web Store, Edge Add-ons |
| `emote-anywhere-<version>-firefox.zip` | Firefox Add-ons (AMO) |
| `emote-anywhere-<version>-sources.zip` | AMO source review (required) |

## 0. Pre-flight (once per release)

1. Confirm the GitHub release `v<version>` exists and all three zips download.
2. Optional but recommended: install the two platform zips on a clean browser
   profile, enable the VK plugin, and check the picker, emote rendering and
   proxied images in a real chat.
3. Keep the store screenshots current (`store/screenshots/`, 1280×800 PNG;
   see `store/README.md`).

---

## 1. Chrome Web Store

### One-time account setup

1. Register at the [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole)
   with your Google account.
2. Pay the one-time **$5 registration fee** (card required, per account).
3. The account email becomes public on listings; use the one you want shown.

### Upload

1. Dashboard → **New item** → upload
   `emote-anywhere-<version>-chrome.zip`.
2. The item ID is permanent once created; the first upload reserves it.

### Listing tab

- **Name:** `Emote Anywhere`
- **Summary (132 chars max):**
  `7TV, BTTV and FFZ emotes in VK Messenger and other chats with a plugin. Site support updates without an extension release.`
- **Category:** Social & Communication
- **Icons:** auto-filled from the manifest; verify 128×128 shows correctly.
- **Screenshots:** upload all four from `store/screenshots/` (1280×800 PNG).
  At least one is required; 3–5 is recommended.
- **Detailed description:** paste the copy from the *Listing copy* section
  below.

### Privacy tab (data disclosures)

Answer the data-usage questions to match reality: this extension collects
nothing:

1. **Single purpose description:**
   `Render 7TV, BTTV and FFZ emotes in chat pages the user enables via plugins.`
2. **Do you sell or transfer data to third parties?** **No.**
3. **Remote code:** confirm the extension does **not** use remote hosted code
   (the plugin registry is JSON data, validated and never executed).
4. Data usage declarations: declare that you do **not** collect browse
   activity, website content, personal communications or any PII. Chat text is
   processed locally in the page and never transmitted by the extension.
5. **Privacy policy URL:**
   `https://github.com/Vijorich/emote-anywhere/blob/main/PRIVACY.md`
6. Add **warranty/consent info** if prompted (not applicable: no data
   collection).

### Permissions justification (review will ask)

Use the *Permission justifications* section below. The two that need prose:

- `scripting` + optional `*://*/*` host access: site support comes from a
  data-only plugin registry; host access is requested per enabled plugin from
  a user click, and only for that plugin's origins.
- CDN host permissions: background image proxy for chats whose CSP blocks
  third-party emote images.

### Submit and what to expect

1. **Submit for review.** First submissions typically take from a few days up
   to a couple of weeks.
2. If rejected, the dashboard shows the reason. The most likely questions are
   about the optional broad host permission and the "site support without an
   extension update" phrasing; answer with the remote-code explanation above.
   The registry is data, like a blocklist, never executed.
3. After approval, the listing goes live. Save the listing URL.

### Update flow (later versions)

Dashboard → your item → **Package** → upload new zip → bump version → submit.
Reviews for updates are usually faster.

---

## 2. Microsoft Edge Add-ons (optional, reuse Chrome work)

1. Register at [Partner Center](https://partner.microsoft.com/dashboard/microsoftedge)
   (Microsoft account; one-time fee may apply, currently $19, often waived for
   individual accounts; check the current prompt).
2. **Create new extension** → upload the **same**
   `emote-anywhere-<version>-chrome.zip` (Chromium MV3 builds are compatible).
3. Paste the same listing copy; category **Social & Communication**; upload the
   same screenshots and privacy policy URL.
4. Fill the same data-collection answers (none) and submit.

Edge reviews usually complete within a few business days.

---

## 3. Firefox Add-ons (AMO)

### One-time account setup

1. Create an account at [addons.mozilla.org](https://addons.mozilla.org/developers/).
2. No fee. Two-factor authentication on the account is recommended.

### Upload

1. [Submit a new add-on](https://addons.mozilla.org/developers/addon/submit/)
   → **On this site** → upload
   `emote-anywhere-<version>-firefox.zip`.
2. AMO requires the source when a package contains minified/bundled code:
   upload `emote-anywhere-<version>-sources.zip` when prompted ("provide the
   source code"). It contains the unminified repository source used to build
   the zip.

### Listing page

- **Name:** `Emote Anywhere`
- **Summary (250 chars max):**
  `7TV, BTTV and FFZ emotes in VK Messenger and other chats with a plugin. Site support updates without an extension release.`
- **Category:** Chat & IM (under Social Networking)
- **Support email / site:** your address /
   `https://github.com/Vijorich/emote-anywhere/issues`
- **Privacy policy:** link
   `https://github.com/Vijorich/emote-anywhere/blob/main/PRIVACY.md`
   (required because the extension makes requests to third-party services).
- **Screenshots:** the same four PNGs.
- License: MIT.

### Data-collection disclosure

The manifest already declares `data_collection_permissions: { required: ['none'] }`.
In the listing form, answer **no data collection** (no telemetry, no accounts,
no analytics). The disclosure must match the privacy policy.

### Review and signing

1. Automated checks run immediately; human review of the source usually takes
   from a day to a week.
2. After approval, AMO signs the XPI and the listing goes live. The same
   Firefox add-on ID (`emote-anywhere@vijorich.github.io`) must never change.
3. Updates: same flow, upload the new firefox zip + sources zip; Firefox users
   receive the update automatically.

---

## 4. After approval

- [ ] Replace the *Install* section of `README.md` with store badges and links.
- [ ] Add the store links to the GitHub repository **About** sidebar
      (homepage stays the repo; add store URLs to the website field or
      README).
- [ ] Tag the release notes with the store links.
- [ ] Optional: automate future uploads: Chrome
      (`chrome-webstore-upload`), AMO (`web-ext submit`) with API credentials
      stored as GitHub Actions secrets.

---

## Listing copy (paste-ready)

**Detailed description:**

> Bring 7TV, BTTV and FrankerFaceZ emotes to VK Messenger and other chats with
> a plugin.
>
> Emote Anywhere renders the emote sets you already use directly in the page.
> Open the built-in picker to search a set and insert an emote, add sets per
> chat, or add a global set that loads everywhere.
>
> Site support comes from plugins, not extension updates. VK Messenger is
> supported today; more chats can be added through the public registry.
>
> • 7TV, BTTV and FFZ global emotes
> • Global and chat sets
> • Searchable emote picker with keyboard navigation
> • Adjustable emote size
> • Custom emote sets
> • No account, no telemetry, no backend
>
> The extension does not read chat messages until you enable a plugin. Opening
> the popup reads the active tab URL; host access is requested per plugin.
> Chat text never leaves the page.
>
> Open source: https://github.com/Vijorich/emote-anywhere

## Permission justifications (paste-ready)

- **`storage`**: save settings, enabled plugins, chat sets and the emote
  cache locally on the device. Never synced, never transmitted.
- **`scripting`**: register the content script only on hosts whose plugin the
  user explicitly enabled.
- **`activeTab`**: read the current tab URL so the popup can show the chat's
  status. No browsing history is stored.
- **Host access to `cdn.7tv.app`, `cdn.betterttv.net`,
  `cdn.frankerfacez.com`**: background image proxy for chat sites whose
  Content Security Policy blocks third-party images (e.g. VK). Images are
  fetched by the background, converted to `data:` URLs and rendered locally.
- **Optional host access (`*://*/*`)**: site support is driven by a public
  plugin registry. When the user enables a plugin for a chat site, the
  extension requests that plugin's specific origins from a user click, never
  blanket access. The registry is JSON data (selectors, URL patterns),
  validated against a strict schema and never executed; there is no remote
  code. See `docs/ARCHITECTURE.md`, "Security model".

## Review notes (paste-ready, if a reviewer asks)

- No remotely hosted code, no `eval`, no obfuscated code. All JavaScript is
  bundled in the package; the sources zip (AMO) contains the full build
  source.
- The remote registry (`https://vijorich.github.io/emote-anywhere/index.json`)
  is data only: capped at 2 MB, parsed with an allow-list schema, and consumed
  strictly as CSS selectors, URL match patterns and bounded regexes. It cannot
  execute code or widen permissions.
- Optional host permissions are requested from user gestures on the Sources
  screen, narrowed to the plugin's origins; the background re-verifies grants
  before enabling anything.
- No telemetry, analytics, accounts or backend. Network requests go to the
  7TV/BTTV/FFZ APIs and CDNs and the registry host only.
- Store screenshots are generated from a UI preview with mock data; no real
  chat content is shown.
