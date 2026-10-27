# Backlog

Remaining work that needs a real account, a clean browser profile or a store
login. The 0.3.0 release checks pass: the registry is public, the repository is
public, the Firefox ID is permanent, release notes exist and `pnpm release:check`
passes.

## After the 0.3.0 release

- [ ] Install both release zips on clean Chrome and Firefox profiles, enable VK,
      add a 7TV set, and test the picker plus proxied images in a real VK chat.
- [ ] Upload `0.3.0` to Chrome Web Store, Microsoft Edge Add-ons and AMO.
      Follow `docs/STORE.md`.
- [ ] Add the store links to the README and the GitHub repository homepage.
- [ ] Optional: automate store uploads with API credentials in GitHub Actions.
- [ ] Optional: add an end-to-end browser test. The current suite is unit and
      integration level; `dev/mock-chat.html` is manual.

## Known limitations

- Tokens are matched within one text node; a code split across elements is not
  matched.
- Shadow-DOM chat surfaces are not traversed.
- Per-frame contexts are kept in `storage.session` plus memory. They survive a
  service-worker restart, but are intentionally dropped when a tab closes or
  navigates.
- Disabling a plugin removes its content script registration but does not revoke
  previously granted host access. Users can revoke it in the browser's extension
  site-access settings; revoking it also tears down the running engine.
- Provider responses are capped at 4 MiB and resolved sets at 30,000 emotes.
  A user with very large custom sets may hit the state-size guard.
