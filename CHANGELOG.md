# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.5.2] - 2026-10-30

### Fixed

- The emote picker no longer doubles the gap between the search field and the
  grid, uses a themed thin scrollbar, and centres the close button glyph.
- Help problem cards use the same inner padding as the About and Links panels.
- The custom set JSON field sizes itself to the template on desktop and mobile,
  so the placeholder never needs scrolling.
- Small button labels sit optically centred in their buttons.

## [0.5.1] - 2026-10-30

### Fixed

- Help topics stack in the order About, Problems and Links, with no empty gap
  beside About.
- Disclosure chevrons and the plugin details chevron share one arrow shape and
  sit at the same inset, instead of the shifted glyph.

## [0.5.0] - 2026-10-30

### Added

- Emote codes made only of punctuation, such as `???` or `...`, now render, even
  when they touch a comma, a sentence end or another punctuation mark.

### Changed

- The options page, popup and picker use the system UI font with 16px body text.
  Controls, switches, sliders and tap targets are larger.
- Spacing, radii and row heights are aligned across the three surfaces. The popup
  is 384px wide.
- Disclosures such as **Add custom set** and **Add registry** are full-width
  raised rows that fill with the active tone when open.
- Plugin rows keep the details chevron next to the enable switch, and links in
  panel notes are underlined.

### Removed

- The read-only **Preview** panel on Sets. Set chips already show the attached set
  and its name.
- The notification banners and Undo. Removals now apply immediately. Field
  validation stays inline, and load failures keep their Retry button.

### Fixed

- Clicking the details chevron in a plugin row now opens the plugin dialog.

## [0.4.0] - 2026-10-30

### Added

- Undo for recoverable removals: set chips, chat sets, global sets and custom
  sets. The notice keeps Undo available for eight seconds.
- Custom set undo restores its id, enabled state and position in the list.

### Changed

- The "Chat sets" screen is now **Sets**, with **Global sets** and **Chat sets**
  sections. The popup card is named **Chat set**.
- Recoverable removals act immediately and offer Undo. Removing a plugin or
  registry still asks for confirmation.
- Destructive buttons stay neutral at rest and turn red on hover or keyboard
  focus, so routine removal no longer competes with the primary action.
- The registry form is collapsed behind an **Add registry** disclosure.
- The read-only "Emote priority" panel is removed. **Preview** remains.
- Plugin rows show a site count and a details chevron. Full descriptions and
  versions stay in the plugin dialog.
- Chat labels use the binding label or host name; raw channel keys remain in the
  tooltip only.
- Providers use full names: BetterTTV and FrankerFaceZ.
- Reload emotes is a quiet action. Empty states are shorter.
- Settings copy uses **Channel emotes** consistently.

### Removed

- The "First 12" preview label and version strings in list rows.

### Fixed

- Older bindings showed a raw numeric channel key in the popup and Sets screen.
- Focused headings after hash navigation drew an input-like focus ring.

## [0.3.1] - 2026-10-27

### Fixed

- The toolbar popup collapsed to a 25x25 square. Its CSS used viewport units,
  which Chrome resolves against the popup's own initial 25x25 measuring viewport.
  The popup now keeps its intended 380px width and content height.

## [0.3.0] - 2026-10-27

### Added

- Sources, Chat sets, Settings and Help replace the old Overview screen.
- Plugin details dialog with the full description, authors, homepage, host
  patterns, an enable switch and a remove action.
- Custom sets are added from an inline disclosure; registries from a card pinned at
  the bottom of Sources, below every registry.
- Set names, set chips and registry URLs link to their 7TV or registry page.
- The picker stays open after an insertion and keeps the caret between picks.
  Enter after a search inserts the first match.
- Keyboard focus rings are tracked by input modality, so a mouse click does not
  draw the tab ring.

### Changed

- New visual language: green tinted surfaces, Arial and Arial Black, an 880px
  reading column, filled controls without outlines, and a custom size slider.
- New app icon: a cream face on the green tile, with a separate 16px drawing for
  toolbar legibility. The same face is used in the header mark and the picker
  button.
