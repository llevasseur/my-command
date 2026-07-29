---
name: sync
description: Update or check installed MyCommand Claude commands and Codex skills from their source without overwriting local work.
---

# Sync MyCommand

Parse `--check` as read-only. Detect whether the active workflow is a symlinked git clone, copied wizard install, or plugin installation.

- For a clone, resolve its root from the installed command or skill, fetch, compare with the remote default branch, and report commits behind for `--check`. Require a clean clone before `git pull --ff-only`, then rerun its supported installer so new commands, Codex skills, and device tools are discovered.
- For a copied install or plugin, use its supported update flow. If read-only checking is unavailable, report that rather than mutating state.

Never reset, stash, force, or overwrite local work. Explain whether a new Codex session is needed to pick up already-loaded skill changes.
Finish with `my-command-tools doctor` when available so command, skill, toolkit,
and PATH state are reported together.
