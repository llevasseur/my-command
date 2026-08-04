---
description: Resume an interrupted Claude Code session from its recorded transcript — find where it stopped, finish only what's outstanding, and carry the original workflow to its documented end
argument-hint: "[--dry-run|-n] [--source proxy|cli|<path>] <session-id> [extra context]"
---

Pick up a session that stopped mid-flight — cleared, compacted away, killed, or abandoned — with its work left half-applied on a branch somewhere.

Your input is the text in the `<command-args>` block above. Parse leading flags off the front; the first bare token is the **session id**, and anything after it is optional extra context that steers the resumption (it never overrides what the transcript and repo state show).

**The transcript tells you intent; the repo tells you state.** Every claim about what is left to do gets re-derived from the working tree, never taken from the transcript on faith.

<!-- include: shared/closing-turn-anchor.md -->**Before the first tool call, anchor the closing turn.** Put "close the run in a text-only turn" in the harness todo/task list as its own final item — worded on its own, never folded into the work it follows — and leave it open until it is the only item left. The todo list is live session state that a compaction carries forward; this prompt is not. Once this run is summarized, that item is the only surviving record that an outcome is still owed. **Then close it out:** "until it is the only item left" is the trigger to resolve it, not a reason to leave it open forever — once it is the last item and the work is done, mark it completed with the run's **final tool call**, and send the text-only message after that call returns. Both constraints hold at once that way: the task list ends clean and the closing message still carries zero tool calls. Never hand back with the anchor still open — a finished run reads as abandoned in the job list.<!-- /include -->

## Flags

- `--dry-run` / `-n` — report where the session stopped and what remains, and change nothing: no edits, no worktree created, no commit, no PR. Stop after Step 4.
- `--source proxy` — force the claude-proxy transcript store (the default; requires `CLAUDE_PROXY_STORE`, see Step 1).
- `--source cli` — force the Claude Code CLI transcript (`~/.claude/projects/<slug>/<uuid>.jsonl`).
- `--source <path>` — read that file directly as the transcript, whatever it is.
- Anything not a recognized flag is the session id, then extra context.

## Step 1 — Resolve the id to a transcript

**Default to the claude-proxy store.** It is a purpose-built per-session digest and the source this command is designed around; the CLI's own JSONL is the fallback.

**The store's location is not hardcoded — it comes from the environment.**

- **`CLAUDE_PROXY_STORE` (required)** — the directory the proxy writes session transcripts into, holding `<id>.md` files directly. Read it from the environment (`printenv CLAUDE_PROXY_STORE`); never guess a path, never derive one from a repo checkout or a clone location.
- **`CLAUDE_PROXY_ARCHIVE` (optional)** — the root that relocated older transcripts live under, typically one subdirectory per day. Search it recursively for `<id>.md`. When it is unset, skip the archive and say so; an id older than the live store's retention simply will not resolve.
- **If `CLAUDE_PROXY_STORE` is unset or does not point at an existing directory, stop.** Say the variable is unset (or its path is missing), that `--source proxy` cannot run without it, and that it must be exported in the shell environment — e.g. in `~/.zshrc`:

  ```sh
  export CLAUDE_PROXY_STORE="$HOME/path/to/claude-proxy/logs/sessions"
  export CLAUDE_PROXY_ARCHIVE="$HOME/path/to/archived/claude/logs"   # optional
  ```

  Do not search for the store yourself, and do not fall back to the CLI store silently. `--source cli` and `--source <path>` still work without the variable — offer them.

1. **Read the id's shape** — it tells you which store to look in:
   - **16 hex characters** (e.g. `59da5fc97e6b9465`) — a proxy **thread id**. The proxy derives it as `sha256(sessionId + "\n" + first-user-text).slice(0, 16)`, so it identifies one *conversation root*, not one CLI session.
   - **A 36-character UUID** — a Claude Code **session id**. Look for the CLI transcript, and also map it into the proxy store (step 3 below).
2. **Search the proxy store, live first, then the archive:**
   - Live: `$CLAUDE_PROXY_STORE/<id>.md`
   - Archive: `$CLAUDE_PROXY_ARCHIVE/**/<id>.md` — the proxy's retention moves older days out of the live store, so a session more than a day old will only be there. Glob across the archive rather than guessing a day.
   - A `<id>.state.json` sits beside each transcript; it is the writer's append bookkeeping (`count`, `started`), not content. Ignore it.
