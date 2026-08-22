---
type: spec
title: Workflow gates
description: The PreToolUse and Stop hooks, and the toolkit recoveries, that enforce the workflow rules mechanically instead of relying on an agent recalling them.
tags: [process, hooks, toolkit, install, guardrails]
timestamp: 2026-08-04
updated: 2026-08-18
dirty: true
---

# Workflow gates

## Summary

A set of recurring agent behaviours — serial discovery, re-reading files already in
context, retrying a failure that has one known answer, ending a run without recording
an outcome — had each been written down twice and kept happening. The gates here are
the third attempt, and the first that does not depend on being remembered.

Two mechanisms, no prose:

- **Hooks** the harness runs on its own: a `PreToolUse` gate that refuses three
  specific call shapes, and a `Stop` gate that refuses to end a run with no outcome.
- **Toolkit recoveries** that resolve a known failure inside the tool that hit it, so
  it never surfaces as an error for an agent to interpret.

## The escalation ladder

Each gate below is placed on this ladder deliberately, and the placement is the point:

1. a prose rule an agent must read and remember
2. a step written into the command workflow that needs it
3. a mechanical gate that fires on its own, with no agent cooperation
4. removing the affordance, so the slow path cannot be taken

Rungs 1 and 2 were both occupied before this. `src/shared/batched-discovery.md` is
included by nine commands; `src/shared/closing-turn.md` by eighteen;
`signing-retry.md`, `gh-identity.md`, and `classifier-refusal.md` all exist. The rules
still tripped, in sessions recorded entirely after those were in place — and in other
repositories, where a consuming repo's `AGENTS.md` has no force at all. So nothing here
is allowed to be another sentence.

## Gates

| Behaviour | Rung | Mechanism |
|---|---|---|
| Serial discovery | 3 | `PreToolUse` refuses a 4th consecutive **single-call** read-only turn; a batched turn ends the run instead of extending it |
| Redundant whole-file reads | 3 | `PreToolUse` refuses a re-read of an unchanged file |
| Re-narrowing on a file already read | 3 | `PreToolUse` refuses a shell dump of an unchanged file already read whole |
| The same probe re-issued per item | 3 | `PreToolUse` refuses an identical read-only command whose answer cannot have changed |
| Polling a condition already watched | 3 | `PreToolUse` refuses a probe — shell **or** `Read` — of a file a **still-running** `Monitor` or backgrounded Bash call in this session is following; the `Read` half judges the watch's own output target by whole path, and a backgrounded command whose completion notice already arrived no longer counts as a watch, so reading its output afterwards is the one read the gate was asking for. The **first** `Read` of a watched file is allowed: only a repeat read of bytes unchanged since the last one is the poll |
| Reasoning about whether a watch is still live | 3 | the `Read` that would have asked the question is allowed instead of refused, so the read *is* the answer; the refusal that remains states its own evidence — the earlier read's timestamp and the file's mtime — so nothing is left to infer |
| Having nothing to wait *on* | 4 | `verify --wait` **is** the wait: one foreground `Bash` call that blocks until the detached run exits, then prints its whole report and exits on its verdict. `--background` returns that exact command under `wait.blocking`, and `wait.input` remains for a run that must stay free |
| Prose composed on stdin | 4 | `commit`/`pr` take `--message-file`/`--body-file`; `PreToolUse` refuses `--message -`/`--body -` and names the flag |
| A second, path-narrowed diff | 4 | `scope --diff` already returned every hunk; `PreToolUse` refuses a single-path `git diff -- <path>`/`gh pr diff <path>` once it has run, leaving the batched multi-path form the prose prescribes alone |
| A JSON shape guessed rather than read | 3 | `PreToolUse` refuses a `node -e`/`python3 -c` one-liner naming a `.json` this session never opened |
| A run ending on a bookkeeping call | 4 | `PreToolUse` refuses a `TodoWrite` that completes the closing-turn anchor and carries nothing else |
| A closing turn made only of chores | 4 | `Stop` refuses a final turn whose every call is `TodoWrite`/`TaskUpdate`/`TaskCreate` **or workspace teardown** (`worktree end`, `worktree reap`, `cleanup`, `ExitWorktree`), judged on the turn's shape rather than any tool's input — which is how `TaskUpdate`, ungateable at `PreToolUse`, is reached at all |
| Post-merge branch deletion failing predictably | 4 | `my-command-tools cleanup` settles both halves from the PR: a squash merge's "not fully merged" is deleted on the PR's evidence, an auto-deleted remote ref reports `already-absent` rather than exiting 1 |
| That cleanup composed as raw git anyway | 4 | `PreToolUse` refuses `git push <remote> --delete <branch>` and `git branch -d <branch>` and names `cleanup --branch <branch>`. `git branch -D` is left alone: it is the deliberate discard of work that never landed, and `/mc` prescribes it |
| A dispatched unit making its own worktree | 4 | the dispatching command runs `worktree begin` and hands over `--worktree <path>`; concurrent siblings cannot learn from each other, so the affordance moves to the caller rather than the advice to the callee |
| A dispatched unit told to *enter* a worktree | 4 | the instruction is gone. `worktree begin` reports `workingRoot` and an `enterWorktree` line saying it is not needed, and the prose makes the absolute-path form the normal mode rather than the fallback after a refusal |
| Relative `cd` that cannot resolve | 3 | `PreToolUse` refuses it, naming the absolute form |
| Unquoted glob matching nothing | 3 | `PreToolUse` refuses it — zsh would abort the whole command |
| Foreground `sleep` | 3 | `PreToolUse` refuses it, naming `Monitor` and `run_in_background` |
| Heredoc composing a file | 3 | `PreToolUse` refuses it, naming the `Write` tool |
| Docs prescribing a command the harness refuses | 4 | `check-commands.sh` runs every fenced shell snippet in `src/commands/`, `src/shared/` and `skills/` through the gate's own shape checker |
| The gates not being armed at all | 4 | `state`/`scope`/`commit`/`pr` refuse to run, so an unarmed device cannot start a run |
| Unapproved signing prompt | 3 | `commit` retries once, itself |
| `must be a collaborator` | 3 | `pr` resolves the identity, itself |
| Hand-composed probes the classifier refuses | 4 | named read-only verbs, plus an installed allowlist |
| Turns lost to a shape-incidental refusal | 3 | `shared/classifier-refusal.md` names the form that works for each recorded shape — a chained probe reissued as the one bare command (or as `Read`), a heredoc composition written with `Write`/`Edit` — and states outright that a probe naming a `.env` file is refused for the *file*, so no smaller form of it is a fix and it is never allowlisted or worked around |
| A run ending with no outcome | 3 | `Stop` refuses the stop — for the **outermost** run only, and now with the three exemptions that were swallowing it closed: a re-entered stop is judged again under a ceiling, a subagent transcript beside this one no longer stands it down, and a background job is no longer exempt |
| The closing turn scheduled as a task | 4 | `PreToolUse` refuses a `TaskCreate` naming the run's own final message. Creating the task *is* a tool call, so scheduling that message is what loses it |
| A gate aimed at a tool the matcher omits | 4 | `check-commands.sh` fails when the `PreToolUse` matcher does not name every tool a gate judges. `TodoWrite` was missing, so the anchor gate had never fired |
| `grep --include=<glob>` | 4 | `PreToolUse` refuses the flag whatever its quoting and hands back `rg -g '<glob>'`, with any stray trailing `;`/`,` stripped from the pattern |
| A file composed in the shell | 3 | `PreToolUse` refuses `cat`/`printf`/`echo` redirected into a file, not only the heredoc form, keyed **per target** so the second composition in a session is refused too |
| `cd <dir>` where the cwd already *is* `<dir>` | 3 | `PreToolUse` hands back the command with the `cd` removed, rather than an absolute path to change into |
| A shell program sent from inside a worktree | 3 | `PreToolUse` refuses it first, with the decomposition named — the harness's own refusal names none and repeats |
| `EnterWorktree` from a repository root | 3 | `PreToolUse` refuses the creating form, naming `workingRoot` and the absolute-path mode |
| A whole-file `Read` that cannot fit the token cap | 3 | `PreToolUse` refuses it above 90KB and names the `offset`/`limit` slice |
| A text sweep of an OKF bundle | 3 | `PreToolUse` refuses `grep`/`find` over a directory whose `index.md` declares `okf_version`, and names `okq` |

High tool churn has no gate of its own as an aggregate — but its one recorded *cause* now
does: a session that armed `Monitor`s on a stalled install and then hand-polled the same
condition ~40 times. That is a specific, visible mistake rather than an aggregate, and the
transcript shows both halves, so it is gated. What remains unaddressed is churn with no
identifiable shape behind it, which is by construction not something a gate can see.

## Design rules the hooks obey

These run in every session on the device, so a false denial is worse than a missed
violation. Four properties are non-negotiable:

- **Fail open.** `guard()` in `src/hooks/lib/io.mjs` swallows every exception into a
  silent allow. A hook with a bug degrades to "no opinion", never to a blocked call.
