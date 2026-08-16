---
description: Take a task all the way to merged — run /my-command:task (with /my-command:review woven in), resolve conflicts with /my-command:mc, wait for CI, merge the PR into main, and pull main. No human in the loop.
argument-hint: "[--here|-h] [--base <branch>] [--into <branch>] [--add|-a <list>] [--squash|--merge|--rebase] [--auto] [--fix <n>] [--no-review] <task criteria>"
---

`/my-command:task` plus the last mile: `/my-command:task` takes the criteria to a reviewed, open PR; this command gets that PR mergeable and green, merges it into `main`, and pulls the new `main` down. No human in the loop.

Input is the text in the `<command-args>` block above. Parse leading flags off the front; everything else is the **task criteria**, handed to `/my-command:task` verbatim.

**Announce at start**: the criteria, the merge method, whether review is woven in, and that this run will merge to `main` without asking again. Invoking `/my-command:god` is standing permission to merge this run's own PR.

<!-- include: shared/closing-turn-anchor.md -->**Before the first tool call, anchor the way this run ends.** Put "close the run in a text-only turn" in the harness todo/task list as its own final item — worded on its own, never folded into the work it follows. The todo list is live session state that a compaction carries forward; this prompt is not, so once this run is summarized that item is the only surviving record that an outcome is still owed. **A run another command invoked inline with the `Skill` tool anchors its handback instead**, worded as "hand back to the invoking command in its next turn": a nested run that spends a text-only turn ends the whole assistant turn and strands every step its parent still owes, so the item it carries must not tell it to. A run the user invoked directly, and one dispatched as a subagent, both anchor the text-only close. **Resolve the item in the same tool-call turn as the run's last piece of real work** — the teardown, the final `verify`, the closing `gh` call — so the anchor is already marked completed when that turn returns and the only thing left for the run to do is speak. **Never leave marking it as a call of its own after the work ends.** A run whose last scheduled action is a bookkeeping tool call ends on that call: the mark lands, the message that was meant to follow it does not, and the run records no outcome — the exact failure this anchor exists to prevent, arriving through the anchor itself. Compose the closing message against a task list that is already clean, and if the anchor somehow survives the work, close it alongside whatever you are already calling rather than scheduling a turn for it — a still-open anchor is never a reason to end the run on a tool call.<!-- /include -->

<!-- include-block: shared/step-marker.md -->
### Mark each step as you enter it

**Open every step with its marker, on the first line of the message that enters it:** the word `STEP` in capitals, the number written in the `## Step …` heading you are entering, a slash, and how many `## Step …` headings this command declares — `STEP <n>/<N>`. The marker states the step outright, so the record of this run anchors it exactly instead of inferring it from the words around it.

- **Take `<n>` from the heading, not from a count of the steps you have finished.** `## Step 1.5 — …` writes `1.5` and keeps the fraction. A command whose headings start at `## Step 0 — …` writes `0` for its first step. `<N>` is the number of `## Step …` headings in this command, counting a `Step 0` and a `Step 1.5` like any other.
- **A command with no `## Step …` headings has no marker to write.** A single `## Steps` list declares nothing to anchor against, so open those runs in prose alone.
- **Write the marker on entry, once.** Continuing inside a step you already opened writes nothing. Re-entering a step after a correction writes it again, because that is an entry.
- **Keep naming the step in prose as well.** Every run recorded before this marker existed is read from that prose, and the prose is still the only reading for any message the marker is missing from. Dropping it to save a line costs the fallback and buys nothing.
<!-- /include-block -->

## Flags

Forwarded to `/my-command:task` untouched: `--here` / `-h`, `--base <branch>` (the **cut point** — where the branch is cut from, and nothing else), `--add` / `-a <list>` (this command appends its own `review` entry after any entries you pass).

Always added to the `/my-command:task` invocation, whether or not you pass it: **`--sub`** — `/my-command:task` runs `/my-command:clean` + `/my-command:pr` inline by default, and this command needs that stage to be one subagent, because that is where the woven-in `review` entry lands and where an unattended run should keep the reviewer's context off this conversation. Passing `--sub` / `-s` yourself is accepted and redundant.

