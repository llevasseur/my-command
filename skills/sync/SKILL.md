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

## Closing turn

Close the run in a text-only turn: one final message carrying text and zero tool
calls, sent after the last tool call returns rather than alongside it. A run's
outcome is recorded only from a message with no tool call in it, so ending on one
— or bundling the report into one — records no outcome at all. Every ending owes
that turn, including one that stops early, is blocked or refused, or hands work
back to an invoking workflow.

Anchor that turn before the first tool call: put "close the run in a text-only
turn" in the todo list as its own final item, because the todo list is live
session state that a compaction carries forward and this prompt is not. A
compaction boundary is a checkpoint, not an ending — a recap prompt, a
background-task notification, or a session-continuation preamble each mean the
run is still owed its turn, so answer in text alone, say where the run stands,
and restore the todo item if it did not survive.
