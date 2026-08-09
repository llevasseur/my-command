---
description: Take a task from criteria to PR — set up an isolated branch/worktree, implement, then /my-command:clean and /my-command:pr (inline, or in one subagent with --sub)
argument-hint: "[--here|-h] [--base <branch>] [--draft|-d] [--sub|-s] [--add|-a <command + prompt>[, <command + prompt>]] <task criteria>"
---

Take a task from a plain-language description all the way to an open PR — feature, bug fix, update, refactor, anything. The end goal is always a PR, and I always run `/my-command:clean` before `/my-command:pr`.

The task is the text in the `<command-args>` block above. Parse leading flags off the front; everything else is the **task criteria**.

**The git plumbing runs through `my-command-tools`.** Every verb prints JSON on stdout — read the fields rather than re-deriving them with your own `git` calls. If the CLI isn't on PATH, run `my-command-tools doctor` and report what it says instead of falling back to hand-rolled shell.

<!-- include-block: shared/step-marker.md -->
### Mark each step as you enter it

**Open every step with its marker, on the first line of the message that enters it:** the word `STEP` in capitals, the number written in the `## Step …` heading you are entering, a slash, and how many `## Step …` headings this command declares — `STEP <n>/<N>`. The marker states the step outright, so the record of this run anchors it exactly instead of inferring it from the words around it.

- **Take `<n>` from the heading, not from a count of the steps you have finished.** `## Step 1.5 — …` writes `1.5` and keeps the fraction. A command whose headings start at `## Step 0 — …` writes `0` for its first step. `<N>` is the number of `## Step …` headings in this command, counting a `Step 0` and a `Step 1.5` like any other.
- **A command with no `## Step …` headings has no marker to write.** A single `## Steps` list declares nothing to anchor against, so open those runs in prose alone.
- **Write the marker on entry, once.** Continuing inside a step you already opened writes nothing. Re-entering a step after a correction writes it again, because that is an entry.
- **Keep naming the step in prose as well.** Every run recorded before this marker existed is read from that prose, and the prose is still the only reading for any message the marker is missing from. Dropping it to save a line costs the fallback and buys nothing.
<!-- /include-block -->

## Flags

- `--here` / `-h` — do NOT create a worktree. Work on the **current branch** as it is now.
- `--base <branch>` — branch off `<branch>` instead of `main`. Ignored when `--here` is set.
- `--draft` / `-d` — open the resulting PR as a draft. Passed straight through to `/my-command:pr` in step 3. Default is **not** draft. It does **not** keep the worktree around — step 3's teardown still removes it.
- `--sub` / `-s` — run Step 3's `/my-command:clean` + `/my-command:pr` stage in **one fresh subagent** instead of inline. Default is **inline**: this command spawns no subagents of its own unless you ask for one.
- `--add` / `-a` — register one or more commands available to the user for the agent to weave into this `/my-command:task` run, each paired with a prompt that guides its use. See Step 0 below.
- Anything not a recognized flag is part of the task criteria.

### Parsing `--add`

`--add` takes a **comma-separated list** of entries. Each entry names a user-available command followed by a plain-language prompt describing how it relates to this run. There is no separate timing flag; the agent running `/my-command:task` interprets the prompt and decides whether and when to invoke the command.

- The leading command token identifies the command to invoke; a leading `/` is optional. The rest of the entry is the prompt associated with that command.
- Entries are separated by a comma that precedes the next command. A comma inside an associated prompt (not followed by a command) stays part of that prompt.

## Step 0 — Incorporate added commands

Run this step only when `--add` / `-a` is present, before setting up the workspace or starting the task pipeline.