3. **Cross-walk the two stores when needed.** A proxy transcript's header carries `- session: <uuid>` — the CLI session id. So:
   - id → CLI transcript: read that header, then find `~/.claude/projects/*/<uuid>.jsonl`.
   - UUID → proxy transcript: grep the store for that uuid (`grep -l "session: <uuid>" "$CLAUDE_PROXY_STORE"/*.md`, then the archive).
   - **Quote any argument holding `*` or `?` that grep — not the shell — should expand** (`grep -rl --include='*.md' …`, `'$CLAUDE_PROXY_ARCHIVE/**/<id>.md'`). The shell is zsh: an unquoted glob matching nothing aborts the whole command with `no matches found`, so a store with no hit reads as a tooling error rather than a miss.
   - **One session can have several thread ids.** Subagents run under the parent's session id with their own conversation root, so the proxy writes each as its own transcript. If the id resolves to a subagent's transcript, the sibling transcripts sharing that `- session:` uuid are the rest of the run — find them before concluding what the session was doing.
4. **Report the file you resolved and which store it came from**, before reading further.
5. **If nothing resolves**, say so plainly: the id, the exact paths and globs you searched, and that no transcript exists for it. Do not substitute a different session that looks similar, and do not proceed on the id alone. Stop.
6. **If the id is the session you are running in right now**, say so — a live session's transcript is still being appended and there is nothing interrupted to revive. Stop unless the extra context makes clear I meant something else.

## Step 2 — Read the transcript and reconstruct what it was doing

<!-- include-block: shared/batched-discovery.md -->
### Discovery runs as one batched pass

This is a step of the workflow, not a habit to recall. Run it whenever a phase of this command has to look at more than one file.

1. **Enumerate before reading.** Name every path, pattern, and read-only probe the phase needs. Where naming them takes a search — `rg --files`, `git diff --name-only`, a PR's file list — that search is the phase's first call, and its output *is* the enumeration.
2. **Send the whole enumeration in one turn.** Every `Read`, `rg`, `ls`, and read-only `git` call on that list goes out as parallel tool calls in a single assistant turn. Only a call whose arguments depend on another call's result may wait for the next turn. "I will decide what to read after this one" is not a dependency when the path was already on the list, and four or more consecutive read-only calls with no decision between them means the enumeration was skipped.
3. **Never loop per file.** One `Read` per entry of a list you already hold, or one `git diff <base> -- <path>` per path, is the shape this step exists to stop. Pass every path to a single `git diff <base>...HEAD -- <path> <path> …`, and send every `Read` as one block. Reviews and doc audits are where the loop reappears, because there the file list arrives complete and then gets walked.
4. **Read each file once.** A file already in this session's transcript is already in context, and wanting a *different* symbol from it is not a reason to read it again. Locate every symbol you now want with one `rg -n 'foo|bar' <file>`, then pull only the range you still need with numeric `offset`/`limit`. The one legitimate re-read is after the file actually changed — your own `Edit`, a hook, a formatter, a generator, or another agent — and then only the changed range.
5. **Re-establish the read-before-write precondition after a compaction.** `Edit` and `Write` reject a file this *session* has not read. Inherited context, a continuation summary, and shell output do not satisfy that precondition, even though the summary reads as though they do. So after any compaction boundary, session continuation, or hand-off into this command, treat the precondition as unmet: enumerate the files the next edit pass will write, `Read` them in one batch (a targeted `offset`/`limit` slice counts), and edit only once that batch returns. Re-running the rejected `Edit` cannot clear the error — the batched `Read` is the fix, and doing it for the whole pass at once is what stops the same rejection repeating file after file.
<!-- /include-block -->

A proxy transcript is a **lossy digest, not a replay log**. Its shape:

```
# Session <threadId>
- model: … / - session: <uuid> / - started: <ISO> / - title: … / - subtitle: <first prompt>

## Task: <a user prompt>
- decided: <assistant reasoning before a tool call, truncated>
- Bash(command=…)            ← tool calls, arguments truncated
- ✗ <errored tool result>
- done: <outcome>
```

Reasoning lines and tool arguments are cut off mid-string: reconstruct *intent and sequence*, never replay verbatim. Extract:

