---
type: feature
title: sync
description: Update this device's installed MyCommand commands to the latest version from GitHub.
tags: [command, install, update]
timestamp: 2026-07-15
updated: 2026-08-02
---

# sync

## Summary

Updates the locally-installed commands to the latest on GitHub. Detects how the
commands are installed (symlinked personal clone, marketplace-synced personal
copy, or plugin) and updates accordingly.

## Flags / Parameters

- `--check` — report whether the local copy is behind, but change nothing. On the
  marketplace path, if the CLI cannot check without updating, it reports that
  limitation and stops.
- No argument: perform the update.

## Behavior

For the symlinked install it locates the clone from the symlink, fetches (as its
own call, never chained — a chained fetch escalates approval to the whole command),
compares `HEAD` to `origin/<default-branch>`, refuses to proceed unless
`my-command-tools state` reports no tracked and no untracked changes, pulls
`--ff-only` (stopping rather than merging if the branch diverged), and re-links
newly added commands. For a marketplace copy it registers the marketplace if it is
missing, updates it, stops if that version ships no `install-marketplace-personal.sh`,
then runs it. For the plugin it updates the marketplace and reminds you to
`/reload-plugins`. Never force, reset, or stash. Consumes updates only — publishing
is the maintainer flow.

Both personal paths run `my-command-tools doctor` before their closing report —
the commands call it for their git plumbing.
The report names `resolvedBy` and `version`, the commits pulled, and the commands
added, changed, or removed. It also names `hooks.armed`, and never assumes the
registration landed: the workflow gates are inert until `settings.json` registers
them, command files reach a device by paths that never run the installer, and a
sync that pulled the gates without arming them says so as a failure rather than
reporting success. The installer may also refuse to replace an existing hooks
directory holding files this repo does not ship; that refusal is relayed, not
worked around. A command already invoked this session may be cached,
so restart the session if it still looks stale.

## Related

- Command source: `src/commands/sync.md`
- Spec: [Adding a command](../specs/adding-a-command.md)
- Spec: [Install wizard](../specs/install-wizard.md)