1. Use the command discovery available in the current session and on the user's device to resolve every command named in the `--add` list, including user, project, and plugin commands. Base the result on what is actually installed and available; do not infer availability from a command's name.
2. Skip any list entry whose command cannot be found. An unavailable added command does not block the task.
3. Load each available command's instructions into the current context without invoking it. Combine those instructions with the prompt associated with that list entry so the agent running `/my-command:task` can determine whether, when, and how the command belongs in this run.
4. Update the pipeline in context with the resulting command steps. Added commands interleave with the built-in steps and never replace them. Preserve list order when multiple added commands belong at the same point.
5. Report the updated pipeline, including where each available added command fits. Then continue with Step 1 and follow the updated pipeline through completion.

Honor any condition implied by an associated prompt at the relevant point. If it does not hold, skip that command and say why. If the prompt is too vague to determine safe usage, ask one focused question before invoking that command. If an available command is invoked and fails, stop and surface the failure rather than silently continuing.

## Step 1 — Set up the workspace

Put this run's steps in the harness's todo/task list first, before `state`, before the worktree, before anything. <!-- include: shared/closing-turn-anchor.md -->**Before the first tool call, anchor the closing turn.** Put "close the run in a text-only turn" in the harness todo/task list as its own final item — worded on its own, never folded into the work it follows. The todo list is live session state that a compaction carries forward; this prompt is not, so once this run is summarized that item is the only surviving record that an outcome is still owed. **Resolve it in the same tool-call turn as the run's last piece of real work** — the teardown, the final `verify`, the closing `gh` call — so the anchor is already marked completed when that turn returns and the only thing left for the run to do is speak. **Never leave marking it as a call of its own after the work ends.** A run whose last scheduled action is a bookkeeping tool call ends on that call: the mark lands, the message that was meant to follow it does not, and the run records no outcome — the exact failure this anchor exists to prevent, arriving through the anchor itself. Compose the closing message against a task list that is already clean, and if the anchor somehow survives the work, close it alongside whatever you are already calling rather than scheduling a turn for it — a still-open anchor is never a reason to end the run on a tool call.<!-- /include --> Here that item is Step 4, never folded into "open the PR" or "tear down the worktree".

Decide where the work happens **before** touching any code. Base every workspace decision on **live** git state — `my-command-tools state` — never the session's startup snapshot, which can be stale. It reports `branch`, `defaultBranch`, `onDefaultBranch`, `worktree`, and the `base` it resolved.

If the repo being changed is not the repo this session started in, prefer starting a new session in the target repo. Otherwise, do not use `EnterWorktree`: run `my-command-tools worktree begin` in the target repo, do all work through absolute paths under its returned `path`, then tear down with `my-command-tools worktree end`, which re-verifies the branch reached origin before removing it. The `EnterWorktree` directions below apply only when the target and session-start repo are the same.

- **Default (no flags):** create a fresh worktree branched off the latest `main`.
  - Derive a branch name from the criteria: `<type>/<kebab-summary>`, where `<type>` is `feat` (new feature), `fix` (bug fix), `chore` (maintenance/refactor), or `docs` (docs only). Keep the summary short and specific (e.g. `fix/artifact-panel-scroll`).
  - `my-command-tools worktree begin --branch <name> --bootstrap`. It fetches first, so the branch lands on the freshest `origin/<default-branch>` rather than a stale local ref, and it reports the `path` it created and the `base` it used.
  - Switch into that `path` with the `EnterWorktree` tool. The verb prepares the checkout; moving this session into it is `EnterWorktree`'s job. <!-- include: shared/enter-worktree.md -->**The working form is `EnterWorktree({path: "<absolute path>"})`, with the path copied byte for byte from the `path` field `worktree begin` just printed.** Enter the checkout that already exists — that is what the `path` argument is for — and never call it with `name`, which asks the tool to create a *new* worktree and is refused for a session that has already made one another way. A relative path, or one reassembled from the branch name, is not in `git worktree list` and is rejected the same way. Make that one call and read its result; a refusal here describes how the worktree was created, so do not retry it and do not reinvent an absolute-path workaround from scratch — fall back to working through absolute paths under `path`, which is the documented cross-repo mode. **Decide teardown with entry, because it is not `ExitWorktree({action: "remove"})`:** a worktree `my-command-tools worktree begin` created is not the session tool's to remove, so step out with `ExitWorktree({action: "keep"})` and then run `my-command-tools worktree end --branch <branch>` from outside the path.<!-- /include -->
  - **This counts as an explicit worktree request.** ALWAYS create the worktree, even in a background/in-place session under `worktree.bgIsolation: "none"`. Do not work in place on the default path — that requires the explicit `--here` / `-h` flag.
