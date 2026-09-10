---
description: Create or update a PR for the current branch with a concise bulleted description, written directly to GitHub
argument-hint: "[optional title or extra context]"
allowed-tools: Bash(git:*), Bash(gh:*), Bash(my-command-tools:*), Bash(wc:*), Bash(grep:*), Write, Skill, ExitWorktree
---

You have explicit permission to write the PR description directly to GitHub.

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

Parse these off the front of the `<command-args>` block above; everything else is the title/extra context.

- `--draft` / `-d` — mark the PR as a draft. Default is **not** draft.

## Step 1 — Read the state

Read the state: `my-command-tools state`. If `onDefaultBranch` is true, stop and tell me to switch to a feature branch first. Note `worktree` — step 5 needs it.

## Step 2 — Review what changed

Review what changed so the description is accurate. The same `state` output carries `commits` (subject lines since the base) and `diffStat` (per-file added/deleted); pull the actual diff only if those leave you guessing.

## Step 3 — Write the body

Write the PR description — what changed and why, grouped logically. No filler, no "this PR does X" preamble. Lead with the most important changes. Write it with the `Write` tool to `$CLAUDE_JOB_DIR/tmp/pr-body.md`, or any absolute path outside the repo.

<!-- include-block: shared/pr-body-shape.md -->
### The shape

**"Concise" is a measurement here, not a mood.** A PR body that lost to prose was written by an author who agreed with the word and then wrote nine headers and ten paragraphs anyway. These are the numbers that decide it.

- **Bullets only.** A line that is neither a `-` bullet nor a `##` header does not belong in the body. There is no lead-in sentence under a header, no closing summary, no connective prose between sections.
- **The first line is a header, never prose.** A body that opens with a sentence has already started explaining itself.
- **One idea per bullet, one to two sentences.** A bullet past about 40 words is a paragraph wearing a dash: split it into the two ideas it is carrying, or cut the half the reviewer will not act on.
- **Headers only past about 6 bullets, and 4 at most.** Sentence case, 2 to 4 words. A body with more headers than a reviewer can hold is an outline of the author's week, not a map of the diff.
- **Target under 400 words. Past 600 the body is being written for the author rather than the reviewer** — stop and cut, do not reorganize.

**The body is for the reviewer, and it is not a record of the author's work.** This is the failure mode that survives every restatement of "be concise", because each section that causes it feels earned at the time it is written. Requirement-by-requirement compliance notes, verification and gate output, docs inventories, and "what I checked" material each earn **one terse bullet or none**. Any section that exists to prove the task was done belongs in the run's closing turn, where the person who asked for the work is reading — not in the PR, where a reviewer is deciding whether the diff is right.

**The test for any line: would a reviewer who never saw the request act differently for having read it?** If not, it is not a shorter bullet — it is a deleted one.
<!-- /include-block -->

### Cut the slop before publishing

Once the body file exists, run the **`unslop` skill** over it with the `Skill` tool, then apply what it returns to the file. This is a required pass, not a polish step you may decide the draft did not need.

- **`unslop` is a skill, not a slash command.** It does not appear in a `ls ~/.claude/commands/` listing, and its absence from that listing is not evidence it is unavailable. Invoke it with the `Skill` tool and read the result.
- **It is device-local at `~/.claude/skills/unslop`, not shipped in this repo's `skills/` directory**, so this step is conditional: if it is genuinely not installed there, skip it and **say so in the report**. Never substitute a hand-rolled rewrite and call it the pass.

### Count before you publish

Run this over the body file immediately before the `my-command-tools pr` call, and **state the four numbers in the run's report**. A rule that is checked survives; a rule that is only stated does not.

