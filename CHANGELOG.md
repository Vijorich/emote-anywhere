# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2026-10-27

First public release.

### Added

- Chat engine that finds messages, tokenizes text, renders emotes and survives
  re-renders and virtualized message lists.
- 7TV, BTTV and FFZ providers, including zero-width emotes.
- Declarative JSON plugin registry, fetched from GitHub Pages and refreshed without
  an extension update. VK Messenger is the first plugin.
- Emote picker with search and keyboard navigation, plus per-chat and global 7TV
  binding priority.
- Settings app (Overview, Sources, Bindings, Settings, Help) and a per-chat popup.
- Configurable emote size, 0.5×–3.0×, default 1.2×.
- Custom `code → image URL` sets.
- Background image proxy for sites with a strict image CSP.
- Chrome/Edge MV3 and Firefox MV3 builds.

[0.1.0]: https://github.com/Vijorich/emote-anywhere/releases/tag/v0.1.0