Owned here:

- `--into <branch>` — the **merge target**: the branch this run's PR is merged into, and the branch Step 7 pulls. **Independent of `--base`, and never inherited from it** — `--base` says where the branch was cut, `--into` says where it lands, and a run that wants both says both (`--base release/2.0 --into release/2.0`). Absent `--into` the merge target is the default branch, so every invocation written before this flag behaves exactly as it did. With `--into <branch>`: Step 4 conflict-tests against `<branch>`, retargets the PR onto it if `/my-command:pr` opened it elsewhere, Step 6 merges into it, and Step 7 pulls it.
- `--squash` (default) / `--merge` / `--rebase` — method handed to `gh pr merge`. Mutually exclusive.
- `--auto` — don't wait on CI. Enable auto-merge and finish; the `main` pull is skipped and the PR is reported as queued.
- `--fix <n>` — auto-repair rounds spent on red CI. Default `1`; `0` disables repair.
- `--no-review` — don't weave `/my-command:review` into the `/my-command:task` run.
- `--draft` / `-d` — **rejected**: a draft can't merge. Stop and say to use `/my-command:task -d` instead.
- Anything not a recognized flag is task criteria.

## Step 1 — Preconditions

**Never ask a question — this command runs unattended.** If any precondition below is unmet or unresolvable, error out and explain what is missing and why the run cannot proceed.

1. `my-command-tools doctor` — confirms `git` and `gh` are both available. Then `gh auth status` for authentication, which `doctor` doesn't check.
2. `my-command-tools state` — one call covers the rest: it errors if this isn't a git repo, and reports `branch` (the starting branch), `root` (the **main checkout path** — Step 7 pulls the merge target there, and by then `/my-command:task` may have torn down the worktree this started in), and `defaultBranch`. `main` below is shorthand for that.
   - **Resolve the merge target here, once**: `<branch>` from `--into` when it was given, the default branch otherwise. Steps 4, 6 and 7 all act on that one branch, and nothing else in the run reads `--into`.
   - When `worktree` is true, `root` is the worktree's root, not the main checkout. Resolve the main checkout separately in that case: `git rev-parse --path-format=absolute --git-common-dir`, minus `/.git`.
3. The criteria are specific enough to act on and no mutually exclusive flags conflict.

## Step 2 — Run `/my-command:task`, with `/my-command:review` woven in

<!-- include-block: shared/batched-discovery.md -->
### Discovery runs as one batched pass

This is a step of the workflow, not a habit to recall. Run it whenever a phase of this command has to look at more than one file.

1. **Enumerate before reading.** Name every path, pattern, and read-only probe the phase needs. Where naming them takes a search — `rg --files`, `git diff --name-only`, a PR's file list — that search is the phase's first call, and its output *is* the enumeration.
2. **Send the whole enumeration in one turn.** Every `Read`, `rg`, `ls`, and read-only `git` call on that list goes out as parallel tool calls in a single assistant turn. Only a call whose arguments depend on another call's result may wait for the next turn. "I will decide what to read after this one" is not a dependency when the path was already on the list, and four or more consecutive read-only calls with no decision between them means the enumeration was skipped.
3. **Never loop per file.** One `Read` per entry of a list you already hold, or one `git diff <base> -- <path>` per path, is the shape this step exists to stop. Pass every path to a single `git diff <base>...HEAD -- <path> <path> …`, and send every `Read` as one block. Reviews and doc audits are where the loop reappears, because there the file list arrives complete and then gets walked.
4. **Read each file once.** A file already in this session's transcript is already in context, and wanting a *different* symbol from it is not a reason to read it again. Locate every symbol you now want with one `rg -n 'foo|bar' <file>`, then pull only the range you still need with numeric `offset`/`limit`. The one legitimate re-read is after the file actually changed — your own `Edit`, a hook, a formatter, a generator, or another agent — and then only the changed range.
5. **Re-establish the read-before-write precondition after a compaction.** `Edit` and `Write` reject a file this *session* has not read. Inherited context, a continuation summary, and shell output do not satisfy that precondition, even though the summary reads as though they do. So after any compaction boundary, session continuation, or hand-off into this command, treat the precondition as unmet: enumerate the files the next edit pass will write, `Read` them in one batch (a targeted `offset`/`limit` slice counts), and edit only once that batch returns. Re-running the rejected `Edit` cannot clear the error — the batched `Read` is the fix, and doing it for the whole pass at once is what stops the same rejection repeating file after file.
<!-- /include-block -->