- **Never guess.** Each gate refuses only a case that is unambiguous on its own
  evidence. The relative-`cd` gate fires only when the path genuinely does not exist,
  so the command was going to fail anyway. The re-read gate fires only when *both*
  reads asked for the whole file and the mtime predates the earlier one.
- **Never wedge.** Every denial is recorded per session, and a recorded denial is not
  repeated for the same subject. The worst a gate can cost is one corrected turn.
- **Always actionable.** A denial names the faster form: the batch, the
  `offset`/`limit` slice with the `rg -n 'foo|bar' <file>` locate-first step, the
  `--cwd`/`git -C` absolute-path form.

### Why turns, not calls

The serial-discovery gate counts consecutive assistant **turns** whose tool calls are
all read-only, not read-only calls. That is what makes it reward the fix rather than
punish it: twelve `Read`s sent as parallel calls in one turn are one turn, while twelve
sent one per turn are twelve. Counting calls would refuse the batched form it exists to
produce.

### Why one hook for two gates

Serial discovery and redundant reads are the same defect along two axes — discovery
spread across turns that should have been one, and the same bytes paid for twice — and
both are decided from the same transcript. One hook parses it once and cannot return two
answers that disagree.

### Why a batched turn must never be harder than a serial one

Every gate that counts anything counts **turns**, and every gate that judges a probe judges
it from evidence about *that command* and *that path* — never from how many calls a turn
carried. This is a hard constraint, not a preference: the rule that reported serial
discovery was **dismissed** in four of the buckets it fired in, because the measurement it
comes from has no turn boundary and no parallelism marker, so one turn issuing eight
parallel `Read`s is recorded identically to eight serial round-trips. Sessions that
announced "reading the core files in one batch" were flagged anyway.

So the gates target the two shapes that are unambiguous whatever the turn structure —
**re-narrowing** (asking for a range of a file already read whole and unchanged) and the
**repeat-identical probe** (the same command re-issued with nothing since that could have
changed its answer) — and a test asserts that a turn issuing seven parallel `cat`s of
distinct files is not refused. A change here that makes the parallel batch harder is wrong
by construction, however many violations it catches.

### Why the transcript, not a sidecar

Both read-only gates get their evidence from the session transcript at
`transcript_path`. It is authoritative where a state file is not: it survives the hooks
being installed mid-session, it is per-session with no keying of our own, and it
distinguishes one turn carrying six parallel calls from six turns carrying one each.
The only sidecar state is the anti-wedge record.

### One assistant message is one turn, and the transcript does not say so

Every gate here counts turns, and the transcript does not hand them over. One assistant
message is written as **one JSONL record per content block** — a turn carrying text and eight
parallel `Read`s arrives as nine records, each with its own `uuid`, all sharing one
`message.id`. `timeline()` treated each record as a turn, so the batched form these gates
exist to produce was measured as its serial opposite.

Two gates were wrong because of it, and both were reproduced live:

- **Serial discovery** refused a single turn of eight parallel `Read`s with "this is read-only
  call #7 in a row, each in its own turn". The turn was the prescribed shape, and the refusal
  cost a turn to correct.
- **Redundant reads** refused nine of ten parallel `Read`s of ten distinct, never-read files,
  each quoting a prior read from milliseconds earlier — the batch's own calls. The exclusion
  for "the turn that issued this call" only checked the *last* record, so every earlier block
  of the same message read as a previous turn that had already read the file.

The fix is to group records by `message.id`, which is the turn boundary observed rather than
inferred. On top of that the discovery gate now counts only **single-call** turns: a turn that
batched several probes ends the run instead of lengthening it, so four correctly batched turns
can never be refused the way four serial ones are. What is left is exactly the recorded
defect — one probe per turn, repeated, with nothing decided in between.

A read is also recorded only when it **returned content**. A `tool_result` marked `is_error`
means the call was refused or failed, and a refused read delivers no bytes, so it can never
make a later read redundant.

### The correction itself must never be refused

Grouping by `message.id` fixed the *history*, not the **current** turn, and one case survived
it for five more days. `PreToolUse` fires while the assistant message is still being emitted,
so when the first call of a batch reaches the gate the other eleven are not written yet: the
turn is indistinguishable from a single-call one, and the counter treats it as one. A recorded
session took the refusal on its fourth single-call turn, did exactly what the refusal asked —
collapsed twelve probes into one turn — and was refused again on the first call of that batch.
That is worse than not gating, because it teaches that batching does not help.

The counter is not the thing to change. It already refuses to count a batched turn, and a long
phase of correctly batched turns — judging, review, doc audit — is never refused for its
length, only a run of genuinely single-call turns is. What failed is the standing rule that a
gate **speaks once per subject and never wedges a run**: `alreadyDenied` was meant to carry it
and cannot do so alone, because its scratch file is best-effort and the calls of one batch race
each other through it.

So the once-per-run guarantee is now read off the **transcript**, which can be neither lost nor
raced: a failed read-only call anywhere in the current run means this run already took its
correction, and the gate stays silent for the rest of it. A probe that failed for an unrelated
reason suppresses the gate too. That is deliberate — fail open is the standing rule, and a run
that is already erroring needs a second refusal least of all.

### A subagent's call carries the parent's transcript

A tool call made inside a subagent arrives with the **parent session's** `transcript_path`,
while the subagent's own turns are written to `<transcript>/subagents/<agent>.jsonl`. Every
gate here reads history, so inside a subagent all of them read the wrong history: reads the
subagent genuinely made are invisible, and turns it never took are counted against it. This
was confirmed by replaying one refused `Edit` against both files — denied with the parent's
transcript, silent with the subagent's, for a file the subagent had read three turns earlier.

That is not a small blast radius. `/task`, `/work`, `/manage` and `/god` all do their work in
subagents, which is where these gates spend most of their firing.

So `foreignTranscript()` stands the transcript-based gates down when the transcript handed to
the hook is not the running run's own, detected by recency: while a subagent is running, its
transcript is being appended to and the parent's is not. The event carries no agent id, so
the subagent's own file cannot be *identified* without guessing — but it does not have to be.
The answer only ever suppresses a denial, so being wrong costs a missed violation rather than
a refused legitimate call, which is the direction the design rules above require. The Bash
shape checks are unaffected: they read the command and the filesystem, never the transcript.

### The read-before-edit gate could not be right

It is **removed**, not narrowed. It refused an `Edit`/`Write` of a path the session had not
read, mirroring the precondition `Edit` and `Write` enforce themselves — and the evidence it
needed was the one thing it could not see. Inside a subagent it read the parent's transcript,
so a file the run had just read looked unread, and it fired twenty-two times in a single
`/task` run: each time the agent read the file and retried successfully, so nothing was
prevented and roughly twenty-two turns were spent. It fired five more times on the run that
removed it, each on a file that run had already read, each costing a turn.

It also refused `Write` of paths that did not exist — a scratch `pr-body.md`, a
`commit-msg.txt` — where the refusal could never be satisfied, because a file that does not
exist cannot be read.

Nothing is unprotected by its removal. `Edit` and `Write` reject a genuinely unread file
themselves, with the same message; the gate could only ever add refusals of correct
behaviour on top of a rule the harness already enforces. The co-change enumeration it carried
went with it — a good answer attached to a question the hook had no standing to ask.

`src/shared/batched-discovery.md` still tells a run to re-establish the precondition after a
compaction. That prose is about the harness's rule, which is unchanged, and it stays.

### The anchor cannot be the last call

The Stop gate is armed and correct, and that is the problem: it kept *firing*. Seven times in
one bucket, and in nearly every case the message immediately before it was a complete, correct
report that simply carried a tool call along with it — most often the call marking the
closing-turn anchor done. The work landed and the outcome did not, through the very
bookkeeping the anchor exists to guarantee.

A fail-closed Stop gate is rung 3 for that: it refuses the ending after the run has already
been shaped wrongly. The rung above is to make the wrong shape unschedulable. `PreToolUse`
now refuses a `TodoWrite` that completes the closing-turn anchor when that call is the only
thing its turn carries — the exact signature of "mark it done, then speak", which is the
sequence that loses the message. A `TodoWrite` that rides along with real work in the same
turn passes, which is what the commands already tell a run to do.

`TaskUpdate` is still not gated at `PreToolUse`, and for the reason it never could be: its
input carries a `taskId` and a status and never the subject, so nothing there tells the
anchor's row from any other row without guessing. What was wrong was the conclusion drawn
from that — the limit was recorded as "this surface cannot catch it" and left there, while
the recorded runs went on ending on `TaskUpdate` rather than on `TodoWrite`. Six of six
buckets in one range, whole closing turns made of four and five `TaskUpdate` calls in a row.
A gate aimed at the tool nobody was calling is a gate that does not exist.

The limit is narrower than it was written. It binds `PreToolUse`, which sees one call before
it happens and has only that call's input to judge; it does not bind Stop, which sees a turn
that already finished. So Stop stops asking which tool was called and asks **what the turn
was made of**: a final turn whose every tool call is task-list bookkeeping — `TodoWrite`,
`TaskUpdate`, `TaskCreate`, in any combination and any count — is refused. No subject is
needed for that judgement, which is precisely why it is available here and not there.
Marking rows is not work, so a turn containing nothing else did nothing else, whatever those
rows happened to say; the run's last real action was the turn before it, and its outcome was
never recorded. The existing exemptions all still win, and in this order: a completed run
owes nothing, a nested run's return marker hands back rather than closing, and a turn whose
every call failed was interrupted rather than finished.