- **`--base <branch>` given:** add `--base <branch>` to the same `worktree begin` call, then `EnterWorktree` by `path` as above.
- **`--here` / `-h` given:** stay on the current branch — no worktree.
  - Check `state` first. If `onDefaultBranch` is true, don't implement on `main` — create a feature branch in place (`git checkout -b <type>/<kebab-summary>`) and tell me you did.

## Step 1.5 — Bootstrap the worktree

**Skip this entirely for `--here`** (the current checkout is already bootstrapped). A fresh worktree has no `node_modules`, no `.env` files, and no generated code — without them `tsc`/`biome`/tests silently under-check or fail outright, so do this **before** implementing.

`--bootstrap` in Step 1 already ran the repo's own `scripts/bootstrap-worktree.sh` if it has one. Read the result off that same JSON:

- `bootstrapScript` is a path and `bootstrapped.ok` is true → the repo bootstrapped itself. Nothing more to do.
- `bootstrapped.ok` is false → the repo's own bootstrap failed. Report `bootstrapped.output` and fix that; don't paper over it with the generic fallback.
- `bootstrapScript` is `null` → the repo has no bootstrap of its own. Check for a "Worktree Setup" section in `AGENTS.md`/`CLAUDE.md` and follow it; if there's nothing there either, do the generic equivalent below. This command must not hardcode any one repo's paths.

The generic fallback:

- **Symlink the gitignored `.env` files** from the main checkout so env stays a single source of truth (never copy or edit — I manage the values). The main checkout is the repo root the worktree branched from; link each `.env` that exists there at the same relative path.
- **Install dependencies:** run the repo's install (`pnpm install` / `npm ci` / etc.) at the worktree root.
- **Generate lazily — only what the task touches.** Generated code (Prisma clients, GraphQL `__generated__` types, route trees) is derived from schema files in *this* worktree, so regenerate it here — **never symlink or copy it in** (a symlink reflects the wrong branch or corrupts the main checkout when written through; a copy goes stale and hides schema drift). Find the repo's generate commands in its `package.json` scripts. Docs-only tasks can skip generation.

Treat typecheck errors like "cannot find generated module" or a missing `*.gen.ts` as environment setup, not code bugs — bootstrap, then re-typecheck.

## Step 2 — Implement the task

<!-- include-block: shared/batched-discovery.md -->
### Discovery runs as one batched pass

This is a step of the workflow, not a habit to recall. Run it whenever a phase of this command has to look at more than one file.

1. **Enumerate before reading.** Name every path, pattern, and read-only probe the phase needs. Where naming them takes a search — `rg --files`, `git diff --name-only`, a PR's file list — that search is the phase's first call, and its output *is* the enumeration.
2. **Send the whole enumeration in one turn.** Every `Read`, `rg`, `ls`, and read-only `git` call on that list goes out as parallel tool calls in a single assistant turn. Only a call whose arguments depend on another call's result may wait for the next turn. "I will decide what to read after this one" is not a dependency when the path was already on the list, and four or more consecutive read-only calls with no decision between them means the enumeration was skipped.
3. **Never loop per file.** One `Read` per entry of a list you already hold, or one `git diff <base> -- <path>` per path, is the shape this step exists to stop. Pass every path to a single `git diff <base>...HEAD -- <path> <path> …`, and send every `Read` as one block. Reviews and doc audits are where the loop reappears, because there the file list arrives complete and then gets walked.
4. **Read each file once.** A file already in this session's transcript is already in context, and wanting a *different* symbol from it is not a reason to read it again. Locate every symbol you now want with one `rg -n 'foo|bar' <file>`, then pull only the range you still need with numeric `offset`/`limit`. The one legitimate re-read is after the file actually changed — your own `Edit`, a hook, a formatter, a generator, or another agent — and then only the changed range.
5. **Re-establish the read-before-write precondition after a compaction.** `Edit` and `Write` reject a file this *session* has not read. Inherited context, a continuation summary, and shell output do not satisfy that precondition, even though the summary reads as though they do. So after any compaction boundary, session continuation, or hand-off into this command, treat the precondition as unmet: enumerate the files the next edit pass will write, `Read` them in one batch (a targeted `offset`/`limit` slice counts), and edit only once that batch returns. Re-running the rejected `Edit` cannot clear the error — the batched `Read` is the fix, and doing it for the whole pass at once is what stops the same rejection repeating file after file.
<!-- /include-block -->