Invoke `/my-command:task` with **`--sub`**, the forwarded flags, and the criteria; it owns the whole branch → implement → verify → `/my-command:clean` → `/my-command:pr` → teardown pipeline. Don't re-implement any of it here. `--sub` is what makes `/my-command:task`'s `/my-command:clean` + `/my-command:pr` stage a single fresh subagent, so the `review` entry below has a subagent to land in.

Unless `--no-review` was given, append this entry to `/my-command:task`'s `--add` list (after any entries I passed, so mine keep their order):

```
review after /my-command:pr has opened or updated the PR, run /my-command:review --here in that same subagent before any teardown, and carry /my-command:review through to its own end there — including running the /my-command:fb it emits, if it emits one. Show the reviewer's output verbatim. Never hand remaining review work back to the parent.
```

`/my-command:review` resolves both of its outcomes in place, so nothing comes back here as pending review work.

Then:

- **`/my-command:task` reports no changes and no PR** (criteria already satisfied) → skip to Step 8. No PR, no merge, don't touch `main`.
- **Otherwise** capture the branch name and PR number/URL from its report.

## Step 3 — Resolve the PR

Re-resolve from git rather than trusting the hand-off text: `gh pr view <branch> --json number,url,headRefName,baseRefName,state,isDraft,mergeable`.

- Only act on the PR whose `headRefName` is **this run's branch**. Never merge a PR this run did not create or update.
- Draft (a `--draft` slipped through an inner command) → `gh pr ready <number>` first.
- Already `MERGED` → skip to Step 7.

## Step 4 — Make it mergeable (`/my-command:mc` on conflict)

**Point the PR at the merge target first.** Step 3 already read `baseRefName`; when it is not the merge target, retarget the PR with `gh pr edit <number> --base <merge target>` in its own call before anything below. `/my-command:pr` opens every PR against the default branch by design and is left untouched as the PR wrapper, so under `--into` this is the step that makes the PR's base true. It has to run before `/my-command:mc`, which resolves a branch's base from that same open PR. A PR already based on the merge target is left alone.

The merge target may have moved while `/my-command:task` worked. Test **locally** — `git fetch origin`, then `git merge-tree --write-tree <merge target> <branch>`; GitHub's `mergeable` is lazy and reports `UNKNOWN` for a fresh branch.

- **No conflict** → Step 5.
- **Conflict** → run **`/my-command:mc -t <branch>`**. If it puts the branch in its 🔴 "needs human" list, **stop**: report the branch, the files, and why, and leave the PR open. That is the one failure this command cannot drive through.
- After a successful `/my-command:mc` the branch has new commits, so Step 5 waits on the new CI run, not the stale one.

## Step 5 — Get it green

- **`--auto`** → skip the wait; Step 6 hands the merge to GitHub.
- **Otherwise** → `gh pr checks <number> --watch --fail-fast`. A PR with no required checks returns immediately; that's a pass.
- **Never wait by sleeping.** `--watch` is the wait — a foreground `sleep` is blocked by the harness, and so is polling with `sleep N && gh pr checks …`. If a condition needs waiting on outside `--watch`, use the `Monitor` tool with an until-loop.

Red, with repair budget (`--fix <n>`, default `1`) left:

1. Collect the failure: `gh pr checks <number>` for which check, `gh run view <run-id> --log-failed` for why.
2. Spend a round: **`/my-command:fb -t <branch> <the failing check, the error, and what needs to change>`**.
3. Re-run the wait; decrement the budget.

Budget exhausted with CI still red → **stop**: report the failing checks and rounds spent, leave the PR open. Never merge a red PR; never reach for `--admin`.

