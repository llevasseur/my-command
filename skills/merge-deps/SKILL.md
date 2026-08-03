---
name: merge-deps
description: Safely batch-merge open dependency pull requests with conflict resolution and isolated verification.
---

# Merge Dependency Pull Requests

Parse `--label <name>` (default `dependencies`), one merge method (default squash), `--auto`, and `--dry-run`.

1. Use `my-command-tools doctor` and `state` when available to confirm
   authenticated git and GitHub state, no unrelated in-progress merge, and a
   clean worktree. Fetch and fast-forward the default branch.
2. List open non-draft PRs against the default branch with the label. Skip forks, sort oldest first, and make dry run report-only.
3. Process one PR fully before the next: fetch its head freshly, invoke `$mc --target <branch>`, and skip unresolved conflicts.
4. Verify in `.codex/worktrees/deps-<safe-branch>` using
   `my-command-tools worktree begin --existing`, repository bootstrap, and
   `my-command-tools verify --fast` when available. End it with the toolkit only
   after confirming it has no authored or unpushed work.
5. Merge through `gh pr merge`, respecting branch protection. Refresh the default branch between PRs and report merged, queued, conflict-resolved, and blocked items.

## Git call shape

- Issue a command that may need approval as its own shell call — fetch, config,
  and branch-lifecycle operations such as checkout/switch, pull, remote-branch
  inspection, and local branch deletion. Folding one into a chain escalates
  approval to the whole compound command and costs a turn plus a retry.
- A refusal of a PR merge or a remote-ref deletion is final. Surface it to the
  human and carry on with the remaining PRs; re-expressing the same operation
  through a raw API call or a different credential is refused for the same reason
  and costs a second turn. Step 5's branch-deleting merge is where this fires.

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