Issue the batched calls as separate tool calls in one turn, never chained with `&&` or `;` and never stitched together with `echo` separators — one no-match or approval must not taint the others. Where a miss is expected for an individual read-only probe, end that probe with `|| true`; never suppress a corrective or state-changing command's failure. The shell is zsh, so quote any `*` or `?` the invoked program rather than the shell should expand.

- Restate the criteria in one line so we agree on scope, then implement it.
- **Keep path context live.** Before a relative or path-dependent command, use the root/path from the latest `my-command-tools state` or `worktree begin` result and confirm the live cwd when needed. A missing `logs/`, `.env`, or worktree path after it existed is evidence of cwd/worktree drift: re-resolve the path once instead of retrying the same relative command.
- **Bound long-running processes.** Start a dev server or watcher with Bash's background mode and a log file; do not run it as a foreground command that can consume the tool's two-minute window. Wait through the harness's `Monitor` tool or another bounded wait, then inspect the startup log for the actual port or failure. Never busy-spin with `until …; do :; done`: recorded runs timed out with exit 143 and one tight loop was killed with exit 137.
- For "create/initialize X" criteria, inspect the target path first — X may already exist, and the real work is extending it rather than scaffolding greenfield.
- Once isolated in a worktree, the worktree directory is where **the work** lives — resolve every read/edit/commit path under it, never the original shared checkout. Scratch is the exception the harness itself prescribes: a backup, a note, a throwaway script may go under `$CLAUDE_JOB_DIR/tmp`, which is outside the repo, cannot touch this worktree's index, and is cleaned up with the job. Nothing gates that path.
- Follow the repo's own conventions (read `CLAUDE.md`/`AGENTS.md` and match surrounding code — style, naming, tests).
- For anything non-trivial or ambiguous, plan before coding; for a bug, reproduce before fixing. Use the relevant superpowers skills (brainstorming, systematic-debugging, TDD) rather than guessing.
- **If the criteria are already satisfied, change nothing.** Some criteria are conditional ("do X if it isn't already the case"). When inspection shows the repo already meets them, do not manufacture edits to justify the run — report what you inspected and what you found, and fall through to Step 3's no-change check.
- **Verify before claiming done** — `my-command-tools verify`. It discovers the repo's own gates and runs them fastest-failing first, returning no log for a gate that passed and a bounded tail for one that failed. Narrow it with `--only <script,...>` when only part of the repo was touched. Report which gates ran; `pass: false` means you are not done.
- **Commits are explicitly allowed here.** Invoking `/my-command:task` is your standing permission to commit **on this branch** (never on `main`) — commit the work in logical commits with clear messages without asking again.
  - `my-command-tools commit --message <text> <path> [<path>...]`, one call per logical commit. Use `--message -` to pipe a multi-line message on stdin.
  - Paths are always explicit, and the verb refuses `.`/`-A`-style whole-tree staging: only commit files **you** created or changed for this task. Pre-existing untracked files carried over from the original workspace are not yours to ship — the verb reports them under `remaining` so you can confirm they stayed put.
  - <!-- include: shared/signing-retry.md -->`1Password: failed to fill whole buffer` with `fatal: failed to write commit object` is an unapproved signing prompt, not a repository problem: the commit did not happen and the tree is untouched. Retry the same commit once after the prompt is approved. Never rewrite the commit, pass `--no-gpg-sign`, or change the repo's signing configuration to get around it.<!-- /include -->