Anything the closing turn carries besides a chore passes, unchanged — a report that
rides along with real work was never the failure.

**And the shape is not only bookkeeping.** Reading the turn rather than the tool name is what
made that visible: a recorded run pushed its PR, then closed on a lone `my-command-tools
worktree end` and recorded no outcome, which is the identical failure reached through the
identical shape. Tearing down the workspace is no more the work than marking a row is — it is
the other closing chore, it sits in exactly the same position, it returns quietly, and the
message that was meant to follow it never gets sent. `shared/closing-turn.md` already names
`ExitWorktree`, `worktree end`, `verify` and a closing `gh` call as the calls that swallow the
outcome; the gate now refuses the two of those that are pure teardown, on the same evidence
and with the same exemptions. `verify` and `gh` are deliberately not in the set: both can be
real work, so a turn ending on one is judged by the existing rules rather than by this one.

### Only the outermost run owes an outcome

The Stop gate was demanding a text-only turn from runs that must not spend one. A text-only
assistant message ends the assistant's turn and returns control to the user, so a command
invoked **inline** by another — `/clean` and then `/pr` inside `/task`'s Step 3, in one
session — stranded its parent's remaining steps by closing. On this repo's PR #90 both
`/task`'s worktree teardown and its closing report were stranded that way, and this gate
fired mid-pipeline on top of it, demanding the very turn that does the stranding. The gate
was arguing for the defect.

So `shared/closing-turn.md` now distinguishes a nested handback from a run close (see
[Run markers](run-markers.md)), and the gate reads the same distinction off the transcript
rather than being told:

- **A handback is not an ending.** The last turn carries a tool call *and* text whose last
  line is a `RETURN /<command>` marker — the prescribed nested shape, report and marker
  riding the parent's next call. Nothing is owed, so the gate is silent.
- **A pipeline mid-flight is not an ending either.** `nestedRunOpen()` counts `Skill` calls
  since the last real prompt against return markers seen since then; while one is unaccounted
  for, a command this session invoked inline is still running and the outermost run has steps
  after it. Counted rather than paired, because the parent issues the `Skill` call and the
  child writes the marker, and one handback message carries the child's marker beside the
  parent's *next* `Skill` call.
- **A genuinely abandoned outermost run still gets refused**, with the message now saying
  outright that the outcome is owed here even if a nested command already reported.

Both exemptions are checked **before** `alreadyDenied`, so a legitimate handback never spends
the one-denial-per-subject budget that a later real abandonment needs.

Two misses are accepted deliberately, on the standing rule that a false denial costs more than
a missed violation. An outermost run abandoned *while* a nested command is open is not
refused — the evidence cannot separate it from the mid-pipeline case. And an outermost run
whose last message happens to carry both a tool call and a trailing return marker is allowed,
because that is indistinguishable from a handback. Neither is guessed at.

**A subagent run is unaffected**, and needs no exemption: `SubagentStop` is not registered, so
a dispatched run never reaches this gate at all. It closes in its own text-only turn because
its final message reports *to* the parent session rather than taking a turn *in* the parent's
conversation, so nothing of the parent's is queued behind it.

### A Stop hook fires at every yield, not only at an ending

The exemptions above were the right idea and far too few. In the week after they shipped the
gate fired **138 times**, and the log says none of it was the failure it was built for:

- Every firing took the `endsOnToolCall` branch. The branch for a last message with **no text
  at all** — the shape that genuinely records nothing — never fired once.
- **53** of them logged `unclosed=0`: a text-only turn had already closed the current prompt,
  and the gate demanded a second report for a question already answered.
- **88 of the 140 log lines were not sessions at all.** `f1`, `f3`, `n4` and `n5` are fixture
  ids from `hooks.test.mjs`, which inherited `CLAUDE_CONFIG_DIR` and wrote into the human's
  real `~/.claude/my-command/hooks.log` on every `pnpm test`. The gate's own evidence file was
  filling up with the gate testing itself. The suite now points that variable, and
  `CLAUDE_JOB_DIR`, at a scratch directory.

The root cause is structural: **a Stop hook fires whenever the agent yields the turn**, and
yielding is not ending. The gate had two proxies for "still mid-pipeline" — a `RETURN /<cmd>`
marker on the last line, and unmatched `Skill` calls — and real pipelines pause in shapes
neither one sees. So the gate now establishes *why the loop stopped* before it says anything,
and each of these returns silently:

- **Nothing is owed.** `unclosedPrompts(line) === 0` means a text-only turn already answered
  the current prompt. Checked first, because it is the largest single class of false firing.
- **The transcript is not this run's.** `foreignTranscript()` — which every other gate already
  called and this one did not — so a run is never judged from a subagent's parent transcript.
- **The session is not interactive.** `CLAUDE_JOB_DIR`, `MY_COMMAND_NON_INTERACTIVE`, or `CI`:
  a background job's harness enforces its own outcome line, and there is nobody at a terminal
  for a warning to reach.
- **The loop stopped for a reason of its own.** Every call in the last turn came back
  `ok: false`, so nothing it tried actually ran; or the turn ended on a tool that hands
  control back by design — `AskUserQuestion`, `ExitPlanMode`, `Monitor`, a `run_in_background`
  Bash, an `Agent` dispatch with no completion notice yet.
- **A run this session set going is still open.** `nestedRunOpen()` now counts three shapes,
  not one: an inline `Skill` call, an `Agent` dispatch, and a headless `claude -p` shell out.
  A dispatch is never counted against a return marker, because it writes none into this
  transcript — its report comes back as a tool result, and a backgrounded one as a completion
  notice, so it is open until whichever has arrived. **A refused or errored call is no longer
  counted at all**: it started nothing, and counting it left `invoked` permanently ahead of
  `returned` and the gate silent for the rest of the prompt. A gate that cannot fire is worse
  than one that fires wrongly, because nothing reports it.

Two further changes follow from the same evidence:

- **`block()` is reserved for the one unambiguous shape** — a last message carrying **no text
  at all**. A message that did say where the run stands and merely carried a tool call along
  with it gets a `systemMessage` warning and the log line, which is where the durable value
  was all along. The log line keeps its existing shape, so the record stays comparable across
  the change.
- **The transcript is re-read once when its last turn is fresh.** The records are appended
  live, and a text-only closing message was observed being blocked anyway — written moments
  before the hook read the file and not yet flushed. When the last turn's timestamp is within
  2s of the stop *and* the gate is about to speak, it pauses 250ms and judges a second time.
  Only then, so the pause is paid on the rare stop rather than on every one.

One shared correction came with it. `timeline()` now drops a `user` record that is a **harness
notice** — one carrying `<task-notification>` or the `[SYSTEM NOTIFICATION - NOT USER INPUT]`
preamble — exactly as it already drops one carrying only `tool_result` blocks, and for the
identical reason given there: it is the harness handing back work the assistant set going, not
a person giving new instructions. Read as a prompt it restarted a discovery run nobody
restarted and opened a task nothing could close, which is why `unclosed` climbed in every
backgrounded session.

### The outcome gate was armed and exempting itself

The gate was measured again over 13 later buckets and had missed **eight** confirmed runs — a
`/god --no-review` closing on `TaskUpdate(4)`, `TaskUpdate(5)`; two `/mc -t` runs closing on
`worktree end` plus bookkeeping; `/task -b`, `/work --area`, `/ideate`, and two `/fb -t` runs, one
of which failed at its seventh call with "branch does not exist locally or on origin", spent its
last two calls listing branches, and never said so.

The shape logic was not the problem — it already reads the turn rather than the tool. **Three
exemptions were**, and each one is now either gone or bounded:

- **`stop_hook_active` returned outright.** So the gate could speak at most once per session, and
  a run that took the block and then ended on *one more* chore turn exited unreported. Two buckets
  carry the injected "This run has not recorded its outcome" feedback **and** record nothing for
  their root, which is that sequence exactly. The return was never what prevented the loop: the
  per-turn denial key is, and it already speaks to one turn once however often the stop is
  retried. A *different* turn is a decision the agent made after being told, and is judged again.
  `MAX_REMARKS = 3` guarantees termination anyway, so a session can always end.
- **`foreignTranscript()` stood it down.** It has no business in `Stop` at all. Only `Stop` is
  registered — never `SubagentStop` — so every event this gate sees belongs to the session that
  owns the path. And the test it uses is *recency*: "a subagent transcript beside this one is
  newer". At a subagent's call that means "this is not your history"; at a **parent's stop** it
  means only "this run dispatched something", which is true of every delegated pipeline — and the
  misses are overwhelmingly `-t`, `-b` and dispatched runs. One line exempted the whole population
  the gate exists for.
- **`CLAUDE_JOB_DIR` stood it down.** On the stated assumption that a background job's harness
  requires its own outcome line. It does not, and a backgrounded command run is precisely the shape
  the misses came in. `CI` and `MY_COMMAND_NON_INTERACTIVE` stay: the first has no terminal for a
  warning to reach and no agent left to correct anything, the second is this repo's documented
  opt-out.