```sh
BODY="/absolute/path/to/pr-body.md"                          # the file you just wrote
wc -w < "$BODY"                                              # target < 400, hard stop 600
grep -o '—' "$BODY" | wc -l                                  # em dashes
grep -o '\*\*[^*]*\*\*' "$BODY" | wc -l                      # bold runs
grep -cvE '^\s*($|[-*] |#{1,6} |```|\|)' "$BODY" || true     # non-bullet, non-header lines
```

**Assign `BODY` in the same call as the counts** — shell state does not survive between calls, so a block that inherits the variable from an earlier one counts nothing and says so in four confusing ways. The two `grep -o … | wc -l` forms count occurrences rather than matching lines, which `grep -c` cannot do even with `-o`; and the last grep takes `|| true` because a compliant body makes it print `0` and exit 1, which is the one outcome the step is aiming for.

A non-zero last count names lines the shape above says do not belong: go back and cut them rather than reporting the number and publishing anyway.

## Step 4 — Publish the PR

Publish it — hand the path over:

```
my-command-tools pr --title "<title>" --body-file <absolute path> [--draft] [--retitle]
```

**`--body-file` is the form, and the shell never sees the prose.** A description is multi-line by nature, so the old `--body -` meant composing a heredoc — a shape refused wholesale inside an isolated worktree, mid-PR, which is exactly where this command runs. A `PreToolUse` gate now refuses `--body -` and names this flag. One call does all the rest: pushes the branch, finds the branch's open PR if it has one, and either creates or edits accordingly. It reports `action` (`created`/`updated`), `number`, and `url`, plus `bodyWarnings` when the body it was handed is over budget or carries no bullets at all — a warning, never a refusal, and a signal to cut before the reviewer sees it.

- Derive the title from the branch/commits unless I provided one in the arguments. On an **existing** PR the title is left alone unless you pass `--retitle` — add it only if the current title is clearly stale or I gave one.
- **A browser-verified branch shows its screenshots on the PR, whether or not the repo is public.** The verb finds the screenshots `/verify` captured for this branch, and publishes them when the `verdict.json` recorded beside them says a **browser** tier took them: a `## Screenshots` section, before/after pairs as a table with one row per view, any unpaired group as a grid. It reports `screenshots` with the count, tier, verdict, and `via`. **The gate is the recorded tier, not the diff or the verdict.**
  - **`via: "body"`** is the public-repo route, reported with `ref` and `commit`.
  - **`via: "comment"`** is the private-repo route: one `gh pr comment --attach` per PR, reused when the images are unchanged, with its URL reported as `comment`. Never post screenshots yourself with `gh pr comment --attach`; the verb handles the path matching.
  - **The comment is checked after it is posted, and `rendered`/`failed` are what to read.** `gh`'s exit code proves a comment exists, not that a reviewer can see anything in it: the body-to-attachment rewrite matches on the reference string, and a mismatch leaves the reference pointing at a path on the author's machine. So the verb reads the comment back, requires every attached file to have a `user-attachments` image URL and no local path left behind, and requests each of those URLs for a 2xx and image bytes. A comment reused from a previous run is checked the same way. `failed` above zero, or any `shotsWarning` about a screenshot not rendering, means the images are up but dead — **report it; do not re-post the comment by hand.**
  - **Say nothing about screenshots when it reports nothing**: a branch with none, and one verified at a non-browser tier, both publish nothing by design. A `shotsWarning` means something could not be published — screenshots with no recorded verdict, which is `/verify` Step 6 having been skipped, a comment `gh` refused, or a posted comment whose images do not render — so name it in the report.