- If the repo tracks a changelog (e.g. a `changelog` command or `CHANGELOG.md`), add an entry.

## Step 3 — Clean, then PR (inline by default; one fresh subagent with `--sub`)

**First, confirm this run actually produced changes — if it did not, skip this stage.** On an empty diff `/my-command:pr` would push a branch and open a PR with no content.

`my-command-tools state` settles this in one call. Pass `--base <ref>` when this run didn't branch off the default — the `--base <branch>` you used, or for `--here` the commit the branch was at when this run started. Then read:

- **`hasWork: false`** — nothing to ship. It already accounts for both halves: `commits` since the base, and `changes.tracked`. Untracked strays are reported separately under `changes.untracked` and deliberately don't count, since they're the carryover files Step 2 forbids committing.
- **`hasWork: true`** — carry on below.

On `false`, **run neither `/my-command:clean` nor `/my-command:pr`, and do not push.** Go straight to teardown (2), then tell me the criteria were already satisfied, what you checked to establish that, and that no PR was opened. Under `--here`, if the branch carries unpushed commits from *before* this run, leave them alone and say they are there — they are not this run's work to ship.

Otherwise run `/my-command:clean` then `/my-command:pr` in sequence on this branch. `--sub` changes **where** they run and nothing else — same commands, same order, same verification, same teardown:

- **Default (no `--sub`):** run both **inline in this session**, via the `Skill` tool, one after the other. No subagent is dispatched.
- **`--sub` / `-s`:** dispatch **one fresh subagent** via the `Agent` tool to run both. It shares this worktree but not this conversation — hand it the branch name and enough context to act alone. **One subagent for both**, never one each: the shared context is what lets `/my-command:pr`'s description pick up whatever `/my-command:clean` touched.

Either way it is one continuous stage: a Step 0 added command scheduled at this point runs in the same place the pair does — inline here by default, inside that same subagent under `--sub`.

1. **Clean, then PR.** Run **`/my-command:clean`** on this branch first, commit any edits it makes (`/my-command:clean` is branch-aware — committed + staged + unstaged — so it picks up step 2's commits; if nothing changes, there's nothing to commit), then, in the same run, run **`/my-command:pr`** — push and open (or update) the PR with a concise bulleted description, passing `--draft` when `--draft`/`-d` was given, plus any title/context I supplied. Teardown is not part of this stage; it is (2) below. Under `--sub`, tell the subagent that explicitly — **not** to tear down the worktree. `/my-command:pr` skips teardown on its own for a worktree its session didn't create, so this is a reminder, not the only safeguard.
2. **Teardown.** After `/my-command:pr` returns — from the subagent under `--sub`, or inline — or straight away on the no-change path above, remove a dedicated worktree. Step 1 created it with `my-command-tools worktree begin`, so `worktree end` is what removes it in **both** cases and `ExitWorktree` only moves this session back out of it. For a cross-repo run you never entered it: run `my-command-tools worktree end --branch <branch>` from outside its returned `path`. For a same-repo run you entered it with `EnterWorktree({path})`: call `ExitWorktree` with `action: "keep"` to step back to the original checkout, then run `my-command-tools worktree end --branch <branch>` from there. Either way the verb re-verifies that `HEAD` reached origin before removal. **Remove it even when the PR is a draft** — `--draft`/`-d` controls the PR's review state on GitHub, not the local workspace. Skip teardown only for `--here`.
   - **Expect `worktree end` to check origin rather than to discard.** Once `/my-command:pr` has pushed, confirm the work is on origin — `my-command-tools state` reports `head`, and it must match `origin/<branch>`. If the verb refuses because HEAD is ahead of origin, push and re-run it; never reach for `--force`, and never route around the refusal with `ExitWorktree({action: "remove", discard_changes: true})` — that is the wrong mechanism for a worktree `begin` created, and `discard_changes` throws away the very commits the refusal is protecting.
   - <!-- include: shared/worktree-ownership.md -->**Remove a worktree through the same mechanism that created it.** One created by `git worktree add` or `my-command-tools worktree begin` is not owned by the session worktree tool merely because the session later entered it via `EnterWorktree({path})` — `ExitWorktree` refuses to remove it. Step back out with `action: "keep"`, then run `my-command-tools worktree end --branch <branch>` from outside the worktree; it re-verifies the branch reached origin before removing, so push rather than forcing if it refuses. If it refuses because another live session still holds the worktree, stop and report the path as left in place — never force past a live lock. **Whatever removes the worktree, stop the processes rooted in it first.** `worktree end` now does this itself, but `ExitWorktree` does not: a dev server or watcher started inside a worktree outlives the directory, and where the repo symlinks shared state (a log directory, a database) into each worktree, the survivor keeps writing to that shared state through a path that no longer resolves — one whose reads now fail can reconcile the shared store down to empty and make the main checkout look like it has no data. Run `my-command-tools worktree reap --path <worktree path>` immediately before `ExitWorktree({action: "remove"})`, and pass `--no-reap` to `end` only when a survivor is deliberate.<!-- /include -->

