---
description: Update the locally-installed MyCommand commands to the latest version on GitHub
argument-hint: "[--check]"
allowed-tools: Bash(git:*), Bash(readlink:*), Bash(ls:*), Bash(bash:*), Bash(claude:*)
---

Update this device's MyCommand commands to the latest version from the GitHub repo. Run this whenever a change has been pushed and you want it locally.

`--check` (from $ARGUMENTS): report whether the local copy is behind, but don't change anything.

## How the commands are installed here

These commands are installed one of three ways; detect which and act accordingly. Inspect `~/.claude/commands/sync.md`:

- **Symlink** → the git-synced personal install (the normal case). The link points into a local clone of the repo; updating means pulling that clone.
- **A real file** → a marketplace-synced personal copy. Update the marketplace checkout, then install its published namespaced commands locally as bare commands using the steps below.
- **Not present** → the commands are installed as the plugin (`/my-command:*`), which auto-updates through the marketplace. Run `git`-free: `claude plugin marketplace update my-command`, then remind me to `/reload-plugins`. Stop.

## Steps (symlink / git-synced install)

1. Locate the clone from the symlink, so this works regardless of where the repo was cloned:
   `REPO="$(cd "$(dirname "$(readlink -f ~/.claude/commands/sync.md)")/../.." && pwd)"`
   (the resolved path is `<clone>/src/commands/sync.md`, so the clone root is two directories up).
2. `git -C "$REPO" fetch origin` and compare local `HEAD` to `origin/<default-branch>`.
   - If already up to date, say so and stop.
   - For `--check`, report how many commits behind (with `git -C "$REPO" log HEAD..origin/<branch> --oneline`) and stop without pulling.
3. Before pulling, check the clone is clean: `git -C "$REPO" status --porcelain`. If there are local edits (you may be the author mid-change), report them and stop — never discard local work.
4. `git -C "$REPO" pull --ff-only`. If it can't fast-forward (diverged), report and stop rather than merging.
5. Re-link so any newly added commands get picked up: `bash "$REPO/scripts/install-personal.sh"`. Existing commands are symlinks, so they already reflect the pulled files.
6. Report: the commits pulled (`git log <old>..<new> --oneline`) and which commands were added, changed, or removed. Note that a command you already invoked this session may be cached — restart the session if it still looks stale.

## Steps (real file / marketplace-synced personal install)

1. Ensure the marketplace is registered. If `~/.claude/plugins/marketplaces/my-command` does not exist, run `claude plugin marketplace add llevasseur/my-command`.
2. Run `claude plugin marketplace update my-command` so the local marketplace checkout contains the latest published command Markdown.
   - For `--check`, run the marketplace update check supported by the installed Claude CLI if available. If the CLI cannot check without updating, report that limitation and stop without changing the personal commands.
3. Verify `~/.claude/plugins/marketplaces/my-command/scripts/install-marketplace-personal.sh` exists. If it does not, report that this marketplace version does not support personal sync and stop.
4. Run `bash ~/.claude/plugins/marketplaces/my-command/scripts/install-marketplace-personal.sh`. It copies the marketplace's generated `commands/*.md` into `~/.claude/commands/` and converts references from `/my-command:*` to bare `/*` commands while preserving filenames.
5. Report which personal command files were updated. Note that a command already invoked in this session may be cached — restart the session if it still looks stale.

## Notes

- This command only consumes updates. Publishing a change is the maintainer flow: edit `src/commands/`, run `scripts/build-plugin.sh`, commit, push.
- Never force, reset, or stash the clone's working tree.