- **Assets already in the description are kept — always.** Before editing, the verb reads the PR's current body and carries every image, video, and GitHub attachment link it finds into the new one, appending any your rewrite left out under an `## Assets` heading. Write the description from the diff as you normally would: don't re-paste assets by hand, don't try to preserve them yourself, and never justify dropping one because it isn't in your bullets. An update reports how many it carried over as `assetsPreserved`.
- Pass `--draft` when `--draft`/`-d` was given. The verb only ever moves a PR *toward* draft; without the flag an existing draft stays a draft rather than being flipped in front of reviewers early.
- **Never take a PR out of draft.** Updating a draft PR updates its body (and title with `--retitle`) and nothing else — its draft state is not yours to change here. Do not run `gh pr ready`, and do not "helpfully" mark it ready because the work looks finished; only `/god` promotes a draft, deliberately, right before merging.
- The verb's own `number`/`url` is the confirmation — **never sleep-poll for the PR to appear** (`sleep 90 && gh pr list …`). A foreground `sleep` is blocked by the harness, and so is a `sleep`-and-check chain; if you genuinely need to wait on a condition, use the `Monitor` tool with an until-loop.
- <!-- include: shared/gh-identity.md -->This device is logged in as more than one GitHub account, and `gh`'s GraphQL-backed writes (`gh pr create`, `gh pr edit`) authenticate as whichever one is active — so on a repo owned by another of them GitHub answers `must be a collaborator`. That is the wrong identity, not a permission to request, and the right account is not a guess: it is the remote's owner. `my-command-tools pr` resolves it internally and reports the `identity` that worked, so nothing extra is needed there. For any other `gh` write, ask the toolkit — `my-command-tools identity` names the `owner`, the `active` account, and the one plain `select` command, and `my-command-tools identity --select` runs it. **Never compose `GH_TOKEN="$(gh auth token --user <login>)" <command>`**: an assignment wrapping a command substitution is refused on shape, and it guesses at a login the remote already states.<!-- /include -->

## Step 5 — Tear down the worktree, if it is yours

If this session is running in a git worktree (`worktree: true` from step 1), teardown is yours **only if this session created that worktree and no command that invoked you owns its teardown**:

- **Dispatched as a subagent? Skip teardown entirely.** `/task --sub` Step 3 runs `/clean` + `/pr` in a fresh subagent and removes the worktree itself once you return; any other command that hands you a workspace it set up works the same way. You are not the owner, `ExitWorktree` will refuse, and `git worktree remove` refuses too while the owning session's liveness lock is live — so don't call either. Report the PR and leave the directory alone.
- **Invoked inline by a command that owns the worktree? Skip it too.** Without `--sub`, `/task` runs `/clean` + `/pr` inline, so you're in the very session that created the worktree and `ExitWorktree` would not refuse — but teardown is still that command's Step 3, immediately after you return, and it has a push check to run first. Report the PR and leave the workspace alone.
- **Otherwise remove it** — the branch is already pushed, so dropping the local copy keeps the branch checkout-able later without losing work. Call the `ExitWorktree` tool with `action: "remove"` **and** `discard_changes: true` in the same call. Expect this task's commits to live on the worktree — step 4 pushed them, so force-removing discards only the redundant local copy, not the remote branch. Passing `discard_changes: true` up front avoids the refuse-then-retry round-trip.
- **If `ExitWorktree` refuses because this session doesn't own the worktree**, don't retry `remove`. <!-- include: shared/worktree-ownership.md -->**Remove a worktree through the same mechanism that created it.** One created by `git worktree add` or `my-command-tools worktree begin` is not owned by the session worktree tool merely because the session later entered it via `EnterWorktree({path})` — `ExitWorktree` refuses to remove it. Step back out with `action: "keep"`, then run `my-command-tools worktree end --branch <branch>` from outside the worktree; it re-verifies the branch reached origin before removing, so push rather than forcing if it refuses. If it refuses because another live session still holds the worktree, stop and report the path as left in place — never force past a live lock. **Whatever removes the worktree, stop the processes rooted in it first.** `worktree end` now does this itself, but `ExitWorktree` does not: a dev server or watcher started inside a worktree outlives the directory, and where the repo symlinks shared state (a log directory, a database) into each worktree, the survivor keeps writing to that shared state through a path that no longer resolves — one whose reads now fail can reconcile the shared store down to empty and make the main checkout look like it has no data. Run `my-command-tools worktree reap --path <worktree path>` immediately before `ExitWorktree({action: "remove"})`, and pass `--no-reap` to `end` only when a survivor is deliberate.<!-- /include --> This is the `/fb --target` and `/review` flow, where the worktree was entered rather than created.
- If NOT in a worktree, skip this step entirely (do not touch the working tree).