- The VK plugin is named VK.
- The switch is the last control in every row.
- The extension version moved from Help to the sidebar footer and the mobile menu.
- The picker search is a soft filled field; its accent ring appears only for
  keyboard focus.
- Global set cards highlight and open on a full-card click, like registry cards.
- Enabling or disabling a plugin no longer posts a notice. Errors still do.
- Help no longer lists picker shortcuts, because the extension has no global
  hotkeys.
- Chat rendering observes only the chat roots, skips its own DOM writes and no
  longer re-tokenizes unchanged messages.
- Frames without a chat root no longer register and resolve the full emote set,
  which speeds up pages with many iframes.
- The tokenizer and exclusion matching do less work per text node, and custom
  sets are compared without serializing up to 20,000 emotes.
- The background memoizes loaded state for five minutes and caches resolved
  emote sets for repeat frame registrations.
- Picker search precomputes lowercased codes and debounces searches on sets of
  500 or more emotes.
- The registration payload omits the unused provider field, and the
  content-script image cache is capped at 200 entries / 8 MiB per frame.

### Fixed

- Switches were off centre: the knob sat 3px from the top and 1px from the bottom.
  Geometry is now symmetric at every size.
- Destructive actions looked like labels instead of controls.
- The picker reported an expanded combobox while its listbox was closed.
- The registry URL broke inside a word instead of at its slashes.
- Failed set lookups left an empty media placeholder behind.
- Empty states now name the next action instead of only the missing data.
- The plugin details button had the whole row as its accessible name.
- The mobile options header lost the product name below 900px.
- Help no longer claims that every image comes from a provider, and no longer asks
  users to enable image proxying they cannot control.
- Plugin API docs no longer imply that a plugin can call a lookup service.
- Store screenshot docs describe 1280x800 as an accepted size, not a required one.

### Removed

- The Overview screen and its styles.
- The picker shortcut list in Help and its `kbd` styles.

## [0.2.0] - 2026-10-27

### Added

- The emote picker stays open after an insertion, so several emotes can be added
  without reopening it. The caret position is preserved between picks.
- Set names and set chips link to their 7TV set page in the options page and
  popup. Registry URLs are clickable too.
- Plugin rows in Sources open a details dialog with the full description, authors,
  homepage and every host match pattern.

### Changed

- 7TV emote URLs prefer AVIF files, which are smaller than the WebP files on
  `cdn.7tv.app`.
- Image proxy caches keep up to 600 entries / 32 MiB and retry a transient failure
  once.

### Fixed

- Emote thumbnails on proxied sites could stay blank or load very slowly because
  large WebP files exhausted the background request timeout.
- Stale emote cache entries with old image URLs are discarded after upgrade.

## [0.1.0] - 2026-10-27

First public release.

### Added

- Chat engine that finds messages, tokenizes text, renders emotes and survives
  re-renders and virtualized message lists.
- 7TV, BTTV and FFZ providers, including zero-width emotes.
- Declarative JSON plugin registry, fetched from GitHub Pages and refreshed without
  an extension update. VK Messenger is the first plugin.
- Emote picker with search and keyboard navigation, plus per-chat and global 7TV
  set priority.
- Settings app (Overview, Sources, Bindings, Settings, Help) and a per-chat popup.
- Configurable emote size, 0.5x to 3.0x, default 1.2x.
- Custom `code` to image URL sets.
- Background image proxy for sites with a strict image CSP.
- Chrome/Edge MV3 and Firefox MV3 builds.

[Unreleased]: https://github.com/Vijorich/emote-anywhere/compare/v0.4.0...HEAD
[0.4.0]: https://github.com/Vijorich/emote-anywhere/releases/tag/v0.4.0
[0.3.1]: https://github.com/Vijorich/emote-anywhere/releases/tag/v0.3.1
[0.3.0]: https://github.com/Vijorich/emote-anywhere/releases/tag/v0.3.0
[0.2.0]: https://github.com/Vijorich/emote-anywhere/releases/tag/v0.2.0
[0.1.0]: https://github.com/Vijorich/emote-anywhere/releases/tag/v0.1.0
