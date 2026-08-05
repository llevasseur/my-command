---
description: Judge claude-proxy's fired suggestions against the raw transcripts they came from — confirm the ones the sessions actually support with a note written from what the agent was doing, dismiss the ones the rule misread, and record both verdicts per bucket
argument-hint: "[--range|-r <spec>] [--dry-run|-n]"
---

Decide whether claude-proxy's suggestions are true. A rule fires from counts and node positions; it cannot see what the agent was doing, so it reports a real slowdown and a misread with equal confidence. This command reads the **raw transcripts** behind each fired suggestion and returns one verdict per suggestion: **CONFIRMED**, with the context the transcript actually shows, or **DISMISSED**, with the reason the rule misread it.

Your input is the text in the `<command-args>` block above. Parse leading flags off the front; there is no free-text argument — anything left over is a range you meant to pass as `--range`, so say so rather than guessing.

**A verdict is a claim about a transcript, not an opinion about a rule.** Every CONFIRMED carries a note written from what the session was doing and why it went slow. Every DISMISSED names what the rule counted and what was actually happening instead. A verdict with neither is worse than no verdict, because a bucket marked judged is never re-read.

**This command is [improve](improve.md)'s precondition, not an optional pass over it.** `/improve` composes criteria from confirmed suggestions only, so an unjudged bucket is a bucket whose findings cannot reach a PR. Judging is the thing that makes the criteria trustworthy; skipping it is how a rule's misread becomes a paragraph in someone's `AGENTS.md`.

<!-- include: shared/closing-turn-anchor.md -->**Before the first tool call, anchor the closing turn.** Put "close the run in a text-only turn" in the harness todo/task list as its own final item — worded on its own, never folded into the work it follows — and leave it open until it is the only item left. The todo list is live session state that a compaction carries forward; this prompt is not. Once this run is summarized, that item is the only surviving record that an outcome is still owed. **Then close it out:** "until it is the only item left" is the trigger to resolve it, not a reason to leave it open forever — once it is the last item and the work is done, mark it completed with the run's **final tool call**, and send the text-only message after that call returns. Both constraints hold at once that way: the task list ends clean and the closing message still carries zero tool calls. Never hand back with the anchor still open — a finished run reads as abandoned in the job list.<!-- /include -->

## Flags

- `--range <spec>` / `-r <spec>` — which session buckets to judge. One bucket (`9`), a list (`2,3,9`), a span (`2-9`), or a mix (`2-4,9`). **Default: every bucket.** The range selects candidates; Step 2 narrows them to the ones that are actually judgeable.
- `--dry-run` / `-n` — report the dirty buckets in the range, the fired suggestions in each, and the transcripts that would be read, then stop. Nothing is read in full and no verdict is recorded.
- Anything else is not a flag this command takes. Report it rather than interpreting it.

## Step 1 — Resolve the claude-proxy dependency

<!-- include-block: shared/claude-proxy-checkout.md -->
**This command cannot run without claude-proxy**, and its location is not hardcoded — it comes from the environment, exactly as [revive](revive.md) resolves the transcript store.

- **`CLAUDE_PROXY_STORE` (required)** — the directory the proxy writes session transcripts into. Read it from the environment (`printenv CLAUDE_PROXY_STORE`); never guess a path and never derive one from a repo checkout or clone location.
- Derive the two paths the suggestion tooling needs from it: the **log directory** is its parent (the store is `<logDir>/sessions`), and the **claude-proxy checkout** is the directory above that. Confirm the checkout by looking for its `server/package.json`.
- **If `CLAUDE_PROXY_STORE` is unset, or its path is missing, or the derived checkout has no `server/package.json`, stop.** Say which of the three failed, that this command has no suggestions to read without it, and that it must be exported in the shell environment — e.g. in `~/.zshrc`:

  ```sh
  export CLAUDE_PROXY_STORE="$HOME/path/to/claude-proxy/logs/sessions"
  ```

  Do not search the filesystem for a claude-proxy checkout yourself, and do not fall back to a hardcoded path.
<!-- /include-block -->

## Step 2 — Find the dirty buckets

A **dirty** bucket is one that is complete and unjudged: its ten sessions are all recorded, so its suggestions are final, and no verdict has been written against them yet. Those are the only buckets this command may touch.