## Step 6 — Report back

Report back the PR number and URL, together with the four counts from step 3 and whether the `unslop` pass ran or was skipped for want of the skill. <!-- include: shared/text-only-turn.md -->Deliver that report in this run's **closing turn** — the terminal step below — rather than alongside the tool call that precedes it.<!-- /include -->

## Notes

- Do NOT commit or create new commits — only push existing commits and write the PR metadata. A caller whose commit failed hands back to retry it.
- <!-- include: shared/classifier-refusal.md -->A classifier refusal is not evidence that repository protections should be weakened. Inspect the refused command first; when the intended operation is safe and the refusal looks incidental to the command's shape — an over-broad chain, pipe, or extra flag — retry only the smallest exact command, never an allowlisted Bash pattern or a permission-settings change. **The remedy is always the command's form, and the two recorded shapes each have one:** a chained read-only probe (`head <file>; ls -l <dir>`) is refused as one command and succeeds when reissued as the single bare command you actually needed, so drop the chain rather than the intent — and where the probe was reading a file, `Read` answers it with no shell to judge; a heredoc composing a file is refused wholesale inside an isolated worktree, which is exactly where these runs work, so compose it with `Write` and change it with `Edit` instead of reaching for a quoting trick. **One refusal in this family is correct and stays correct:** a probe that names a `.env` file is refused because of the file, not the shape, and no smaller form of it is the fix — never rewrite it, never allowlist it, and never work around it. If you need a value from `.env`, ask me to run the command myself with `! <command>`.<!-- /include -->

## Close the run in a text-only turn

<!-- include-block: shared/closing-turn.md -->
**Every run states its outcome on the way out, and *how* it states it depends on how this run was invoked.** One mechanic decides all three cases: in Claude Code an assistant message carrying text and **zero tool calls** ends the assistant's turn and hands control back to the user. That is what records a run's outcome — and it is also what strands a parent pipeline when a nested run spends one, because the parent's remaining steps never get a turn to run in.

**Tell which of the three cases this run is in before composing anything, from how it was invoked:**

- **Outermost** — the user invoked this command directly, as the prompt this turn is answering. No other command run encloses it. It **closes in a text-only turn**.
- **Nested inline** — another command invoked this one with the `Skill` tool in this same session, as a step of its own pipeline, and that parent still has steps owed once this one returns. It **hands back without spending a text-only turn**.
- **Subagent** — this run was dispatched with the `Agent` tool (`--sub`, a delegated unit, any Agent-tool dispatch). It has its own conversation, and its final message is a report *to* the parent session rather than a turn *in* the parent's conversation, so nothing of the parent's is waiting behind it. It **closes in a text-only turn**, exactly like an outermost run.

**Outermost and subagent: close in a text-only turn. Never skipped, never delegated.** The run is over when this session sends **one message carrying text and zero tool calls** — not when the work lands. That is the mechanic, not a style preference: a run's outcome is recorded only from a message with no tool call in it, so a message carrying the report *and* a tool call is recorded as a decision mid-run, and a run whose last message is a tool call records no outcome at all. Make the last tool call, let it return, then reply with text alone.

**Nested inline: hand back without spending a text-only turn.** Emit the report and the return marker as **text in the same assistant message that carries the parent's next tool call**, so the turn continues into the parent's next step instead of ending and returning control to the user. A nested run that closes in a text-only turn strands every step its parent still owes — the recorded failure is a `/clean` and a `/pr` nested in one pipeline, where each child's text-only close handed control back before the parent could invoke the next child, run its teardown, or record its own outcome, leaving a live run reading as abandoned. So do not compose a message of text alone here, and do not stop to let the parent speak: say what this run did, write the marker, and make the parent's next call in that same message. The parent's own closing turn is the one that records the outcome for both.