## Step 4 — Close the run in a text-only turn

<!-- include-block: shared/closing-turn.md -->
**This step is never skipped and never delegated.** The run is over when this session sends **one message carrying text and zero tool calls** — not when the work lands. That is the mechanic, not a style preference: a run's outcome is recorded only from a message with no tool call in it, so a message carrying the report *and* a tool call is recorded as a decision mid-run, and a run whose last message is a tool call records no outcome at all. Make the last tool call, let it return, then reply with text alone.

- **Every exit routes here, not just the shipped one.** Finished; nothing to do; a gate still failing; a step blocked, refused, or awaiting my answer; the request abandoned as wrong. The wording changes, the closing turn does not. A run that stopped early says where it stopped and what is on the branch, and leaves `/my-command:revive <thread id>` as the recovery path when the proxy thread id is available.
- **Say it in one self-contained line first**, then any detail. Someone who never saw the request should be able to read that line alone.
- **End the message with this run's return marker, alone on the last line:** the word `RETURN` in capitals, a space, then the name this run was invoked under, leading slash and all — `RETURN /<command>`, carrying whatever namespace prefix that invocation carried. Every command leaves through this step, so it is the one place a run nested inside another provably passes on its way out, and the marker is the only record of where it handed control back. Without it a nested run's span runs on to the next nested invocation, or to the end of the transcript for the last one, and that run is charged with everything its host did after it returned. **A run that ends abnormally never reaches this step and writes no marker**, so its span still runs to the end of the transcript: the marker makes the normal exit exact and leaves the abnormal one exactly as it already was.
- **A compaction boundary is a checkpoint, not an ending.** A recap prompt ("The user stepped away and is coming back…"), a `[SYSTEM NOTIFICATION - NOT USER INPUT]` event, or a session-continuation preamble each mean the run is still owed its turn: answer that prompt in text alone, say where the run actually stands, and restore the anchor todo item if it did not survive. A session is likeliest to die just after a compaction, so that answer is often the only outcome the run ever records. **Each side of the boundary records its own standing**, because a run split across two transcripts is two runs to the record: one that carried a PR across a boundary and closed on neither side reads as two abandoned runs, not one shipped one.
- **Every prompt from me opens a task, and only a text-only reply closes it.** The transcript starts a new `## Task:` at each of my messages — a mid-run question, a correction, a recap prompt, a change of direction — and writes `- done:` only when a reply carries text and no tool call. So answer my message in text alone *before* returning to tool calls. A run that reads the message and keeps working straight through leaves that task, and every task before it, with no outcome line. There is no `- done:` marker to type: that line is written for you from any text-only turn, and skipped entirely from a turn that carries a tool call.
- **A reply to another session is not this turn either.** `SendMessage` is a tool call, so a run whose whole job was answering another agent records no outcome when that reply is the last thing it sends. Send the reply, let it return, then close here in text alone — even when the closing message says much what the reply already said.
- **A subagent's report is never this turn.** The outcome belongs to the session the run started in, so after an `Agent` call returns, close the run here, in a message of your own.
- **Resolve the anchor before the message is composed, never as a call after it.** Mark the anchor todo item completed in the same tool-call turn as the run's last piece of real work, so nothing is left scheduled when that turn returns and the run's next action is the message itself. Marking it as a standalone final call is the recorded way this step fails: the mark lands every time, the message does not, and the run records no outcome. Handing back with it still open reads as abandoned, so close it — alongside a call you were already making, never as a turn of its own.
- **Do not tack the report onto the tool call before it.** `ExitWorktree`, `worktree end`, `verify`, and a closing `gh` call are exactly the calls that sit at the end of a run and swallow the outcome.
<!-- /include-block -->