```sh
LOG_DIR="<logDir>" pnpm --filter server suggestions buckets --dirty --json          # every bucket
LOG_DIR="<logDir>" pnpm --filter server suggestions buckets --dirty -r 2-9 --json   # with --range
```

- The CLI reads the log directory directly, so **no proxy server needs to be running.**
- Each row names the bucket, its session window, and its judged state. Judge the dirty ones and nothing else.

Two refusals, both absolute:

- **Never judge a partial bucket.** A bucket short of its ten sessions is still accumulating, and its counts will change — a verdict written now is a verdict about numbers that no longer exist, recorded against a bucket that will never be re-read. `--dirty` excludes them; do not reach past it to a bucket you can see is incomplete.
- **Never judge a bucket already marked judged.** Its verdicts are already in the store, and a second pass would overwrite considered notes with fresh guesses. Re-judging is a deliberate backfill operation and is not this command's business.

If nothing in the range is dirty, **stop and say so.** That is the good outcome — every bucket in the range already has verdicts, and `/improve` can compose from them. It is not a failure and there is nothing to report beyond it.

**Say the read cost before starting, and confirm it when it is large.** A bucket is roughly 55 KB of transcripts typically and about 180 KB worst case. A handful of buckets is an ordinary run. A bare `/judge` over dozens of dirty buckets is a **backfill**, measured in megabytes of transcript — name the bucket count and the rough total, and ask before reading rather than discovering it partway through. If the answer is that the history should simply be drawn a line under rather than judged, `suggestions judge --amnesty` does that and needs no transcripts at all.

## Step 3 — Read what fired, with its node positions

For each dirty bucket, read the fired suggestions with their detail:

```sh
LOG_DIR="<logDir>" pnpm --filter server suggestions list -r <bucket> -d --json
```

What matters here beyond `bucket`, `id`, `title` and `detail`:

- **`sources[]`** — the sessions the suggestion fired from, each with its `threadId`.
- **`sources[].nodeIndexes`** — the exact node positions in that transcript that matched. This is the whole reason a verdict can be better than a guess: it points at the specific turns, so the transcript is read at the place the rule looked rather than skimmed for a general impression.

A suggestion with no `sources` is a suggestion with nothing to check. Dismiss it as unverifiable and say that is why, rather than confirming it on the strength of its own `detail`.

## Step 4 — Read the transcripts in one batched pass

<!-- include-block: shared/batched-discovery.md -->
### Discovery runs as one batched pass

This is a step of the workflow, not a habit to recall. Run it whenever a phase of this command has to look at more than one file.

1. **Enumerate before reading.** Name every path, pattern, and read-only probe the phase needs. Where naming them takes a search — `rg --files`, `git diff --name-only`, a PR's file list — that search is the phase's first call, and its output *is* the enumeration.
2. **Send the whole enumeration in one turn.** Every `Read`, `rg`, `ls`, and read-only `git` call on that list goes out as parallel tool calls in a single assistant turn. Only a call whose arguments depend on another call's result may wait for the next turn. "I will decide what to read after this one" is not a dependency when the path was already on the list, and four or more consecutive read-only calls with no decision between them means the enumeration was skipped.
3. **Never loop per file.** One `Read` per entry of a list you already hold, or one `git diff <base> -- <path>` per path, is the shape this step exists to stop. Pass every path to a single `git diff <base>...HEAD -- <path> <path> …`, and send every `Read` as one block. Reviews and doc audits are where the loop reappears, because there the file list arrives complete and then gets walked.
4. **Read each file once.** A file already in this session's transcript is already in context, and wanting a *different* symbol from it is not a reason to read it again. Locate every symbol you now want with one `rg -n 'foo|bar' <file>`, then pull only the range you still need with numeric `offset`/`limit`. The one legitimate re-read is after the file actually changed — your own `Edit`, a hook, a formatter, a generator, or another agent — and then only the changed range.
5. **Re-establish the read-before-write precondition after a compaction.** `Edit` and `Write` reject a file this *session* has not read. Inherited context, a continuation summary, and shell output do not satisfy that precondition, even though the summary reads as though they do. So after any compaction boundary, session continuation, or hand-off into this command, treat the precondition as unmet: enumerate the files the next edit pass will write, `Read` them in one batch (a targeted `offset`/`limit` slice counts), and edit only once that batch returns. Re-running the rejected `Edit` cannot clear the error — the batched `Read` is the fix, and doing it for the whole pass at once is what stops the same rejection repeating file after file.
<!-- /include-block -->

