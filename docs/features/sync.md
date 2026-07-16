---
type: feature
title: sync
description: Update this device's installed MyCommand commands to the latest version from GitHub.
tags: [command, install, update]
timestamp: 2026-07-15
---

# sync

## Summary

Updates the locally-installed commands to the latest on GitHub. Detects how the
commands are installed (symlinked personal clone, marketplace-synced personal
copy, or plugin) and updates accordingly.

## Flags / Parameters

- `--check` — report whether the local copy is behind, but change nothing.
- No argument: perform the update.

## Behavior

For the symlinked install it locates the clone, fetches, fast-forwards (never
force/reset/stash), and re-links newly added commands. For a marketplace copy it
updates the marketplace and re-runs the personal install script. For the plugin it
updates the marketplace and reminds you to `/reload-plugins`. Consumes updates
only — publishing is the maintainer flow.

## Related

- Command source: `src/commands/sync.md`
- Spec: [Adding a command](../specs/adding-a-command.md)
- Spec: [Install wizard](../specs/install-wizard.md)