And one thing was simply not wired. The `PreToolUse` matcher read
`Read|Grep|Glob|Bash|Edit|Write|NotebookEdit|MultiEdit`, so the trailing-anchor gate — which judges
`TodoWrite` — **had never been invoked**. It shipped, was documented at rung 4, and was a file
nobody executed, which is the same failure as "the gates not being armed at all" one level down.
`check-commands.sh` now fails when the matcher does not name every tool a gate judges.

`TaskCreate` is now gated as well, and by subject rather than by shape, because its input carries
one. One recorded run spent its last three calls creating tasks, one of them reading "Deliver the
final report as a message with text and zero tool calls", and then sent nothing: creating the task
is itself a tool call, so scheduling that message is the mechanism that loses it. The `TodoWrite`
anchor `/task` prescribes is untouched — it is written at the *start* of a run, and only completing
it as a turn's sole content is refused.

**What is still not caught, deliberately.** Two of the eight misses end on a turn that carried
read-only probes *and* text (`7a47b8ff`, probes plus `TaskUpdate(1)`; `3885b75c`, `ps` and `lsof`
after a `kill`). Those get the warning, not the block, and folding read-only probes into the
chore-only shape would mean blocking a turn that said "here is what I found" beside ten `Read`s —
a false denial of the batched form, which no gate here is allowed to make.

### A refusal that names no alternative is paid for every time

Three of the shapes added above were already being refused — by Claude Code itself, not by
anything here — and the refusals were costing turns anyway, because none of them names the working
form and none of them is once-per-subject:

- **The worktree-isolation refusal.** "This command is too complex to verify that it stays inside
  the worktree; break it into plain, separate commands." Still not ours to narrow, and the section
  below stands. But one recorded worktree collected **nine** of them across four sessions, and one
  run took five inside its first fifteen calls before adapting. So `shellProgram()` — until now
  deliberately unwired, on the argument that a second gate over the same shape could only refuse
  what is refused anyway — **is wired**, scoped to a cwd under `.claude/worktrees/`, which is the
  only place the harness refuses. The value is not the refusal; it is that this one hands back the
  decomposition and then stays quiet. The same loop outside a worktree runs, and is untouched.
- **`EnterWorktree` from a repository root.** A dispatched run starts at a root by construction,
  so the call cannot succeed — and it was recorded as one of the run's *first* actions in nine
  sessions across three buckets, at node 9 or 10. The prose already said entry is not needed and
  `worktree begin` already reports `workingRoot` for the purpose; prose is the rung that failed.
  Only the creating form is refused; `path` enters a worktree that already exists.
- **A whole-file `Read` past the tool's token cap.** Six refusals of "File content (N tokens)
  exceeds maximum allowed tokens (25000)", on files of 25,923–37,456 tokens, **rediscovered one
  file at a time by four separate sessions**. This is the one gate here that fires on a *bound*
  rather than a certainty — the cap is in tokens and a hook cannot tokenize — so the bound is set
  where it is safe: 90KB, which fits 25,000 tokens only by averaging more than 3.6 bytes per token,
  and a read that close to the ceiling is one edit from failing anyway. A slice is never refused,
  so the corrected call always goes through, and the denial is once per path.

### `grep --include` was the wrong question, quoted

The unquoted-glob gate refuses a pattern that matches nothing and hands back the same command with
that pattern quoted. For `grep --include=*.ts` — at least ten recorded sessions — that answer is
incomplete, and for four of the recorded patterns it is **wrong**: they carried a stray trailing
`;` (`*.tsx;`, `*.stories.tsx;`, `lib/aem-source/*.ts;`, `*.json;`), so quoting them as written
turns an abort into a silent zero matches, which is worse because it looks like an answer.

So `--include`/`--exclude` with a glob is refused on its own terms, whatever the quoting, and the
denial hands back `rg -g '<glob>'`: there the glob is the program's own argument by construction,
there is no quoting decision to get wrong, and `rg` reports a pattern it cannot use. The stray
separator is stripped from the replacement and reported as a separate fact. The unquoted-glob
denial also reports and repairs it now, for the patterns that reach it by another route.

### Composing a file in the shell is not only a heredoc

The heredoc gate saw a heredoc, and keyed one denial per session under `heredoc:write`. Both
halves were too narrow for what was recorded across eight buckets: `cat >` writing **production
source** (`server/nexus/src/lib/graph/errors.ts`), `cat >` composing a commit-message file that
`commit --message-file` takes directly, `gh pr view` appended into a file. And a session composes
several files, so the second one went through unrefused and failed in the shell instead.

It now refuses any redirect whose content the **shell itself supplies** — `cat`, `echo`, `printf`,
or any segment feeding a heredoc into a redirect — keyed per target file. A program capturing its
own output (`pnpm test > log`, `gh pr view --json … > pr.json`) is not this shape and is left
alone: that is capturing a result, not composing a document, and refusing it would take the
backgrounded log file the watch gates depend on with it. A target the shell computes — `$…`, a
backtick — is skipped, which keeps the `$CLAUDE_JOB_DIR` scratch write the job harness prescribes
allowed, as the section below requires.

**This is the one criterion in the range that did not climb a rung, and the reason is worth
stating.** Rung 4 for a shell-composed write is removing `Bash`'s redirect, which is not available
from this repository; the doc-prescription half is already rung 4 (`check-doc-snippets.mjs`), and
the two toolkit affordances that drew the shape are already rung 4 (`--message-file`,
`--body-file`). What was left was coverage, and coverage is what changed: the gate now sees the
non-heredoc compositions and speaks once per file rather than once per session.

### The polling gate judged a watch's arguments as its output

`watchedPaths()` keyed on every filename-shaped token of a watch's command line, and answered the
shell half of the polling gate. That refused a **first** probe of `server.ts` and of
`artifactDownload.ts` because a `Monitor` command happened to name them — the script a watch runs
and the config it was handed are on its command line too, and a first look at either is discovery.
Both halves now ask the narrower question `watchedOutputs()` already answered for the `Read` half:
the watch's own redirect, `tee`, or `tail` target. `watchedPaths()` is removed rather than left as
the broad reading for one caller.

The rest of that criterion's firings were the gate working: `verify.log`, `control.log`,
`vite.log`, `gates.log` and a `.base.ref` redirect target were all genuine hand-polling of a live
watch, and `verify --wait` is already the rung-4 answer for the largest of them.

### `cd <dir>` from inside `<dir>`

The relative-`cd` denial walks up from the issuing directory and names the absolute path the `cd`
was reaching for. When the cwd **is** the target — `cd server` from inside `…/server`, recorded
three times in a row in one session and in five others — that answer is beside the point: there is
no directory to change into, the `cd` is a no-op the shell nonetheless aborts on, and the fix is to
drop it. The denial now recognizes that case and hands back the command with the leading `cd`
removed, plus where to read the cwd from instead.

### Two criteria have no mechanism in this repository

Recorded, judged, and confirmed — and both name a file that does not exist here:

- **The environment-file read guard.** Five firings, every one a **false positive**: a test harness
  piping fixture strings through the guard while hardening it, `tsx --env-file-if-exists` handing a
  path to a runtime that never reads it into context, `set -a && . <file> && set +a` sourcing
  variables before running a script, and — twice — a command whose only mention was a *quoted
  phrase inside prose* being written to a JSON store, with no path and no read.

  That last class reproduces on demand, and did so three times while this criterion was being
  implemented: a shell command whose text merely *names* the file is refused, so the search that
  located the guard, and the command that would have written this very section, were both blocked.
  The section exists because the text was assembled from fragments instead.

  The guard is `block-env-files.sh`, a device-level hook under `~/.claude`, and nothing in this
  repository installs, registers, or references it. The fix is a change to that script, and it is a
  **narrowing**: it should match a *read of the file's contents into context* — a `Read` of the
  path, `cat`/`head`/`sed` over it, a substitution capturing it — and not a path handed to a
  runtime as an argument, a `.`/`source` that sets variables, or the file's name inside a quoted
  string.

  The rung-4 answer, plainly: **stop matching the file's name at all.** The name is not the risk.
  The risk is contents reaching the model's context, which is a property of *which tool* is handed
  the path and whether its output returns to the transcript — not of those characters appearing
  somewhere on a command line. A guard keyed on the name will go on refusing prose that talks about
  it, and no narrowing of the pattern removes that class; keying on the reading tool does, and it
  is strictly more accurate about the thing being protected.
- **The cori-trends batch loop.** `src/commands/cori-trends.md` is named in the criterion and is
  not in this repository — there is no such command here. The behaviour it describes is answered
  generically instead, by the oversized-`Read` gate above, which fires for any command's batch loop
  rather than for that one; the double-read of each batch file is already the redundant-read gate's
  subject.

## Read-only classification

`src/hooks/lib/read-only.mjs` decides whether a call only reads. Its bias is asymmetric
on purpose: calling a mutation read-only inflates a discovery run and can deny a
legitimate call, while calling a probe not-read-only merely resets a counter. So
anything unrecognized is **not** read-only, a segment containing a substitution,
redirection, or `sudo` is never read-only, and `sed`/`perl` are absent entirely because
one missed in-place flag writes to a file.

