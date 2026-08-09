---
type: feature
title: clean
description: Clean up comments across a branch's changes — lean and to the point, comments only, never code.
tags: [command, comments]
timestamp: 2026-07-15
updated: 2026-08-08
---

# clean

## Summary

Trims and deletes comments on the lines a branch changed, making them lean and to
the point. Only touches comments — never code, logic, formatting, or behavior.

## Flags / Parameters

- `[branch]` (positional) — target branch to diff; defaults to the current branch.
  Diffs in place, never checks out.
- `[path / scope]` (positional) — limit the cleanup to a path or scope.
- No dash flags.

## Behavior

Gets the branch diff against its merge-base (plus uncommitted changes when targeting the
current branch) from **one** `my-command-tools scope --diff` call, which returns the scope
and the diff's own hunks together, and only considers comments on added/modified lines.
Each hunk line carries its own line number, so a comment's location is known before a file
is opened. Output is capped (`--diff-limit`), and files past the cap are named rather than
cut in half.

**That diff is the comment context, and the changed-file list is never walked.** Every
line the command may touch is already in the hunks, so the scope result is not a queue of
files to fetch one at a time — the recorded failure was a branch diff reissued once per
path, alongside `sed -n` over three adjacent ranges of a single file. The command instead selects, from the hunks, the subset of files
that actually carry a comment in scope and opens exactly that subset in **one** batched
`Read` (`Edit` needs its target read first); a changed file with no comment in its hunks is
never opened at all. A file discovered mid-edit joins the next batch rather than taking a
turn of its own. This governs a list that arrived complete — iterative probing, where each
result chooses the next path, is a real dependency and is untouched.
Deletes restating/narration/ceremony comments, tightens verbose ones, keeps
load-bearing and structural ones. Never adds comments.

Does not commit — a rule scoped to the command itself, not to its caller. The edits
are left for whoever invoked `/clean` to own: uncommitted is the deliverable for a
direct run, while an invoking workflow ([task](task.md) Step 3,
[task-bootstrap](task-bootstrap.md) Step 7) commits them and isn't finished until it
has. Nested runs hand back and continue the invoker rather than stopping at
uncommitted cleanup. Teardown is never `/clean`'s either — it removes a worktree by
no route at all; the invoker owns that workspace.

Prose in Markdown docs is out of scope even when the branch diff touches it —
that is [truncate](truncate.md)'s pass, which has claim-preservation rules this
one doesn't. Comments inside a doc's fenced code blocks are still in scope here.

Reports how many comments were removed versus tightened, grouped by file, in a
text-only closing turn.

## Related

- Command source: `src/commands/clean.md`
- Invoked by: [task](task.md) before [pr](pr.md)
- Sibling: [truncate](truncate.md) — the same lean-up for **doc prose**
- Spec: [Adding a command](../specs/adding-a-command.md)
