# Contributing

Thanks for improving Emote Anywhere. The two most valuable kinds of
contributions are **site plugins** (or selector fixes to existing ones) and
**bug reports with a URL and a screenshot**.

## Setup

Requires Node 22+ and [pnpm](https://pnpm.io).

```bash
git clone https://github.com/Vijorich/emote-anywhere
cd emote-anywhere
pnpm install
cp .env.example .env
pnpm dev        # Chrome, loads .output/chrome-mv3-dev
```

Run `pnpm test` and `pnpm typecheck` before opening a pull request; CI runs
both plus the production builds. Keep TypeScript strict: the project has no
runtime linter, so match the surrounding code style (small functions,
explicit types at boundaries, `browser` from `wxt/browser`, never `chrome.*`).

## Adding or fixing a site plugin

Plugins are JSON, not code. Start from [registry/PLUGIN_API.md](registry/PLUGIN_API.md)
and the `vk` entry in `registry/index.json`; test against
`pnpm dev:page` (mock chat) and the real site. When you change a plugin, bump
its `version` so clients pick the new selectors up on the next registry
refresh. Add or update a test in `tests/` when the change is logic, not just
data.

## Pull requests

1. One logical change per PR; describe what and why.
2. Commit subjects follow
   [Conventional Commits](https://www.conventionalcommits.org/):
   `type[(scope)][!]: summary`, one line, summary at most 72 characters.
   Types: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`,
   `build`, `ci`, `chore`, `revert`. CI rejects anything else; check locally
   with `pnpm commits:check <range>` (for example
   `pnpm commits:check origin/main..HEAD`).
3. The subject decides the next version, so write it for the changelog:
   `fix: ...` is a patch, `feat: ...` is a minor, `!` or a
   `BREAKING CHANGE:` footer is a major. Everything the changelog entry
   should say goes in the commit body.
4. Anything that touches permissions, the registry schema or the background
   state owner should explain the security implications in the PR body.

## Releases (maintainers)

Do not write `CHANGELOG.md` entries, bump `package.json` or create tags by
hand. Merge work to `main` with conventional subjects; release-please then
opens a release pull request containing the proposed version and the generated
changelog. Merging that PR tags `v<version>`, publishes the GitHub release and
triggers the build that attaches the store packages. See the
[README](README.md#releases) and [docs/STORE.md](docs/STORE.md).

## Code of conduct

Be respectful. Keep discussions on-topic and assume good faith; maintainers
may close threads that don't.
