---
name: task
description: Take a plain-language task from criteria through implementation, verification, cleanup, and an open pull request.
---

# Task to Pull Request

Parse `--here`, `--base <branch>`, `--draft`, `--sub`, and `--add <skill prompt,...>`; remaining text is the task criteria.

Before the first tool call, record this pipeline as a task list whose **last item
is step 8's closing turn**, kept as its own item and left open until nothing else
remains. A compaction carries that list forward; it does not carry these
instructions, so the item is the only surviving record that the run owes an
outcome. Resolve it in the same tool-call turn as the run's last piece of real
work — the teardown, the final verification, the closing PR call — so the list
is already clean when that turn returns and the only thing left to do is speak.
Never leave marking it as a call of its own after the work ends: a run whose
last scheduled action is a bookkeeping tool call ends on that call, the mark
lands every time, and the message meant to follow it never arrives.

1. Resolve requested add-on skills from the skills installed on this device, read their complete instructions, and place them in the pipeline according to their prompts.
2. Set up the workspace before editing. Unless `--here`, use
   `my-command-tools worktree begin --bootstrap` when available to fetch and
   create a dedicated `.codex/worktrees/<type>/<summary>` worktree from the
   latest requested base. Verify the branch, worktree, and base; never implement
   on the default branch. When a session-level tool moves the session into that
   checkout, address it by the absolute path the helper just reported, copied
   byte for byte — entering an existing checkout, never asking for a new one by
   name, and never with a relative or reconstructed path. Make that one call and
   read its result: a refusal describes how the worktree was created, so do not
   retry it and do not reinvent a workaround, just work through absolute paths
   under the reported path. Decide teardown with entry — it is the repository
   helper's `worktree end` from outside the path, after stepping the session
   back out without removing anything.
3. Run repository bootstrap when available. Otherwise link only ignored environment files, install dependencies separately, and regenerate touched artifacts in the worktree.
4. State the criteria, inspect existing targets, follow `AGENTS.md`, plan
   non-trivial work, reproduce bugs, implement completely, and run
   `my-command-tools verify` when available. Use Codex-native tools in the
   session, including shell/filesystem tools, installed skills, browser or
   computer-use tools for required visual proof, and subagents only when the user
   or repository instructions allow delegation.
5. Add changelog work when the repository tracks it. Commit logical scoped
   changes with explicit paths through `my-command-tools commit` when available;
   never sweep in unrelated work. `1Password: failed to fill whole buffer` with
   `fatal: failed to write commit object` is an unapproved signing prompt, not a
   repository problem: the commit did not happen and the tree is untouched. Retry
   the same commit once after the prompt is approved. Never rewrite the commit,
   pass `--no-gpg-sign`, or change the repo's signing configuration to get
   around it.
6. Use `my-command-tools state` when available for the no-change gate. If the run
   produced no relevant commits or edits, report that the criteria already hold
   and safely remove any worktree.
7. Otherwise run `$clean`, commit any cleanup, then run `$pr`. Run that pair in
   this session by default and delegate it to a single subagent only when `--sub`
   was requested; the order, cleanup commit, and PR result are identical either
   way. After the PR exists, confirm the worktree is clean and its HEAD is on the
   remote branch, remove it from outside the worktree, and report branch, checks,
   commits, PR, and teardown.
   - Remove a worktree through the same mechanism that created it. One created by
     `git worktree add` or a repository helper is not owned by a session worktree
     tool merely because the session later entered it. If a tool reports the
     session does not own it, do not retry that tool: step back out and remove it
     through the repository helper from outside the worktree, which re-verifies
     the branch reached origin. If another live session still holds it, stop and
     report the path as left in place.
8. Close the run in a text-only turn: one final message carrying text and zero
   tool calls, sent after the last tool call returns rather than alongside it. A
   run's outcome is recorded only from a message with no tool call in it, so
   ending on one — or bundling the report into one — records no outcome at all.
   This step is never skipped and never delegated. Every exit routes through it:
   PR opened, nothing to do, verification still failing, blocked, refused,
   abandoned, or waiting on an answer. Lead with one self-contained line naming
   what shipped and the PR, or what stopped the run and where the work sits. Under
   `--sub` the subagent's report is not this turn; close the run in this session
   after its result returns. If a compaction dropped the task list, close the run
   anyway.

   Anchor that turn before the first tool call: put "close the run in a
   text-only turn" in the todo list as its own final item, because the todo
   list is live session state that a compaction carries forward and this prompt
   is not. Resolve it in the same tool-call turn as the run's last piece of
   real work, so the list is already clean when that turn returns and the only
   thing left to do is speak; never leave marking it as a call of its own after
   the work ends, because a run whose last scheduled action is bookkeeping ends
   on that call and the message meant to follow it never arrives. A compaction
   boundary is a checkpoint, not an ending — a recap prompt, a background-task
   notification, or a session-continuation preamble each mean the run is still
   owed its turn, so answer in text alone, say where the run stands, and
   restore the todo item if it did not survive. Each side of a boundary records
   its own standing, because a run split across two transcripts is two runs to
   the record. Every message from the user opens a task in the same transcript,
   and only a reply carrying text and no tool call closes it, so answer a
   mid-run question, correction, or recap in text before returning to tool
   calls. A reply to another session is not that turn either: a message-sending
   call is still a tool call, so send the reply, let it return, then close in
   text alone.

Validation limitations do not stop PR creation when useful in-scope recovery is exhausted; document them in the PR. Never force-remove dirty or unpushed work.

## Git call shape

- `gh`'s GraphQL-backed writes (`gh pr create`, `gh pr edit`) resolve to an
  account that is not a collaborator on `llevasseur`-owned repos, while REST
  succeeds. A `must be a collaborator` GraphQL error means the wrong identity,
  not a permission to request: select the right account (`gh auth switch`, or
  `GH_TOKEN="$(gh auth token --user llevasseur)"`) or use the REST equivalent.
- As a narrow exception to the general rule to chain dependent mutations, issue
  branch-lifecycle operations such as checkout/switch, pull, remote-branch
  inspection, and local branch deletion as individual shell calls. Put status
  output, pipes, and follow-up verification in separate read-only calls.
- A classifier refusal is not evidence that repository protections should be
  weakened. Inspect the refused command first; when the intended operation is
  safe and the refusal looks incidental to the command's shape — an over-broad
  chain, pipe, or extra flag — retry only the smallest exact command, never an
  allowlisted Bash pattern or a permission-settings change.