## Step 6 — Merge into the merge target

Merge through GitHub so branch protection is honored — never push to the merge target directly. `gh pr merge` merges the PR into its own base, and Step 4 has already made that base the merge target, so the merge command itself takes no extra flag:

<!-- include-block: shared/merge-command-forms.md -->
### Merge command forms

The merge steps are where this pipeline's failed shell calls concentrate, and almost every one is a rejected merge re-issued verbatim. Read the error text and branch on it; never send the same call twice.

- **Merging a PR into the default branch** is `gh pr merge <number> --<method>`, issued **once**, and **never with `--delete-branch`**. That flag runs a local branch cleanup after the merge, which fails with `fatal: '<default>' is already used by worktree at …` on any device that keeps the default branch checked out — so the merge lands and the call still exits 1, reporting a failure for work that succeeded. Delete the branch as its own step instead: `my-command-tools worktree end --branch <branch>` for the local worktree and branch, and `git push origin --delete <branch>` for the remote ref, each in its own call. Its rejections are states, not usage errors:
  - `Merge already in progress`, or a failing `mergePullRequest` GraphQL call — GitHub accepted a merge and is still processing it. **Do not re-issue it.** Read the outcome instead: `my-command-tools prs view <number>`, whose result already carries `state`, `mergedAt`, and `mergeStateStatus`. `MERGED` is success, and the run continues at its next step. Only a PR that settles back to `OPEN` is merged again, and then once.
  - Pending required checks — a wait, not a refusal. Re-issue the identical command **with `--auto`** and record the PR as queued.
  - `not mergeable`, `BLOCKED`, or `BEHIND` — the default branch moved. Run `/my-command:mc -t <branch>`, then retry the merge once.
  - Never reach for `--admin`, `gh api -X PUT .../merge`, or a `GH_TOKEN=` re-run to get past any of these.
- **Merging the default branch into a branch** addresses a worktree by path rather than by changing directory: `git -C <path> merge --no-edit origin/main`, `git -C <path> diff --name-only --diff-filter=U`, `git -C <path> push origin HEAD`. `cd <dir> && git …` is the recorded failure, because a worktree session is rarely where that path resolves. The toolkit takes the path as a flag for the same reason: `my-command-tools verify --cwd <path>`.
- A refusal that comes from the harness rather than from `gh` is final. Surface it and carry on with the rest of the run.
<!-- /include-block -->


- `--auto` → `gh pr merge <number> --<method> --auto`; record as **queued**.
- Otherwise → `gh pr merge <number> --<method>`; record as **merged**.
  - Rejected for pending required checks → re-run the same command **with `--auto`** and record as queued.
  - Rejected as **not mergeable** (the merge target moved) → back to Step 4 once, then retry. Twice in a row means a human is needed — stop and report.
- Then delete the merged branch, in its own call: `git push origin --delete <branch>` for the remote ref. Skip it for a **queued** PR — nothing has landed yet.

## Step 7 — Pull the merge target

Skip for a **queued** PR — nothing has landed; say so in the report instead.

In the **main checkout** recorded in Step 1 (not a worktree — `/my-command:task` removed the one it made), acting on the merge target resolved in Step 1 — the default branch, or `<branch>` under `--into`:

1. `git checkout <merge target>`
2. `git pull --ff-only origin <merge target>` — if the fast-forward fails, stop and report; the local merge target has diverged and needs a human.
3. `git fetch --prune`, and delete the merged local branch if one is left behind (`git branch -d <branch>`; never `-D`).

Under `--here` this leaves you on the merge target rather than the branch you started on — that branch is merged and deleted. Say so in the report.

## Step 8 — Report

One concise summary. <!-- include: shared/text-only-turn.md -->Deliver that report in this run's **closing turn** — the terminal step below — rather than alongside the tool call that precedes it.<!-- /include --> It covers: branch and PR number/URL; the merge target, named, and whether the PR had to be retargeted onto it; what `/my-command:review` found and what was applied (or clean / skipped); whether `/my-command:mc` ran and on which files; CI green first try or the repair rounds spent; and the outcome — ✅ merged into the merge target and pulled, ⏳ queued for auto-merge, or 🔴 stopped with the reason and the PR left open. On a no-change run: no PR was opened, and what established that.

