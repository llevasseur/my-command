---
name: task
description: Take a plain-language task from criteria through implementation, verification, cleanup, and an open pull request.
---

# Task to Pull Request

Parse `--here`, `--worktree <path>`, `--base <branch>`, `--draft`, `--sub`, and `--add <skill prompt,...>`; remaining text is the task criteria.

Before the first tool call, record this pipeline as a task list whose **last item
is step 9's closing turn**, kept as its own item and left open until nothing else
remains. A compaction carries that list forward; it does not carry these
instructions, so the item is the only surviving record that the run owes an
outcome. Resolve it in the same tool-call turn as the run's last piece of real
work — the teardown, the final verification, the closing PR call — so the list
is already clean when that turn returns and the only thing left to do is speak.
Never leave marking it as a call of its own after the work ends: a run whose
last scheduled action is a bookkeeping tool call ends on that call, the mark
lands every time, and the message meant to follow it never arrives.

1. Resolve requested add-on skills from the skills installed on this device, read their complete instructions, and place them in the pipeline according to their prompts.
2. Set up the workspace before editing. `--worktree <path>` means the checkout is
   already there and belongs to whoever dispatched this run: read its state, work
   through absolute paths beneath it, pass that path as the working directory to
   every helper verb, and make no worktree of your own — no `worktree begin`, no
   session-level move into it, and skip step 3, which the dispatcher already ran.
   Report the path as still standing at the end instead of removing it. Otherwise,
   unless `--here`, use
   `my-command-tools worktree begin --bootstrap` when available to fetch and
   create a dedicated `.codex/worktrees/<type>/<summary>` worktree from the
   latest requested base. Verify the branch, worktree, and base; never implement
   on the default branch. **The path the helper reports is this run's working
   root: resolve every read, edit, commit and working-directory flag beneath it
   as an absolute path, whether or not the session itself ever moves.** That is
   the normal mode, not a recovery from something refused. A session-level move
   into the checkout is optional and belongs to one kind of run only — one the
   user invoked directly, in the repo the session started in; a dispatched run
   starts at a repository root, where that tool refuses outright, so it does not
   call it at all. Where it is called, address the checkout by the absolute path
   just reported, copied byte for byte, entering the existing checkout rather
   than asking for a new one by name. Teardown is the repository helper's
   `worktree end` from outside the path, after stepping the session back out
   without removing anything.
3. Run repository bootstrap when available. Otherwise link only ignored environment files, install dependencies separately, and regenerate touched artifacts in the worktree.
4. State the criteria, inspect existing targets, follow `AGENTS.md`, plan
   non-trivial work, reproduce bugs, implement completely, and run
   `my-command-tools verify` when available. **Wait for it with one call, never
   by polling:** start it with `--background`, then send the
   `my-command-tools verify --wait <verdict>` command it reports under
   `wait.blocking` as a plain foreground shell call with a 600-second timeout. It
   blocks until the gates finish and prints that run's whole report. Do not read
   the report while the run is going — it is written atomically at exit, so until
   then it does not exist and every early read returns the same nothing. Use
   Codex-native tools in the
   session, including shell/filesystem tools, installed skills, browser or
   computer-use tools for required visual proof, and subagents only when the user
   or repository instructions allow delegation.
5. Run the repository's anti-slop lint before any cleanup or pull-request step,
   when the repository defines a `lint:anti-slop` script at its root. Read the
   root manifest for that script; if it is absent, skip this step and record it
   as skipped in the run's report and pull-request description, never adding the
   script, installing a plugin, or editing lint configuration to make it
   runnable. When it is present, run it from the repository root and fix what it
   reports on this run's own changes — code, structure, and naming are all in
   scope here, unlike the comment-only cleanup skill, which is why the check
   lives in this pipeline rather than there. A finding on a line this run never
   touched is pre-existing: name it in the report instead of widening the diff.
   Because the fixes are code changes, re-run the repository's verification gates
   afterwards, waited on with the single blocking call above, and treat a failing
   verdict as this step being unfinished. The lint's output is input, not a gate:
   a finding deliberately left standing is reported with its reason, never
   silenced by editing lint configuration.
6. Add changelog work when the repository tracks it. Commit logical scoped
   changes with explicit paths through `my-command-tools commit` when available;
   never sweep in unrelated work. For a multi-line message, write it to a file and
   pass `--message-file <absolute path>` rather than piping a heredoc on stdin — a
   heredoc is refused wholesale inside an isolated worktree, which is where this
   step runs. `1Password: failed to fill whole buffer` with
   `fatal: failed to write commit object` is an unapproved signing prompt, not a
   repository problem: the commit did not happen and the tree is untouched. Retry
   the same commit once after the prompt is approved. Never rewrite the commit,
   pass `--no-gpg-sign`, or change the repo's signing configuration to get
   around it.
7. Use `my-command-tools state` when available for the no-change gate. If the run
   produced no relevant commits or edits, report that the criteria already hold
   and safely remove any worktree.
8. Otherwise run `$clean`, commit any cleanup, then run `$pr`. Run that pair in
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
9. Close the run in a text-only turn: one final message carrying text and zero
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

   Which turn that is depends on how this run was invoked, and there are exactly
   three cases. Invoked directly by the user, this is the outermost run and it
   closes in a text-only turn as above. Invoked inline by another command in the
   same session, as a step of that invoker's own pipeline, it hands back without
   spending a text-only turn: the report and the return marker go out as text in
   the same message that carries the invoker's next tool call, so the turn
   continues into the invoker's next step instead of returning control to the
   user. A text-only turn there ends the whole assistant turn and strands every
   step the invoker still owes, which is how a live pipeline comes to read as
   abandoned. Dispatched as a subagent, it closes in its own text-only turn like
   an outermost run, because its final message is a report to the parent session
   rather than a turn in the parent's conversation. The return marker is written
   exactly once in all three cases, alone on the last line of the message that
   hands control back — never weakened, deferred to a later message, or dropped
   because the turn continues.

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

- `gh`'s GraphQL-backed writes (`gh pr create`, `gh pr edit`) authenticate as
  whichever account is active, and this device is logged in as more than one, so
  a repo owned by another of them answers `must be a collaborator`. That is the
  wrong identity, not a permission to request, and the right account is the
  remote's owner rather than a guess: the repository helper resolves it for its
  own PR write, and reports and selects it for any other `gh` call. Never wrap a
  command in a `GH_TOKEN="$(gh auth token --user …)"` assignment — that shape is
  refused on sight; REST is the remaining fallback.
- Give a multi-line commit message or PR description to the repository helper as
  a **file path**, written with the file-writing tool. Piping one in means
  composing it in the shell, which is a heredoc, which is refused inside an
  isolated worktree.
- If the repository helper answers `command not found`, its shim is not linked
  onto PATH. Reach it at the device install path under the Claude or Codex home
  and run its `doctor` verb through that path, which prints the exact link
  command; do not fall back to hand-rolled git.
- As a narrow exception to the general rule to chain dependent mutations, issue
  branch-lifecycle operations such as checkout/switch, pull, remote-branch
  inspection, and local branch deletion as individual shell calls. Put status
  output, pipes, and follow-up verification in separate read-only calls.
- A classifier refusal is not evidence that repository protections should be
  weakened. Inspect the refused command first; when the intended operation is
  safe and the refusal looks incidental to the command's shape — an over-broad
  chain, pipe, or extra flag — retry only the smallest exact command, never an
  allowlisted Bash pattern or a permission-settings change.
