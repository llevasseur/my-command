# Changelog

All notable changes to MyCommand are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com). There are no fixed release
versions — the plugin publishes continuously and installed copies track the
latest commit (SHA-based versioning), so changes are grouped by date.

## 2026-07-15

### Fixed

- `npx github:llevasseur/my-command` ran but did nothing (exited silently). The wizard's "invoked directly" guard compared `import.meta.url` against `process.argv[1]`, but `npx` runs the bin through a `node_modules/.bin` symlink — so `argv[1]` was the symlink path while `import.meta.url` was the resolved real path, and they never matched, so `main()` never ran. The guard now resolves `argv[1]` with `realpathSync` before comparing, so both `node bin/my-command.mjs` and the `npx` symlink invocation start the wizard.

### Added

- README gains a **Use cases** section — a command/example table for `task`, `fb`, and `mc` that highlights how each parameter (`--here`, `--base`, `--draft`, `--add`, `--target`) changes what the command does.

### Changed

- Personal install (the `npx` wizard) no longer silently skips commands that already exist. When there are conflicts it now shows an interactive checkbox — with a **Select all / Deselect all** toggle pinned at the top — so you pick exactly which existing commands to overwrite. Conflicts start unchecked (nothing is clobbered by default), and non-interactive shells keep the old safe behavior of leaving existing files untouched.
- `task` Step 3 now runs `/clean` and `/pr` in **fresh subagents** (via the `Agent` tool) instead of inline. Both stages derive their inputs entirely from git, so an isolated context loses nothing while shedding the large, stale file reads a long task accumulates by its final stages. Worktree teardown moves to the task agent itself, since `ExitWorktree` only works in the session that created the worktree.

## 2026-07-14

### Added

- `task` command gains an `--add` / `-a` flag — Step 0 discovers listed commands available on the user's device, loads their instructions and associated prompts into context, and updates the pipeline before the task begins; commands the agent cannot find are skipped.
- `sync` can update real-file personal installs from the marketplace, converting published `/my-command:*` references back to bare commands during installation.

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