## Notes

- **No human in the loop is the point.** Never stop to confirm anything you have a defined path for — including the merge. Do stop for the four things with no safe automatic answer: an unresolvable `/my-command:mc` conflict, CI still red after the repair budget, a diverged local merge target, and a PR that isn't this run's.
- **`/my-command:task` owns the branch, the commits, the PR, and the teardown.** This command adds only the last mile — never implement, commit, or clean up here.
- Never commit or push to the merge target directly, never use `--admin`, never force-push.
- <!-- include: shared/approval-own-call.md -->**A command that may need approval goes in its own Bash call** — `git fetch`, `git config`, and, as a narrow exception to the general rule to chain dependent mutations, branch-lifecycle operations such as checkout/switch, pull, remote-branch inspection, and local branch deletion. Folding one into an `&&` chain escalates approval to the whole compound command and costs a turn plus a retry. Put status output, pipes, and follow-up verification in separate read-only calls.<!-- /include -->
- <!-- include: shared/classifier-refusal.md -->A classifier refusal is not evidence that repository protections should be weakened. Inspect the refused command first; when the intended operation is safe and the refusal looks incidental to the command's shape — an over-broad chain, pipe, or extra flag — retry only the smallest exact command, never an allowlisted Bash pattern or a permission-settings change.<!-- /include -->
- <!-- include: shared/refusal-final.md -->A refusal of a **PR merge or a remote-ref deletion is final.** Surface it to the human and carry on with the rest of the work. Re-expressing the same operation is refused for the same reason and costs a second turn: `gh api -X PUT .../pulls/N/merge` is `gh pr merge`, and `gh api --method DELETE .../git/refs/heads/...` is `git push origin --delete`, so neither is a narrow retry — nor is re-running one under `GH_TOKEN=...`.<!-- /include --> Steps 6 and 7 are where this fires: `gh pr merge`, `git push origin --delete`, and `git branch -d`.

## Close the run in a text-only turn

<!-- include-block: shared/closing-turn.md -->
**Every run states its outcome on the way out, and *how* it states it depends on how this run was invoked.** One mechanic decides all three cases: in Claude Code an assistant message carrying text and **zero tool calls** ends the assistant's turn and hands control back to the user. That is what records a run's outcome — and it is also what strands a parent pipeline when a nested run spends one, because the parent's remaining steps never get a turn to run in.

**Tell which of the three cases this run is in before composing anything, from how it was invoked:**

- **Outermost** — the user invoked this command directly, as the prompt this turn is answering. No other command run encloses it. It **closes in a text-only turn**.
- **Nested inline** — another command invoked this one with the `Skill` tool in this same session, as a step of its own pipeline, and that parent still has steps owed once this one returns. It **hands back without spending a text-only turn**.
- **Subagent** — this run was dispatched with the `Agent` tool (`--sub`, a delegated unit, any Agent-tool dispatch). It has its own conversation, and its final message is a report *to* the parent session rather than a turn *in* the parent's conversation, so nothing of the parent's is waiting behind it. It **closes in a text-only turn**, exactly like an outermost run.

**Outermost and subagent: close in a text-only turn. Never skipped, never delegated.** The run is over when this session sends **one message carrying text and zero tool calls** — not when the work lands. That is the mechanic, not a style preference: a run's outcome is recorded only from a message with no tool call in it, so a message carrying the report *and* a tool call is recorded as a decision mid-run, and a run whose last message is a tool call records no outcome at all. Make the last tool call, let it return, then reply with text alone.

