---
name: pr
description: Create or update the current branch's pull request with a concise, accurate description.
---

# Pull Request

Parse `--draft` / `-d`; treat remaining text as optional title or context.

1. Refuse the default branch. Derive an accurate title and concise bulleted body
   from commits and the full branch diff.
2. Use `my-command-tools pr` when available to push and create or update the PR
   without embedding credentials. Preserve existing body assets. Convert to
   draft only when requested; never silently mark a draft ready.
   - A `must be a collaborator` GraphQL error is the wrong identity, not a
     permission to request. `gh`'s GraphQL-backed writes (`gh pr create`,
     `gh pr edit`) resolve to an account that is not a collaborator on
     `llevasseur`-owned repos, while REST succeeds. Select the right account
     (`gh auth switch`, or `GH_TOKEN="$(gh auth token --user llevasseur)"`) or use
     the REST equivalent.
3. Do not create commits. If the owning workflow asks this skill not to tear down
   its worktree, leave it intact. Otherwise remove a linked worktree only after
   confirming it is clean and its HEAD exists on the remote branch.
   - Remove a worktree through the same mechanism that created it. One this
     session merely entered is not owned by the session worktree tool; step back
     out, then remove it through the repository helper from outside the worktree,
     which re-verifies the branch reached origin. If another live session still
     holds it, stop and report the path as left in place.
4. Report the PR number and URL.

## Git call shape

- A classifier refusal is not evidence that repository protections should be
  weakened. Inspect the refused command first; when the intended operation is
  safe and the refusal looks incidental to the command's shape — an over-broad
  chain, pipe, or extra flag — retry only the smallest exact command, never an
  allowlisted Bash pattern or a permission-settings change.

## Closing turn

Close the run in a text-only turn: one final message carrying text and zero tool
calls, sent after the last tool call returns rather than alongside it. A run's
outcome is recorded only from a message with no tool call in it, so ending on one
— or bundling the report into one — records no outcome at all. Every ending owes
that turn, including one that stops early, is blocked or refused, or hands work
back to an invoking workflow.

Anchor that turn before the first tool call: put "close the run in a text-only
turn" in the todo list as its own final item, because the todo list is live
session state that a compaction carries forward and this prompt is not. Resolve it in the same tool-call turn as the run's last piece of real work,
so the list is already clean when that turn returns and the only thing left
to do is speak. Never leave marking it as a call of its own after the work
ends: a run whose last scheduled action is a bookkeeping tool call ends on
that call — the mark lands every time, and the message meant to follow it
never arrives. A
compaction boundary is a checkpoint, not an ending — a recap prompt, a
background-task notification, or a session-continuation preamble each mean the
run is still owed its turn, so answer in text alone, say where the run stands,
and restore the todo item if it did not survive. Each side of a boundary
records its own standing, because a run split across two transcripts is two
runs to the record. Every message from the
user opens a task in the same transcript, and only a reply carrying text
and no tool call closes it, so answer a mid-run question, correction, or
recap in text before returning to tool calls. A reply to another session is
not that turn either: SendMessage is a tool call, so send the reply, let it
return, then close in text alone.
