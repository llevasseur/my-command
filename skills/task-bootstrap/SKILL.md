---
name: task-bootstrap
description: Create or update a repository-local bootstrap for safe, reproducible task worktrees.
---

# Worktree Bootstrap

Parse `--here`, `--base <branch>`, `--draft`, and stack notes. Follow `$task` workspace rules and inspect an existing bootstrap before creating anything.

1. Detect package management, monorepo layout, ignored environment files, generators, repository shell conventions, and changelog policy.
2. Ask one focused round only for details that cannot be discovered.
3. Create or update tracked `scripts/bootstrap-worktree.sh` and optional `AGENTS.md`/`CLAUDE.md` guidance. Make it portable: discover the main checkout via git common-dir, refuse to run there, link only ignored existing environment files without overwriting, install in the worktree, and regenerate from worktree-owned inputs.
4. Verify syntax, rerun safety, target selection, environment linking, and main-checkout refusal.
5. Add required changelog work, commit only scoped files, run `$clean`, commit whatever cleanup it leaves uncommitted, then invoke `$pr`, forwarding `--draft`. `1Password: failed to fill whole buffer` with `fatal: failed to write commit object` is an unapproved signing prompt, not a repository problem: the commit did not happen and the tree is untouched. Retry the same commit once after the prompt is approved. Never rewrite the commit, pass `--no-gpg-sign`, or change the repo's signing configuration to get around it.
   - Remove a worktree through the same mechanism that created it. One this
     session merely entered is not owned by the session worktree tool; step back
     out, then remove it through the repository helper from outside the worktree,
     which re-verifies the branch reached origin. If another live session still
     holds it, stop and report the path as left in place.

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
