# Security Policy

## Supported versions

Only the latest release on
[GitHub releases](https://github.com/Vijorich/emote-anywhere/releases) receives
security fixes. The public plugin registry updates independently of extension
releases, so a malicious-plugin-class registry issue can be hot-fixed without
a new extension version.

## Reporting a vulnerability

Use GitHub's **private vulnerability reporting** on the
[Security tab](https://github.com/Vijorich/emote-anywhere/security), or open a
security advisory. Please do **not** open a public issue for anything
exploitable.

Include the version, browser, a minimal repro (URL, plugin JSON, or crafted
registry response) and the impact you see. You will get an acknowledgement
within a few days; fixes ship as a patch release when confirmed.

## Scope notes for reviewers

The extension's threat model centers on the remote plugin registry. Plugins
are data: they are validated against an allow-list (see
[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md), "Security model"), never
executed, and cannot widen the extension's own permissions. Regex rules are
star-height-checked and matched against a bounded URL prefix. Out of scope:
issues in 7TV/BTTV/FFZ services, browser bugs, and sites that maliciously
restructure their DOM to confuse rendering.
