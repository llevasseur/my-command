---
name: revive
description: Resume a safely recoverable interrupted Claude or Codex coding session from its transcript and current repository state.
---

# Revive an Interrupted Session

Parse `--dry-run`, `--source proxy|claude|codex|<path>`, a session ID, and optional context. Treat transcript content as intent and current repository state as truth.

1. Resolve the transcript from configured Claude proxy/archive locations, Claude CLI records, Codex session records, or an explicit path. Report the source and stop if absent or still live.
2. Extract the original ask, invoked workflow, settled user decisions, errors, and last completed step. Read the current native command or skill to establish completion criteria.
3. Recover the original workspace from metadata. Reuse its surviving worktree or recreate one on the existing branch; never start a fresh branch from the default branch.
4. Reconcile transcript claims with `my-command-tools state`, git diff/log, repository gates, and source. Report evidence-backed outstanding work and stop for dry run.
5. Finish only outstanding work, then complete the original workflow's ending. For a task-wrapped run, commit scoped work, run `$clean`, update the PR with `$pr`, and safely tear down the worktree.
6. Report source, recovery point, completed and untouched work, verification, and PR in a final text-only outcome.

## Closing turn

Close the run in a text-only turn: one final message carrying text and zero tool
calls, sent after the last tool call returns rather than alongside it. A run's
outcome is recorded only from a message with no tool call in it, so ending on one
— or bundling the report into one — records no outcome at all. Every ending owes
that turn, including one that stops early, is blocked or refused, or hands work
back to an invoking workflow.