**Nested inline: hand back without spending a text-only turn.** Emit the report and the return marker as **text in the same assistant message that carries the parent's next tool call**, so the turn continues into the parent's next step instead of ending and returning control to the user. A nested run that closes in a text-only turn strands every step its parent still owes — the recorded failure is a `/my-command:clean` and a `/my-command:pr` nested in one pipeline, where each child's text-only close handed control back before the parent could invoke the next child, run its teardown, or record its own outcome, leaving a live run reading as abandoned. So do not compose a message of text alone here, and do not stop to let the parent speak: say what this run did, write the marker, and make the parent's next call in that same message. The parent's own closing turn is the one that records the outcome for both.

- **Every exit routes here, not just the shipped one.** Finished; nothing to do; a gate still failing; a step blocked, refused, or awaiting my answer; the request abandoned as wrong. The wording changes; which of the three cases applies does not. A run that stopped early says where it stopped and what is on the branch, and leaves `/my-command:revive <thread id>` as the recovery path when the proxy thread id is available. A nested run that stopped early still hands back in the parent's turn — it reports the stop as text beside the parent's next call, and the parent decides whether to carry on.
- **Say it in one self-contained line first**, then any detail. Someone who never saw the request should be able to read that line alone.
- **End the message with this run's return marker, alone on the last line, in all three cases:** the word `RETURN` in capitals, a space, then the name this run was invoked under, leading slash and all — `RETURN /<command>`, carrying whatever namespace prefix that invocation carried. Written **exactly once**, on the last line of the message that hands control back, whether that message is a text-only close or a nested handback riding the parent's next tool call. The marker is the only record of where a run handed control back, so it is never weakened, deferred to a later message, or dropped because the turn continues: without it a nested run's span runs on to the next nested invocation, or to the end of the transcript for the last one, and that run is charged with everything its host did after it returned. **A run that ends abnormally never reaches this step and writes no marker**, so its span still runs to the end of the transcript: the marker makes the normal exit exact and leaves the abnormal one exactly as it already was.
- **A compaction boundary is a checkpoint, not an ending.** A recap prompt ("The user stepped away and is coming back…"), a `[SYSTEM NOTIFICATION - NOT USER INPUT]` event, or a session-continuation preamble each mean the run is still owed its turn: answer that prompt in text alone, say where the run actually stands, and restore the anchor todo item if it did not survive. A session is likeliest to die just after a compaction, so that answer is often the only outcome the run ever records. **Each side of the boundary records its own standing**, because a run split across two transcripts is two runs to the record: one that carried a PR across a boundary and closed on neither side reads as two abandoned runs, not one shipped one.
- **Every prompt from me opens a task, and only a text-only reply closes it.** The transcript starts a new `## Task:` at each of my messages — a mid-run question, a correction, a recap prompt, a change of direction — and writes `- done:` only when a reply carries text and no tool call. So answer my message in text alone *before* returning to tool calls. That is true even inside a nested run: my message is addressed to the session, not to whichever command currently holds it. A run that reads the message and keeps working straight through leaves that task, and every task before it, with no outcome line. There is no `- done:` marker to type: that line is written for you from any text-only turn, and skipped entirely from a turn that carries a tool call.
- **A reply to another session is not this turn either.** `SendMessage` is a tool call, so a run whose whole job was answering another agent records no outcome when that reply is the last thing it sends. Send the reply, let it return, then close in text alone — even when the closing message says much what the reply already said.
- **A subagent's report is never the dispatching run's turn.** The outcome belongs to the session the run started in, so after an `Agent` call returns, close that run in a message of your own.
- **Resolve the anchor before the message is composed, never as a call after it.** Mark the anchor todo item completed in the same tool-call turn as the run's last piece of real work, so nothing is left scheduled when that turn returns and the run's next action is the message itself. Marking it as a standalone final call is the recorded way this step fails: the mark lands every time, the message does not, and the run records no outcome. Handing back with it still open reads as abandoned, so close it — alongside a call you were already making, never as a turn of its own.
- **Do not tack the report onto the tool call before it — in the two closing cases.** `ExitWorktree`, `worktree end`, `verify`, and a closing `gh` call are exactly the calls that sit at the end of an outermost or subagent run and swallow the outcome. The nested handback is the deliberate exception and the only one: there the report rides the parent's **next** call, which is what keeps the parent's turn alive.
<!-- /include-block -->