1. **The subtitle and the `## Task:` headings** — the original ask, in the human's words.
2. **The workflow that was running.** These sessions are usually inside a slash-command pipeline, often nested (`/my-command:docs` handing off to `/my-command:task`). A `Skill(skill=…)` line names it. **Open that command's own file** (`~/.claude/commands/<name>.md`, or this repo's `src/commands/`) and read its steps — that document, not your guess, defines what "finished" means for this run.
3. **Where it stopped.** The transcript simply *ending* is the interruption signal — no `done:` on the final task, a `- decided:` line describing an action with no tool calls after it, a series of edits that stops partway. Name the last thing it did and the step it was inside.
4. **Decisions the human already made.** An `AskUserQuestion()` line followed by a `- decided:` line summarizing the answers means those choices are settled. Honor them; never re-litigate them or quietly pick differently.
5. **`- ✗` lines** — errors it hit. Some were handled in the next step; some are the reason it stopped.

Report a short reconstruction: the ask, the workflow, the human's decisions, and the last completed step.

## Step 3 — Recover the workspace

Resume **where the work already lives**. Starting a fresh branch off `main` would abandon it.

1. Take the `- session: <uuid>` from the transcript header and read the CLI transcript for that session (`~/.claude/projects/*/<uuid>.jsonl`). Every line carries `cwd` and `gitBranch` — that is the directory and branch the run was in. The project directory name is a slugified path, so it independently confirms the location.
2. **If that directory still exists**, work there. It is usually a worktree under `.claude/worktrees/`; treat it as the only writable root for this run.
3. **If it's gone but the branch survives** (locally or on `origin`), recreate a worktree checking out that **existing** branch — `my-command-tools worktree begin --branch <branch> --existing --bootstrap` — and `EnterWorktree` at the `path` it reports. `--existing` is load-bearing: without it the verb creates a new branch, which is exactly the "branch fresh off `main`" mistake that abandons the interrupted work.
4. **If the branch is gone too**, check whether the work landed (`git log --oneline --all --grep`, an open or merged PR via `gh pr list --state all`). Report what you find and stop rather than reconstructing the changes from the transcript.
5. If the transcript's run was never in a worktree at all (`--here`-style, on a normal branch), just confirm that branch is still checked out and work there.

## Step 4 — Reconcile the transcript against reality

Do this **before** any new work, and trust the repo over the transcript every time.

1. `my-command-tools state` in the recovered workspace — `changes`, `diffStat`, and `commits` in one call. Steps can have landed after the last transcript line was written, and the tree may have moved on since.
2. Run the repo's **own** gates — `my-command-tools verify` discovers and runs them, including any bespoke `check:*` invariants. They report the current truth in executable form and often name the exact leftover; a failing gate comes back with a bounded log. Also read whatever `AGENTS.md`/`CLAUDE.md` names, in case the repo has a gate that isn't a package script.
3. Build the outstanding list by **subtracting what's already done** from what the workflow requires. The leftovers that actually show up here:
   - a **generated artifact** never regenerated after its source changed (an index, a build copy, a lockfile);
   - a **series of edits applied partway** — the first three files done, the rest untouched;
   - a **verification step never run**, so nothing confirmed the work;
   - the **wrapping workflow's tail** — the commit, the cleanup, the PR — never reached.
4. Report the outstanding list, each item with the evidence that says it's outstanding.
5. **`--dry-run` / `-n` stops here**, having reported where the session stopped and what remains.

## Step 5 — Finish only what's outstanding

1. Work the outstanding list. **Do not re-run completed work** — no re-auditing files the run already verified, no rewriting edits that already landed.
2. **Verify every claim against source you read in this session.** The transcript's `- decided:` lines are truncated summaries of someone else's reading; a claim that mattered enough to record is worth re-checking before you build on it. Where the transcript and the code disagree, the code wins and you say so.
3. Follow the repo's conventions and the interrupted workflow's own rules (a docs-only run stays docs-only; a command with a checklist gets the whole checklist).
4. If a genuinely ambiguous fork appears — the transcript shows a decision pending and neither the repo nor my extra context settles it — ask me **one** focused question. Don't invent the answer, and don't stall on everything else while you wait: do the independent work first.

## Step 6 — Carry the original workflow to its end

Finishing the edits is not finishing the run. Go back to the workflow you identified in Step 2 and complete **its** documented ending — read that command's file again rather than assuming.