The transcripts are at `<logDir>/sessions/<threadId>.md`, one per session in the bucket's window.

**Reading cost is not the concern here — batching is.** The numbers are known: 415 transcripts in the store, 5.5 KB mean, 17.8 KB largest, so a bucket's ten sessions come to roughly 55 KB typically and about 180 KB worst case. Reading all ten in a single batched pass is the expected shape of this step, not an extravagance to be economized against.

So: enumerate the ten paths from the bucket's `sources[].threadId` values, then send all ten `Read` calls as parallel calls in **one** turn. **Do not loop per file.** One `Read` per transcript across ten turns is the failure this step exists to prevent, and it is the natural mistake here because the file list arrives complete and then invites being walked. Read each transcript once, and use `nodeIndexes` to know which part of it decides the verdict rather than as a reason to go back for a second read.

## Step 5 — One verdict per fired suggestion

Every suggestion that fired in the bucket gets exactly one verdict. Not a sample, not the interesting ones — a bucket is marked judged as a whole, so a suggestion left without a verdict is a suggestion silently accepted.

**CONFIRMED** — the transcript shows the slowdown the rule reported. The note says what the agent was doing and why it went slow:

- Write it **from the transcript**, at the nodes `nodeIndexes` named. What phase of what workflow was running, what it was trying to do, and what the slow shape actually was.
- **Never restate the rule's own `detail` string.** `detail` is generated from counts; it is already in the store and `/improve` can already read it. A note that paraphrases it adds a sentence and zero evidence, and it is worse than nothing because it reads like corroboration.
- **If there is genuinely nothing to add beyond what the rule already said, say that.** "Confirmed; the transcript shows exactly the pattern counted and no further context" is an honest, useful note. Padding it into a paragraph is not.
- The note is what `/improve` composes a criterion's reason from, so write it for a reader who has the transcript unavailable and the rule's `detail` already in hand.

**DISMISSED** — the rule misread the session. The reason names the gap between what it counted and what was happening:

- The read-only calls it counted as serial discovery were a deliberate probe of an unknown repo, where each answer decided the next.
- The repeated error was the same message from two unrelated causes.
- The refused call was a guardrail correctly stopping something that should not have run.
- The re-read was of a file another agent had just rewritten.

Whatever it is, name it concretely from the transcript. "Looks like a false positive" is not a reason; it is a verdict with the evidence left out.

**Judge the suggestion, not the rule.** A rule that is wrong in this bucket may be right in the next one, and a rule that is wrong in every bucket is a *defect* — which is a separate finding, reported by `suggestions defects` from the dismissal record and dispatched as a criterion by `/improve`. This command's job is to get each bucket's verdicts right; the pattern across buckets emerges from doing that honestly, and cannot be shortcut by dismissing a rule wholesale.

**`--dry-run` / `-n` stops here**, having reported the dirty buckets, the suggestions in each, and the transcripts that would be read, and having recorded nothing.

## Step 6 — Record both verdicts, one call per bucket

Write the bucket's confirmations and dismissals in a **single** invocation:

```sh
LOG_DIR="<logDir>" pnpm --filter server suggestions judge -r <bucket> --confirm ... --dismiss ...
```

- **One call per bucket, carrying both verdict sets.** Not one call per suggestion, and not a confirm call followed by a dismiss call. The bucket's judged flag is set by this call, so splitting it means a run that dies between the two halves leaves the bucket marked judged with half its verdicts missing.
- **Read `suggestions judge --help` before composing the call** to get the exact form for attaching a note to a confirmation and a reason to a dismissal. Do not guess the note syntax and do not send a call whose notes you are unsure landed — a verdict recorded without its note is the one failure this command cannot undo, because the bucket is now judged and will not be re-read.
- Verify the call reported the counts you sent. A bucket whose judge call reports fewer verdicts than the bucket had fired suggestions is a failed run, not a partial success: say so and leave it to be re-judged rather than moving on to the next bucket.
- Judge the buckets one at a time and confirm each call before starting the next, so a failure names one bucket rather than an unknown subset.

