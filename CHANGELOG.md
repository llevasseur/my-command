# Changelog

All notable changes to MyCommand are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com). There are no fixed release
versions — the plugin publishes continuously and installed copies track the
latest commit (SHA-based versioning), so changes are grouped by date.

## 2026-07-14

### Changed

- `mc` now merges each branch's **own PR base branch** into it instead of always merging `main`. Bases are fixed bottom-up via a recursive `fix(branch)` step: a branch's base is brought up to date (and pushed) before it is merged upward, recursing down to `main`. This makes `/mc` correct for stacked PRs.
- `mc` ALL mode no longer filters PRs by base — it processes every open PR (main-based and stacked). Memoization and recursion give correct bottom-up ordering, with a cycle guard for pathological base loops. Falls back to merging `main` when a branch's base branch has no open PR.

## 2026-07-13

### Added

- Initial bundle of six workflow commands (`task`, `fb`, `pr`, `clean`, `mc`, `task-bootstrap`), published as a Claude Code plugin and single-plugin marketplace.
- Bare canonical source in `src/commands/`, with `scripts/build-plugin.sh` generating the namespaced `commands/` the plugin ships.
- `scripts/install-personal.sh` — symlink the bare commands into `~/.claude/commands` for git-synced personal use across devices.
- Zero-dependency `npx` install wizard (`npx github:llevasseur/my-command`) offering plugin install or a bare personal copy.
- `sync` command — update the locally-installed commands to the latest version from GitHub.
- `changelog` command — add a concise entry to a repo's `CHANGELOG.md`, matching that repo's existing format.

### Changed

- Dropped the pinned `version` in `plugin.json` so the git commit SHA drives versioning and every push counts as an update for auto-updating installs.

### Fixed

- Build transform no longer rewrites command names embedded in file paths (e.g. `~/.claude/commands/sync.md`); only bare slash-command invocations are namespaced.