For this pipeline: the run is not over when the PR opens or the worktree is removed. Lead with what shipped, the branch, and the PR number/URL — or what stopped the run. `--sub` does not move this step: the subagent runs `/my-command:clean` + `/my-command:pr` and reports back here, and its report is not this turn. If the Step 1 todo item went with a compaction, close the run anyway — any run that reached this far owes a closing turn, and a redundant one costs nothing while a skipped one loses the record.

## Notes

- Never implement or commit directly on `main`.
- If the criteria are too vague to act on, ask me one focused clarifying question before setting up the workspace — don't spin up a worktree for a guess.
- **Never wait by sleeping.** A foreground `sleep` is blocked by the harness, and so is polling with `sleep N && <check>`. Wait on a condition with the `Monitor` tool and an until-loop, or with the tool that blocks properly (`gh pr checks --watch`).
- <!-- include: shared/approval-own-call.md -->**A command that may need approval goes in its own Bash call** — `git fetch`, `git config`, and, as a narrow exception to the general rule to chain dependent mutations, branch-lifecycle operations such as checkout/switch, pull, remote-branch inspection, and local branch deletion. Folding one into an `&&` chain escalates approval to the whole compound command and costs a turn plus a retry. Put status output, pipes, and follow-up verification in separate read-only calls.<!-- /include -->
- <!-- include: shared/classifier-refusal.md -->A classifier refusal is not evidence that repository protections should be weakened. Inspect the refused command first; when the intended operation is safe and the refusal looks incidental to the command's shape — an over-broad chain, pipe, or extra flag — retry only the smallest exact command, never an allowlisted Bash pattern or a permission-settings change.<!-- /include -->
- <!-- include: shared/gh-identity.md -->`gh`'s GraphQL-backed writes (`gh pr create`, `gh pr edit`) resolve to an account that is not a collaborator on `llevasseur`-owned repos, while REST succeeds. A `must be a collaborator` GraphQL error means the wrong identity, not a permission to request: select the right account (`gh auth switch`, or `GH_TOKEN="$(gh auth token --user llevasseur)"`) or use the REST equivalent.<!-- /include -->
- **Record the outcome accurately.** Completion means the PR exists and any dedicated worktree is removed. A failed or interrupted run is not complete; say where it stopped and leave `/my-command:revive <thread id>` as the recovery path when the proxy thread id is available.
- Report the branch name up front and the PR number/URL at the end — or, on a no-change run, that no PR was opened and why. That closing report is Step 4, which is a step of this pipeline rather than a note about it. <!-- include: shared/text-only-turn.md -->Deliver that report in this run's **closing turn** — the terminal step below — rather than alongside the tool call that precedes it.<!-- /include -->