- **Every exit routes here, not just the shipped one.** Finished; nothing to do; a gate still failing; a step blocked, refused, or awaiting my answer; the request abandoned as wrong. The wording changes; which of the three cases applies does not. A run that stopped early says where it stopped and what is on the branch, and leaves `/revive <thread id>` as the recovery path when the proxy thread id is available. A nested run that stopped early still hands back in the parent's turn — it reports the stop as text beside the parent's next call, and the parent decides whether to carry on.
- **Say it in one self-contained line first**, then any detail. Someone who never saw the request should be able to read that line alone.
- **End the message with this run's return marker, alone on the last line, in all three cases:** the word `RETURN` in capitals, a space, then the name this run was invoked under, leading slash and all — `RETURN /<command>`, carrying whatever namespace prefix that invocation carried. Written **exactly once**, on the last line of the message that hands control back, whether that message is a text-only close or a nested handback riding the parent's next tool call. The marker is the only record of where a run handed control back, so it is never weakened, deferred to a later message, or dropped because the turn continues: without it a nested run's span runs on to the next nested invocation, or to the end of the transcript for the last one, and that run is charged with everything its host did after it returned. **A run that ends abnormally never reaches this step and writes no marker**, so its span still runs to the end of the transcript: the marker makes the normal exit exact and leaves the abnormal one exactly as it already was.
- **A compaction boundary is a checkpoint, not an ending.** A recap prompt ("The user stepped away and is coming back…"), a `[SYSTEM NOTIFICATION - NOT USER INPUT]` event, or a session-continuation preamble each mean the run is still owed its turn: answer that prompt in text alone, say where the run actually stands, and restore the anchor todo item if it did not survive. A session is likeliest to die just after a compaction, so that answer is often the only outcome the run ever records. **Each side of the boundary records its own standing**, because a run split across two transcripts is two runs to the record: one that carried a PR across a boundary and closed on neither side reads as two abandoned runs, not one shipped one.
- **Every prompt from me opens a task, and only a text-only reply closes it.** The transcript starts a new `## Task:` at each of my messages — a mid-run question, a correction, a recap prompt, a change of direction — and writes `- done:` only when a reply carries text and no tool call. So answer my message in text alone *before* returning to tool calls. That is true even inside a nested run: my message is addressed to the session, not to whichever command currently holds it. A run that reads the message and keeps working straight through leaves that task, and every task before it, with no outcome line. There is no `- done:` marker to type: that line is written for you from any text-only turn, and skipped entirely from a turn that carries a tool call.
- **A reply to another session is not this turn either.** `SendMessage` is a tool call, so a run whose whole job was answering another agent records no outcome when that reply is the last thing it sends. Send the reply, let it return, then close in text alone — even when the closing message says much what the reply already said.
- **A subagent's report is never the dispatching run's turn.** The outcome belongs to the session the run started in, so after an `Agent` call returns, close that run in a message of your own.
- **Resolve the anchor before the message is composed, never as a call after it.** Mark the anchor todo item completed in the same tool-call turn as the run's last piece of real work, so nothing is left scheduled when that turn returns and the run's next action is the message itself. Marking it as a standalone final call is the recorded way this step fails: the mark lands every time, the message does not, and the run records no outcome. Handing back with it still open reads as abandoned, so close it — alongside a call you were already making, never as a turn of its own.
- **Do not tack the report onto the tool call before it — in the two closing cases.** `ExitWorktree`, `worktree end`, `verify`, and a closing `gh` call are exactly the calls that sit at the end of an outermost or subagent run and swallow the outcome. The nested handback is the deliberate exception and the only one: there the report rides the parent's **next** call, which is what keeps the parent's turn alive.
<!-- /include-block -->