- A run wrapped in `/my-command:task` (which is most of them, including everything `/my-command:docs`, `/my-command:fb`, and `/my-command:review` delegate) ends at a **PR**: commit the work on the branch, run `/my-command:clean`, then `/my-command:pr`, then tear the worktree down. Teardown is yours, not `/my-command:pr`'s — `/my-command:pr` skips any worktree its session didn't create, and a worktree you re-entered via `EnterWorktree({path})` in Step 4 is one `ExitWorktree` refuses to remove, so step out with `action: "keep"` and finish with `my-command-tools worktree end --branch <branch>`. `/my-command:task`'s standing permission to commit on that branch carries over — you are completing its run, not starting a new one.
- A run that was never inside `/my-command:task` ends wherever its own instructions say. If that is just "report", report.
- Do **not** wrap the resumption in a new `/my-command:task` invocation: the branch and workspace already exist, and a nested run would create a second worktree for work that is already checked out.

Report at the end: which transcript and store you used, where the session stopped, what you finished, what you deliberately left alone, and the PR number/URL if the workflow ended at one. <!-- include: shared/text-only-turn.md -->Deliver that report in this run's **closing turn** — the terminal step below — rather than alongside the tool call that precedes it.<!-- /include --> A run that ends on a tool call records no `done:` and reads as interrupted to the next `/my-command:revive`.

## Notes

- **Never fabricate intent.** What the session "meant to do next" is bounded by the transcript plus the current repo state. If they don't support a step, say the transcript doesn't reach that far instead of inventing it.
- **The human's mid-run decisions stand.** Answers recorded in the transcript are settled input, not a starting point for renegotiation.
- **Report a miss plainly.** No transcript, a dead branch, a session still running, work already merged — each is a real answer. Say which, with what you checked, and stop.
- The store is device-local and on a retention window: an id that resolved yesterday may not resolve today. That's the store's lifecycle, not a bug to work around.
- A transcript can be long. Read the header and task headings first, then the tail where it stopped; pull the middle only when you need a specific decision — pass numeric `offset` and `limit` values, never strings, for a targeted slice instead of the whole file.
- Reconstructing a run is exactly the enumerable sweep Step 2's batched-discovery step governs — the transcript, the sibling transcripts, and the files it touched go out in one turn.

## Close the run in a text-only turn

<!-- include-block: shared/closing-turn.md -->
**This step is never skipped and never delegated.** The run is over when this session sends **one message carrying text and zero tool calls** — not when the work lands. That is the mechanic, not a style preference: a run's outcome is recorded only from a message with no tool call in it, so a message carrying the report *and* a tool call is recorded as a decision mid-run, and a run whose last message is a tool call records no outcome at all. Make the last tool call, let it return, then reply with text alone.

- **Every exit routes here, not just the shipped one.** Finished; nothing to do; a gate still failing; a step blocked, refused, or awaiting my answer; the request abandoned as wrong. The wording changes, the closing turn does not. A run that stopped early says where it stopped and what is on the branch, and leaves `/my-command:revive <thread id>` as the recovery path when the proxy thread id is available.
- **Say it in one self-contained line first**, then any detail. Someone who never saw the request should be able to read that line alone.
- **A compaction boundary is a checkpoint, not an ending.** A recap prompt ("The user stepped away and is coming back…"), a `[SYSTEM NOTIFICATION - NOT USER INPUT]` event, or a session-continuation preamble each mean the run is still owed its turn: answer that prompt in text alone, say where the run actually stands, and restore the anchor todo item if it did not survive. A session is likeliest to die just after a compaction, so that answer is often the only outcome the run ever records.
- **Every prompt from me opens a task, and only a text-only reply closes it.** The transcript starts a new `## Task:` at each of my messages — a mid-run question, a correction, a recap prompt, a change of direction — and writes `- done:` only when a reply carries text and no tool call. So answer my message in text alone *before* returning to tool calls. A run that reads the message and keeps working straight through leaves that task, and every task before it, with no outcome line. There is no marker to type: the `- done:` line is written for you from any text-only turn, and skipped entirely from a turn that carries a tool call.
- **A subagent's report is never this turn.** The outcome belongs to the session the run started in, so after an `Agent` call returns, close the run here, in a message of your own.
- **Resolve the anchor item as the last tool call.** The todo item that held this turn open is the one thing still owed once the work lands: mark it completed, let that call return, then send the message. It is the natural final call, and it keeps the closing message free of tool calls exactly as this step requires. Handing back with it still open makes a finished run read as abandoned.
- **Do not tack the report onto the tool call before it.** `ExitWorktree`, `worktree end`, `verify`, and a closing `gh` call are exactly the calls that sit at the end of a run and swallow the outcome.
<!-- /include-block -->