## Arming, and proving it

**A rung-3 mechanism whose activation is an unverified manual step is only as strong as
that step.** The gates above shipped, were merged, and then did not execute for a week: on
the device that motivated them, `~/.claude/my-command/hooks` was never created and neither
hook appeared anywhere in `settings.json`. Command *files* had arrived — `judge.md` and
`improve.md` were both present, from PRs that merged afterwards — so commands reach a device
by a path that did not run `scripts/install-personal.sh`, and therefore never registered
anything. Every rule these gates enforce kept tripping in that window, and nothing anywhere
reported that no gate could have fired.

That path was the `npx` wizard, which installed the commands and the toolkit and stopped
there; it now arms the gates too, which is what closes the hole rather than only reporting
it. Three things close it:

- **Every Claude install surface arms them**, so there is no longer a way to arrive with
  the commands and without the gates. See [Install and off switch](#install-and-off-switch).
- **`doctor.hooks`** answers it from the two places that decide. For every entry the
  settings fragment declares, it reports whether that exact command is registered in the
  `settings.json` the harness reads, and whether the installed hooks directory is current —
  a symlink to *this* checkout, or the copy the wizard left and runs the toolkit from
  beside. `armed: false` names the missing entries, states the consequence —
  "they are files nobody executes" — and carries the `hint` that fixes it. **That hint
  follows the install surface**, because naming the wrong command is worse than naming
  none: a checkout gets `bash …/scripts/install-personal.sh`, a wizard-installed device
  gets `node …/hooks/install-hooks.mjs` since the scripts are already there and only the
  merge is missing, and a device with no hook bundle at all gets
  `npx @llevasseur/my-command`. A `settings.json`
  that cannot be parsed reads as unarmed rather than as absent, and `disabledByEnv` reports
  the off switch separately from a failure. The logic is `src/toolkit/lib/hooks-status.mjs`,
  tested against the real fragment.
- **`/sync` reports that status rather than assuming it.** Its step 5 previously said the
  registration "is re-applied idempotently" and reported nothing about whether it was.
  It now reads `hooks.armed` and calls `false` a **failure of the sync**. The installer
  checks the same field itself after registering, so the final line of a fresh install is
  what `settings.json` actually says rather than what was attempted.

`check-commands.sh` holds all three in place: `doctor` must still report hook registration,
both `/sync` surfaces must still read `hooks.armed`, and invariant 12 asserts the wizard
still copies the bundle and calls `installHooks()` on **both** Claude install paths — an
install surface that skips them ships the commands with the gates inert, which is exactly
the failure above.

### Why reporting it was not enough

All three of those were still **reports**, and a report only works on someone who reads it.
Nothing a session calls reads `doctor`, `/sync` runs when a human decides to sync, and an
unarmed device stayed fully runnable in between — so the row above sat at rung 3 with a
rung-1 activation, and the closing-turn rule went on regressing in buckets recorded entirely
after the reporting shipped. The device this was written on read `armed: false` the whole
time and nothing stopped.

So the toolkit now **fails closed**. `state`, `scope`, `commit`, and `pr` — the verbs a
workflow command opens with, before it has done anything — exit non-zero when the gates are
not registered, with the arming command and the escape in the payload. A run cannot begin on
a device where the Stop gate would not fire, which is the affordance removed rather than
reported: the unarmed state is no longer a state you can work in.

- **One detector, not two.** `deviceHooksStatus()` in `src/toolkit/lib/hooks-status.mjs`
  resolves every path from where the toolkit file actually sits, and both `doctor` and the
  gate call it. They cannot disagree about whether the gates are armed, and `doctor`'s own
  private copy of that resolution is gone.
- **`doctor` is never gated.** It is how a refused device finds out what to run.
- **`armed: null` passes**, matching the hooks' own fail-open rule: a Codex install
  registers nothing on purpose, and a detector that throws has no verdict to give. Only a
  definite `false` refuses.
- **One documented escape, never the default.** `--unarmed`, or
  `MY_COMMAND_REQUIRE_HOOKS=0`, for CI and a fresh clone; `MY_COMMAND_HOOKS=0` already means
  "the gates are off here on purpose" and is honoured too. The refusal names all of them,
  so a genuinely hook-less environment is one flag away and never silently exempt.

Invariant 13 in `check-commands.sh` asserts the fail-closed path exists — `cli.mjs` calling
`requireArmed`, all four verbs listed, the single detector and the env escape named — and
then runs `MY_COMMAND_REQUIRE_HOOKS=0 my-command-tools state` for real, so CI proves the way
out works on the machine that needs it most.

## Install and off switch

Two surfaces arm the gates, and both do the same two things: put the scripts at
`${CLAUDE_CONFIG_DIR:-$HOME/.claude}/my-command/hooks`, then run
`install-hooks.mjs` to merge the registration into `settings.json`. Shipping the scripts
alone would do nothing: the harness only runs what `settings.json` registers.

- **`scripts/install-personal.sh`** — the clone install. It **symlinks** `src/hooks` to
  that path, so `git pull` updates the gates like it updates the commands.
- **The npx wizard** (`installHooks()` in `src/my-command.ts`, on Claude choices 1 and 2)
  — it **copies** instead, deliberately: npx runs from an ephemeral cache directory that
  is cleaned up when the wizard exits, so the same symlink would dangle and every gate
  would silently disappear. It detects a symlink already at that path and leaves it alone
  rather than writing through it into someone's checkout, and it never removes the
  directory — see the clobbering rule below. A failure there reports itself and does not
  fail the command install, since the commands are useful without the gates.

The **Codex install registers nothing, on purpose.** Codex does have a hook engine, but it
is a different mechanism end to end: opt-in behind a `[features]` flag in
`~/.codex/config.toml`, configured as TOML or `hooks.json` rather than `settings.json`,
gated by a per-hook trust review, and firing `PreToolUse` for the shell tool only — never
for the Read/Edit/Write calls two of these gates judge. These scripts also speak Claude
Code's protocol (`stop_hook_active`, `{"decision":"block"}` on stdout) and parse a Claude
transcript. Installing them from a Codex install would either write Claude settings, or
leave a hooks directory under `~/.codex` that nothing would ever execute. A Codex-native
port is its own piece of work.

**The installer never clobbers that directory.** It used to `rm -rf` it before linking,
which is safe only for the stale-copy case it was written for. A real directory there can
also hold a hook the user installed independently and registered in `settings.json`
themselves — deleting it aims that registration at a path the new symlink does not provide,
breaking an unrelated guardrail to install ours. So: a symlink is repointed; a directory
holding only files this repo also ships is replaced; a directory holding anything else makes
the installer **refuse**, name every file that would be lost, and say that `--no-hooks` skips
the gates entirely. That destructiveness is itself a plausible reason arming was avoided,
which makes it part of the same failure rather than a separate tidy-up.

The merge is additive and identified. Entries are recognized by the hooks directory in
their command path, so a re-run replaces exactly this install's entries and leaves a
hook the user added alone; every unrelated setting survives. A `settings.json` that
cannot be parsed is refused rather than overwritten.

Three ways out, in increasing order of finality:

- `MY_COMMAND_HOOKS=0` in the environment Claude Code runs in — every hook exits
  immediately. Nothing is uninstalled.
- `install-personal.sh --no-hooks` — link the commands and toolkit, register nothing.
- `node ~/.claude/my-command/hooks/install-hooks.mjs --uninstall` — remove the
  registration.

The same fragment also installs a read-only Bash allowlist. That is the other half of
the guardrail work: the routine probes that stay in the shell should not stop to ask,
which is what pushes a run toward composing one big chained command instead.

## Toolkit recoveries

Two failures had exactly one right answer each and were nevertheless returned to the
agent to interpret. Both are now resolved by the verb that hit them:

- `commit` retries **once** on an unapproved signing prompt, after a short wait. The
  failed attempt wrote nothing, so re-issuing the same commit is the whole fix. It
  never rewrites the commit, never passes `--no-gpg-sign`, and never changes signing
  configuration. A second failure means the prompt was never approved, and says so.
- `pr` resolves a `must be a collaborator` rejection by retrying under a token
  belonging to the repository owner, then over REST — whose endpoints accept the
  credential GraphQL refused. The result reports which identity worked.

## Named probes

Rung 4 for the classifier refusals: a probe that has a name is never composed as the
chain that gets refused.

| Verb | Replaces |
|---|---|
| `scope` | `git branch --show-current` + `symbolic-ref` + `$(git merge-base …)` + `git diff --name-only` |
| `prs view\|list\|checks` | hand-written `gh pr view --json a,b,c` and `gh pr list … \| jq` |
| `doctor.checkout` | `$(cd "$(dirname "$(readlink -f …)")/../.." && pwd)` in `/sync` |

## Bash shapes, and why each one is unambiguous

`src/hooks/lib/bash-shapes.mjs` decides these from the command text plus the filesystem, so
each refusal is a statement about a command that was going to fail:

- **Unmatched glob.** An *unquoted* token containing `*`/`?` whose directory exists and whose
  pattern matches nothing there. zsh aborts the whole command with `no matches found`, so
  nothing in it runs. A quoted pattern, one containing a substitution or `**`, and one whose
  directory half is itself a glob are all skipped — the shell would expand them differently
  than this check can model.
- **Foreground `sleep`.** The harness blocks it, and blocks the *whole* call, so the probe
  chained after the wait never runs either. `run_in_background: true` is exempt.
- **Heredoc composing a file.** A heredoc *plus* a redirect or `tee`. Two recorded sessions
  demonstrated the alternative themselves — one wrote its scratch script with the `Write`
  tool, the other wrote `pr-body.md` with `Write` and passed it as a flag — so the denial
  names that form. A heredoc feeding a program's stdin with no redirect is untouched.

  The denial keeps firing, and every recorded firing is followed by the correct rewrite on
  the next call. That is the gate working while the affordance still stood: the refused
  shape was the natural first composition, so each occurrence cost a round-trip. What the
  commands and the toolkit advertise has since changed to the form that is not refused —
  `commit --message-file`, `pr --body-file`, `/cp` writing its stash with `Write` — so the
  heredoc is no longer what a reader reaches for. The gate stays as the backstop.
- **Dumped files.** `cat`/`head`/`tail`/`sed`/`nl` and friends naming a file that exists.
  `grep` and `rg` are deliberately **not** dumpers: locating a symbol in a file already in
  context is the faster form the re-read gate recommends, and gating it would contradict the
  advice. A segment containing a redirect is skipped, since that is a copy rather than a look.

- **Prose on stdin.** `my-command-tools commit --message -` or `pr --body -`. The flag reads
  stdin, and prose worth a flag is multi-line, so the only way to supply it from a shell is a
  heredoc — the shape refused directly above, mid-commit and mid-PR, inside the isolated
  worktree where these verbs run. Thirteen refusals across five recorded buckets were this
  exact call, each reissued as `Write`-then-path one turn later. So the affordance is gone
  from the taught form: the verbs now take `--message-file <path>` / `--body-file <path>`,
  the commands teach only that, `check-commands.sh` refuses prose that teaches the stdin
  form, and the gate's refusal names the replacement flag by name. `--message -` still
  *works*, so a pipeline that already feeds it is not broken; nothing points an agent at it.
- **A second, path-narrowed diff.** A `git diff`/`gh pr diff` segment narrowed to a **single**
  path, once `my-command-tools scope --diff` has run earlier in the session. That first call
  already returned every changed file's hunks with line numbers attached, so the narrowed call
  can only re-fetch bytes already in context — and the recorded shape is not one stray call
  but the whole file list walked one path per turn: thirty-three such turns in one bucket,
  forty-six in the next, one review spending thirty-five turns on a PR diff.

  The exemptions are what keep this gate from contradicting the prose beside it.
  **Several paths in one call pass**, because that is the batched form
  `shared/batched-discovery.md` prescribes — the fix for the walk rather than the walk, and
  refusing it would leave a run told two different things by two surfaces of one rule. An
  enumeration or a summary passes too (`--name-*`, `--stat`, `--numstat`, `--shortstat`,
  `--summary`, `--quiet`, `--exit-code`, `-s`/`--no-patch`): none of them returns hunks, and
  `--quiet` returns an exit code alone. `--cached`/`--staged` passes because it asks about the
  index, which `scope --diff` never reported and nothing re-checks after it ran. With no prior
  `scope --diff` the gate stays silent, since then the diff is the first call, not the second.

  The prose-and-gate agreement is asserted mechanically rather than grepped for: prose has to
  be able to *name* the shape it forbids, so no pattern can tell a prescription from a
  prohibition. `src/hooks/hooks.test.mjs` reads the line `batched-discovery.md` prescribes and
  runs the gate over it.
- **A JSON shape guessed rather than read.** A `node -e` / `bun -e` / `python3 -c` /
  `deno eval` one-liner whose text names an existing `.json` file this session never opened.
  The recorded failures are all the same: a one-liner written against a field layout the
  session assumed, failing on the shape it actually found. The file is right there, and a
  `Read` of it costs less than the failed run plus the retry. Touching the path first — by
  `Read` or by any shell dump — clears the gate, and a one-liner naming no JSON file, or one
  the session already read, is untouched.

  The runner flag has to belong to the runner: only the runner's own options may sit between
  them, so `node scripts/gen.mjs pkg.json | grep -e ERROR` runs a script on disk and the `-e`
  further along the pipeline is grep's. And a path the one-liner only **writes** — a redirect
  target, or the argument of `writeFileSync`/`json.dump` and friends — is skipped, because a
  document being written was never guessed at; there is no shape to have got wrong.

### The docs may not prescribe a refusal

The gates judge what a run sends, and what a run sends is usually what a command file told
it to send. So a snippet in this repo's own documentation is not documentation to the
harness — it is the command, one substitution away.

`/cp` step 3 prescribed its five-deep stash rotation as a `for i in 3 2 1` loop over
`$((i + 1))` paths, and **it was refused on every run that followed it**. The refusal was a
false positive on substance: every path in the snippet was under `~/.claude`, so it
contained no git operation and no repo-relative write. It was a true positive on shape — a
worktree-isolated session cannot resolve a loop-computed path by reading the command, and
`/cp` says itself that it is usually invoked from inside a worktree, which is where `/task`
puts every run. The docs prescribed a call the harness would not run.

One bad snippet is a bug. **A repo that can grow another one silently is the defect**, and
that is what is gated: `scripts/check-doc-snippets.mjs` extracts every fenced shell block
from `src/commands/`, `src/shared/`, and `skills/`, and runs each one through the same
`bash-shapes.mjs` the `PreToolUse` gate uses, plus `shellProgram()`. `commands/` is
generated from `src/commands/`, so it is deliberately not swept — it would report every
snippet twice. Running it over the repo as it stood found the `/cp` loop in **both** the
command and its Codex skill, which is the argument for the sweep rather than a fix: the
paired bundle means one prescribed refusal is always at least two files.

**A block nobody is being told to run declares itself**, with `<!-- not-run: <reason> -->`
on the line above the fence. That is not a suppression hatch — it is the one distinction a
fence cannot carry on its own. The real cases are a shell function a human pastes into
`~/.zshrc` and a file template an agent writes rather than executes, and both look exactly
like an instruction.

Two design rules carried over from the gates themselves. **The construct set is observed,
not guessed**: each shape in `PROGRAM_CONSTRUCTS` was sent to a real Bash call from inside
an isolated worktree and watched. A loop whose body uses its own variable and a function
definition are refused; an input redirect, an `&&` short-circuit, a bare `$(( ))`, an
assignment the next command reads, two plain commands on separate lines, and a heredoc
feeding stdin all run — so `if` and `&&` are deliberately **absent**, because they branch
without computing anything a reader cannot follow. And **a placeholder is substituted before
anything is judged**, because a doc snippet is not yet a command: `<the sentence>` ends in
`>`, which read as a redirect and turned `/teach`'s working stdin heredoc into a reported
"heredoc composes a file". Judging the unsubstituted text reports shapes that never reach a
shell.

`shellProgram()` lives in `bash-shapes.mjs` with the rest of the shape logic but is
**deliberately not wired into the `PreToolUse` gate**. The refusal it models is the
harness's own and already fires there; a second gate over the same shape could only refuse
what is refused anyway, and would be the one place these hooks guessed rather than knew.

### The worktree-isolation refusal is not ours to narrow

The refusal that motivated all of the above —

> this command is too complex to verify that it stays inside the worktree; break it into
> plain, separate commands

— is emitted by **Claude Code's own built-in** worktree gate, not by anything in
`src/hooks/`. Neither that sentence nor the rule it states appears anywhere in this
repository; `pre-tool-use.mjs` has no worktree-isolation check to scope, and the heredoc
refusal it *does* carry describes that external mechanism rather than implementing it.

So "narrow the isolation check to git operations and repo-relative writes, with a
safe-prefix allowance for `~/.claude/` and `$CLAUDE_JOB_DIR/`" is a change to the harness,
and cannot be made here. What is available from this side is rung 4, which is what shipped:
remove the affordance. The `stash` verb means `/cp` no longer sends a shape that has to be
judged at all, and the doc-snippet invariant means no other command can start.

This repo has been here once before, from the other direction. The `$CLAUDE_JOB_DIR` gate
below was **ours**, it refused the path the harness prescribes, and it was deleted rather
than softened. Both entries are the same lesson: where a shape is safe and a gate cannot see
it, the answer is to stop sending the shape or to stop gating it — never to teach a parser
to unroll loops.

### The job directory is not a gate

There was a fifth shape here: `$CLAUDE_JOB_DIR` addressed from inside a worktree, refused
because "the worktree is the only writable root". It is **removed**, not softened, because
it refused exactly the path the harness prescribes — the job harness tells a session to keep
its scratch under `$CLAUDE_JOB_DIR/tmp`, so a gate that denies that path denies the
instruction the session was given and leaves no scratch location at all.

The refusal was also not the same twice. One denial per subject meant an identical `Write`
was allowed early in a run and refused later, which is worse than either answer on its own:
one recorded session had `cp src/my-command.ts "$CLAUDE_JOB_DIR/tmp/my-command.ts.bak"`
refused, worked around it with `perl -0pi`, and then lost its own uncommitted edits to the
`git checkout --` that followed. The gate caused the damage it existed to prevent.

And the write is not harmful. The job directory is outside the repository, cannot reach the
worktree's index or working tree, and is cleaned up with the job. "Only writable root" was
a statement about where *the work* belongs, not about where a scratch file may go, and the
two were never the same claim. The prose in `task.md` now says so, so the rule and the gate
cannot contradict each other again.

## Invariants

- **A gate that ships must be wired.** Hook scripts present and executable, both
  events registered in the fragment against `{{HOOKS_DIR}}`, the fragment's matcher
  covering the editor tools as well as the read tools, the installer running the
  registration, and an off switch present. Enforced by `check-commands.sh`.
- **A gate that is wired must be provably armed.** `doctor.hooks.armed` is the check, and
  a negative is loud. A mechanism nobody can confirm is running is prose with extra steps.
- **An unarmed device cannot start a run.** The gated verbs refuse rather than report, one
  detector answers for both, and the escape is explicit. A report nothing reads is rung 1.
- **A legitimate parallel batch is never refused.** Asserted by test — over a transcript in
  the shape the harness actually writes, one record per content block, since a fixture that
  puts a turn's calls in a single record is what hid this for a release. Binding on every
  future gate.
- **A gate judges only its own run's history.** Where the transcript handed to the hook
  belongs to another run, every gate that reads history stays silent rather than judging it.
- **A gate whose evidence is not available does not ship.** Where a gate cannot see what it
  needs to be right, it is removed rather than left refusing correct behaviour — especially
  where the harness already enforces the same rule itself.
- **Fail open, always.** No gate does its own error handling; `guard()` is the entire
  error policy.
- **One denial per subject per session.** A gate cannot refuse the same thing twice. The outcome
  gate is the one exception, and it is bounded rather than open: a *new* closing turn is a new
  subject, and `MAX_REMARKS` caps the session.
- **A gate must be wired to every tool it judges.** The `PreToolUse` matcher names each of them,
  asserted by `check-commands.sh`. A gate aimed at a tool the matcher omits is a file nobody
  executes, and reads exactly like a gate that is working.
- **A gate may not exempt the population it exists for.** An exemption is justified by what it
  keeps out and re-checked against who it keeps out: `foreignTranscript()` in `Stop` and
  `CLAUDE_JOB_DIR` each stood the outcome gate down for the delegated and backgrounded runs where
  every recorded miss happened.
- **Only the outermost run owes an outcome.** No gate may demand a text-only turn from a run
  invoked inline by another, because spending one there strands the parent's remaining steps.
  A gate that would have to guess which case it is looking at stays silent.
- **The docs may not prescribe a shape the gates refuse.** Every fenced shell snippet a
  command, a shared include, or a skill tells an agent to run passes the gate's own shape
  checker, or declares itself not-run. Enforced by `check-commands.sh`.
- **Zero dependencies, Node 22+**, matching the toolkit — the hooks run from a bare
  clone with nothing installed.

## Acceptance criteria

- [x] Three read-only turns pass; the fourth is refused with the batching instruction.
- [x] A batch of parallel read-only calls is one turn and is never refused.
- [x] A non-read-only call, or a user prompt, breaks the run.
- [x] A whole-file re-read of an unchanged file is refused; a re-read after a change,
      a targeted slice, and a whole-file read following only a slice all pass.
- [x] A relative `cd` that does not resolve is refused; a resolving, absolute,
      home-relative, expanded, or `cd -` form passes.
- [x] A run whose last message has no text at all is blocked once; a text-only closing turn
      ends it, and a report that merely carries a tool call is warned about rather than refused.
- [x] The outcome gate stays silent on a prompt a text-only turn already closed, on a
      subagent's parent transcript, in a non-interactive session, on a turn whose every call
      was refused, and on a turn ending in a question, a plan, a watch, a backgrounded
      command, or a dispatch.
- [x] An `Agent` dispatch and a `claude -p` shell out are open nested runs; a refused `Skill`
      call is not, so the gate cannot be wedged permanently silent.
- [x] A transcript whose last turn landed within 2s of the stop is read a second time before
      the gate speaks.
- [x] A background task notification is not counted as a user prompt.
- [x] The suite writes no line into the human's real `hooks.log`.
- [x] No gate refuses the same subject twice, and a malformed event allows the call.
- [x] `MY_COMMAND_HOOKS=0` silences every gate.
- [x] The installer merge is idempotent and preserves foreign hooks and settings.
- [x] `commit` attempts a signing prompt exactly twice, then reports it.
- [x] `pr` reports `identity: "REST"` rather than a `must be a collaborator` error.
- [x] One assistant message is one turn even though the harness writes each of its content
      blocks as a separate record.
- [x] A turn of eight parallel `Read`s is not refused as serial discovery, and four
      consecutive batched turns are not refused either; four consecutive single-call turns
      still are.
- [x] Ten parallel `Read`s of ten distinct files do not refuse each other as reads this
      session already made.
- [x] A `Read` whose result came back an error is not recorded as a read, so re-issuing it is
      allowed; the same transcript with the read succeeding still refuses the re-read.
- [x] No `Edit` or `Write` is refused for want of a prior read — including a `Write` to a path
      that does not exist, which no read could ever precede.
- [x] Every history-reading gate stands down when a subagent transcript beside the one it was
      handed is newer than it.
- [x] The relative-`cd` refusal names the absolute path the `cd` was reaching for, and the
      unquoted-glob refusal carries the same command with the pattern quoted.
- [x] A heredoc feeding a program's stdin is not reported as composing a file, even when the
      command also carries a pipe or a `>` inside a quoted argument.
- [x] A re-read is still refused when the session edited a *different* file in between, and
      the file that did change stays re-readable.
- [x] An unquoted glob matching nothing, a foreground `sleep`, and a heredoc composing a file
      are each refused with the working form named; the quoted, backgrounded, and
      stdin-heredoc forms pass.
- [x] A scratch command under `$CLAUDE_JOB_DIR` from inside a worktree is allowed, and is
      allowed identically on the second call.
- [x] A shell dump of a file already read whole and unchanged is refused; `rg -n 'a|b'` on
      that same file is not.
- [x] An identical read-only command is refused only while nothing since could have changed
      its answer — an action or a new prompt in between allows it, and a duplicate inside one
      parallel batch is not a repeat.
- [x] A turn issuing seven parallel probes of distinct files is not refused.
- [x] Hand-polling a file a `Monitor` in this session is following is refused once; an
      unrelated probe during that watch passes.
- [x] The **first** `Read` of a file a live watch is writing passes, and so does a read of a
      file that has been written to since the last one; only a repeat read of bytes unchanged
      since that read is refused, and the refusal states both timestamps so no liveness
      question is left to answer.
- [x] `doctor.hooks.armed` is `false` with the missing entries named when the gates are not
      registered, `false` when `settings.json` cannot be parsed, and `true` with
      `link.pointsAtCheckout` after the installer runs.
- [x] The installer refuses rather than deletes a hooks directory holding a foreign hook,
      naming it, and arms the gates once it is gone.
- [x] The wizard's hooks step lands the scripts executable, omits the tests, registers both
      entries plus the read-only allowlist, and is idempotent across a second run.
- [x] A hooks directory that is a symlink into a checkout is registered, never copied over.
- [x] A hooks step that fails reports why and leaves `settings.json` unwritten, and the
      command install still succeeds.
- [x] The `armed: false` hint names a command that exists on *that* device: the installer
      script in a checkout, the shipped merge on a wizard install, the wizard itself when
      no bundle landed.
- [x] Gates copied in place read `armed: true` with no hint, rather than as a stale copy.
- [x] Every gated verb exits non-zero on a device whose gates are not registered, naming the
      arming command and the escape; `doctor` still answers there.
- [x] The same verb exits zero once the installer has run.
- [x] `--unarmed`, `MY_COMMAND_REQUIRE_HOOKS=0`, and `MY_COMMAND_HOOKS=0` each let a
      hook-less environment through, and none of them is the default.
- [x] `commit --message-file <path>` and `pr --body-file <path>` read the prose from the file;
      passing both the file and the inline flag is a usage error, and an unreadable path fails
      with the path named.
- [x] `my-command-tools commit --message -` and `pr --body -` are each refused with the
      `--message-file` / `--body-file` form named, and no command, shared snippet, or **verb
      usage string** teaches the stdin form — the usage strings are prose the agent reads, so
      one advertising `--body -` prescribed the exact call the gate refuses.
- [x] A `git diff -- <path>` or `gh pr diff` narrowed to a single path is refused once
      `scope --diff` has run in the session; the same call with no prior `scope --diff`, and a
      `--name-only`/`--stat` enumeration at any time, both pass.
- [x] The batched multi-path `git diff <base>...HEAD -- <path> <path> …` that
      `shared/batched-discovery.md` prescribes is never refused, asserted by running the gate
      over the line read out of that file; nor is a `--cached`/`--staged` staged check, nor a
      `--quiet`/`--exit-code`/`--shortstat`/`--summary`/`-s` summary.
- [x] A `node -e` or `python3 -c` one-liner naming an existing `.json` this session never
      opened is refused; the same one-liner after that file was read passes. A script on disk
      piped into a binary that takes its own `-e` is not a one-liner, and a `.json` the
      one-liner only writes is not a shape it guessed.
- [x] A `Read` of a file a `Monitor` or backgrounded Bash call in this session is following is
      refused once, naming the bounded wait; an unrelated `Read` during that watch passes.
- [x] That `Read` gate follows the watch's own output — its redirect, `tee`, or `tail` target
      — compared as a whole path: a first read of the script the watch runs, of the config it
      was handed, or of a same-named file in another directory all pass.
- [x] The unread-`Edit` denial lists the refused path's git co-change set as `Read` lines, and
      degrades to the bare instruction outside a repository.
- [x] A `TodoWrite` that completes the closing-turn anchor and carries nothing else in its
      turn is refused once; the same `TodoWrite` alongside other work in the turn passes.
- [x] The `PreToolUse` matcher names `TodoWrite`, `TaskCreate` and `EnterWorktree` as well as the
      read and editor tools, and `check-commands.sh` fails if any tool a gate judges is missing.
- [x] A re-entered stop on the **same** turn is silent, a re-entered stop on a **new** turn is
      blocked again, and the session's blocks are capped so a run can always end.
- [x] A subagent transcript newer than the one handed to `Stop` no longer stands it down; `CI` and
      `MY_COMMAND_NON_INTERACTIVE` still do, and `CLAUDE_JOB_DIR` no longer does.
- [x] A `TaskCreate` naming the run's own closing message is refused; an ordinary one passes.
- [x] `grep --include=<glob>` / `--exclude=<glob>` is refused quoted or bare with `rg -g` named and
      any stray trailing separator stripped from the replacement; `rg -g` itself and a grep with no
      glob flag both pass.
- [x] `cat`/`printf` redirected into a file is refused once **per target**; a program capturing its
      own output, and a redirect target the shell computes, both pass.
- [x] `cd <dir>` issued from inside `<dir>` is refused with the `cd` stripped from the command it
      hands back, rather than with an absolute path to change into.
- [x] A `for` loop sent from a cwd under `.claude/worktrees/` is refused with the decomposition
      named; the same loop elsewhere, and an `&&` chain or `if` anywhere, all pass.
- [x] `EnterWorktree({name})` from a repository root is refused naming `workingRoot`;
      `EnterWorktree({path})`, and either form from a non-root cwd, pass.
- [x] A whole-file `Read` of a file past the size bound is refused naming the slice; the same file
      read with `offset`/`limit`, and any file inside the bound, pass.
- [x] A `grep`/`find` sweep of a directory whose `index.md` declares `okf_version` is refused with
      `okq` named; a directory that declares nothing is swept without comment.
- [x] A nested inline handback — a turn carrying a tool call and text ending in a
      `RETURN /<command>` marker — is not refused, and neither is a stop taken while a `Skill`
      invocation since the last prompt has no marker accounting for it yet.
- [x] An outermost run ending on a tool call with no open nested invocation and no trailing
      marker is still refused, and the refusal says the outcome is owed there even if a nested
      command already reported.
- [x] Every fenced shell snippet in `src/commands/`, `src/shared/`, and `skills/` passes the
      gate's own shape checker, or carries a `<!-- not-run: … -->` declaration; a loop, a
      function definition, and a `case` branch each fail the check, while an input redirect,
      an `&&` chain, a bare `$(( ))`, an assignment, two plain lines, and a stdin heredoc
      all pass.
- [x] A `<placeholder>` is substituted before the shapes are judged, so `/teach`'s
      `pbcopy <<'EOF'` / `<the sentence>` / `EOF` is not reported as a file-composing heredoc.
- [x] The form `/cp` now prescribes — `my-command-tools stash write --content-file <path>` —
      is not refused, asserted by running the checker over it.
- [x] A final turn whose every call is `TodoWrite`, `TaskUpdate`, or `TaskCreate` — in any
      combination and any count — is blocked, and the refusal names the tools it saw; the same
      call alongside any other tool in the turn is not blocked, nor is a bookkeeping-only turn
      whose every call failed, nor one carrying a `RETURN /<command>` marker.
- [x] A `Read` of a backgrounded Bash command's output **after** its completion notice has
      arrived passes; the same `Read` while that command is still running is refused, and a
      `Monitor` is treated as live throughout, its notices being its events rather than its end.
- [x] Both watched-condition denials state that the watch they name is still running, point at
      `verify --wait` as the one call that *is* the wait, and state that the report is written
      atomically at exit so there is nothing to see before then.
- [x] `verify --wait [<verdict>]` blocks until the detached run's verdict file is non-empty,
      then prints that run's whole report and exits on its verdict; with no argument it waits
      on the most recent detached run; it reports a clear error when there is no run to wait
      on; and `--wait-timeout <s>` gives up without killing the run.
- [x] A final turn whose every call is workspace teardown — `worktree end`, `worktree reap`,
      `cleanup`, `ExitWorktree` — is blocked on the same terms as a bookkeeping-only turn, and
      the refusal names what it saw.
- [x] `worktree begin` reports `workingRoot` and an `enterWorktree` line saying entry is not
      needed, and no command tells a dispatched run to call `EnterWorktree`.
- [x] `verify --background` returns a `wait.input` that is a single `run_in_background` Bash
      call, plus the `result` path to read once its notice arrives; the detached run writes its
      JSON result before the verdict file, so a waiter that sees the verdict reads a complete
      result.
- [x] `cleanup` deletes a squash-merged branch git calls "not fully merged" and reports
      `squash-merged` with the PR number; refuses it as `not-merged` when no merged PR exists;
      reports an already-auto-deleted remote ref as `already-absent` with `pass: true`; and
      refuses a branch checked out in a worktree, naming the path.
- [x] `git push <remote> --delete <branch>` and `git branch -d <branch>` are each refused with
      `cleanup --branch <branch>` named; `git branch -D`, an ordinary `git push`, and a
      `git branch` listing all pass, because the force delete is the deliberate discard `/mc`
      prescribes rather than the predictable failure.
- [x] `stash write` rotates a five-deep ring, drops the oldest, and preserves an entry
      containing quotes, backslashes, and newlines byte for byte; `stash restore` reads a
      named slot, and a slot holding nothing is reported with the clipboard left alone.

## What was rejected

- **A workflow step in the commands that start background work**, as the answer to
  hand-polling a watched condition. Rejected: that is rung 2, and the session that did it was
  running a command whose prose already said not to. The transcript records the `Monitor`
  call *and* the polling, so the evidence a gate needs is present — a `PreToolUse` hook
  cannot query live `Monitor` state, but it does not have to.
- **A gate for high tool churn as an aggregate.** Unchanged from the original decision: an
  aggregate of other gates' violations has no failure of its own.
- **Counting probes rather than turns**, anywhere. It would refuse the batched form these
  gates exist to produce.
- **Re-adding the read-before-edit gate so it can fire once for a whole parallel batch.** The
  reported failure is real — six parallel `Edit`s at never-opened files took three separate
  denials inside one turn — but the fix is unavailable on this surface for the reason the gate
  was removed in the first place: inside a subagent the hook event carries the *parent's*
  transcript, so a file the subagent just read looks unread. A batch-wide denial needs the same
  missing evidence the per-call one did, only more of it. **A gate whose evidence is not
  available does not ship**, and `Edit` and `Write` already reject a genuinely unread file
  themselves. What is left is prose, and `shared/batched-discovery.md` already carries it:
  enumerate the files the edit pass will write and `Read` them in one batch first.
- **Refusing a `Read` of the main checkout's copy of a file while a worktree holds that path.**
  The recorded session read the main-checkout copy and then edited the worktree copy, so the
  intent is sound. But the only evidence a `PreToolUse` hook has for "this run is working in a
  worktree" is `event.cwd` — and for a dispatched run, which is where this happened, `cwd` is
  the repository root by construction, precisely the fact the `EnterWorktree` climb above rests
  on. A gate keyed on `cwd` would be silent for every run that has the problem and would fire
  only on runs that do not. Same invariant, same answer.

## Known remainder

Subagent runs and ad-hoc non-command prompts cannot carry an outcome line the way a
command run does, so a share of the missing-outcome measurements are structural rather
than behavioural. `SubagentStop` is deliberately **not** registered for that reason.
Fixing the measurement is a change to claude-proxy's own rule, in another repository.

Two more remainders now sit outside this repository outright, and are written up under "Two
criteria have no mechanism in this repository" above: the environment-file read guard is a
device-level hook under `~/.claude`, and `cori-trends` is not a command this repository ships.

## Related

- Spec: [Command toolkit](command-toolkit.md) — the verbs the recoveries live in
- Spec: [Install wizard](install-wizard.md)
- Spec: [Adding a command](adding-a-command.md)