Report at the end: the range read, which buckets were dirty and judged, how many suggestions were confirmed and dismissed in each, and any bucket that failed to record. <!-- include: shared/text-only-turn.md -->Deliver that report in this run's **closing turn** — the terminal step below — rather than alongside the tool call that precedes it.<!-- /include -->

## Notes

- **A dismissal is not a regression.** `regressed` means a dated fix did not hold; `dismissed` means the finding was never true. They are different records with different consequences, and conflating them escalates against something that never happened. `/improve`'s regression track never sees a dismissed row.
- **A dismissal is not a `skipped` either.** `skipped` is a person deliberately passing over a real finding; `dismissed` is a verdict that the finding is false. Marking a misread as `skipped` leaves it counted as real work deferred.
- **Never confirm to be safe.** A confirmation is what lets a suggestion become a criterion and then a change to how every future session works. Confirming something the transcript does not show is how a rule's arithmetic error turns into a permanent rule in a repo.
- **Never dismiss to be quick.** The transcripts are the only thing that can tell these apart, and the whole cost of this command is reading them. A dismissal written without reading the nodes the rule pointed at is a guess with a verdict's authority.
- **Judging writes to claude-proxy's store, not to any repo.** This command opens no branch, edits no file, and makes no commit. If a verdict implies a code change, that is `/improve`'s dispatch to make.
- Buckets are fixed windows of ten sessions numbered oldest-first, so a bucket number means the same sessions tomorrow and a verdict stays attached to the evidence it was written from.

## Close the run in a text-only turn

<!-- include-block: shared/closing-turn.md -->
**This step is never skipped and never delegated.** The run is over when this session sends **one message carrying text and zero tool calls** — not when the work lands. That is the mechanic, not a style preference: a run's outcome is recorded only from a message with no tool call in it, so a message carrying the report *and* a tool call is recorded as a decision mid-run, and a run whose last message is a tool call records no outcome at all. Make the last tool call, let it return, then reply with text alone.

- **Every exit routes here, not just the shipped one.** Finished; nothing to do; a gate still failing; a step blocked, refused, or awaiting my answer; the request abandoned as wrong. The wording changes, the closing turn does not. A run that stopped early says where it stopped and what is on the branch, and leaves `/revive <thread id>` as the recovery path when the proxy thread id is available.
- **Say it in one self-contained line first**, then any detail. Someone who never saw the request should be able to read that line alone.
- **A compaction boundary is a checkpoint, not an ending.** A recap prompt ("The user stepped away and is coming back…"), a `[SYSTEM NOTIFICATION - NOT USER INPUT]` event, or a session-continuation preamble each mean the run is still owed its turn: answer that prompt in text alone, say where the run actually stands, and restore the anchor todo item if it did not survive. A session is likeliest to die just after a compaction, so that answer is often the only outcome the run ever records.
- **Every prompt from me opens a task, and only a text-only reply closes it.** The transcript starts a new `## Task:` at each of my messages — a mid-run question, a correction, a recap prompt, a change of direction — and writes `- done:` only when a reply carries text and no tool call. So answer my message in text alone *before* returning to tool calls. A run that reads the message and keeps working straight through leaves that task, and every task before it, with no outcome line. There is no marker to type: the `- done:` line is written for you from any text-only turn, and skipped entirely from a turn that carries a tool call.
- **A subagent's report is never this turn.** The outcome belongs to the session the run started in, so after an `Agent` call returns, close the run here, in a message of your own.
- **Resolve the anchor item as the last tool call.** The todo item that held this turn open is the one thing still owed once the work lands: mark it completed, let that call return, then send the message. It is the natural final call, and it keeps the closing message free of tool calls exactly as this step requires. Handing back with it still open makes a finished run read as abandoned.
- **Do not tack the report onto the tool call before it.** `ExitWorktree`, `worktree end`, `verify`, and a closing `gh` call are exactly the calls that sit at the end of a run and swallow the outcome.
<!-- /include-block -->
