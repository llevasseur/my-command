---
name: ab
description: A/B-test two versions of a MyCommand workflow on one fixture branch — two isolated runs that publish nothing, a blind judge, a side-by-side report, and the user's pick recorded as a label.
---

# A/B

Run two versions of one workflow against the same fixture and show which one did
better. Each version runs in a fresh subagent, in its own worktree of the
fixture branch, with only that version's text as its instructions and the shared
arguments as its input. Neither run sees the other, and neither publishes
anything. A third subagent judges the two outputs blind. The user gets a
side-by-side report, and their own pick is recorded as the label.

## Input

`<refA> <refB> [flags] -- <args>`. Everything before the first standalone `--`
is the two refs and this workflow's flags. Everything after it is the argument
string both runs receive, passed through verbatim.

- Each ref is `<rev>:<path>` (a workflow file at a git revision, such as
  `origin/main:src/commands/pr.md`), a path to a file on disk, or `paste`. The
  first `paste` takes the first fenced block the user pasted after the
  invocation, and the second takes the second.
- `--fixture <branch>` — the branch both runs start from. Default: the current
  branch. Refuse the default branch, which gives most workflows nothing to do.
- `--command <name>` — the workflow's name. Default: the shared basename of the
  two paths. Required when either ref is `paste` or the basenames differ.
- `--rubric <text>` — what the judge weighs. Default: which output the person
  who invoked the workflow would rather have received.

## Resolve the trial

Read live state with `my-command-tools state`, then run `git fetch origin` as its
own shell call. Pin the fixture to its sha with
`git rev-parse --verify <fixture>^{commit}` and use the sha from here on, so both
runs start from the same commit. Read both versions: `git show <rev>:<path>`, the
file, or the pasted block. Stop and name the ref if one does not resolve, and
stop if the two texts are identical, because that trial measures noise.

Open the trial directory at `~/.my-command/ab/<command>-<UTC timestamp>/`, outside
every checkout, and save the two versions there as `a.md` and `b.md`. State the
trial back in one line: the workflow, both refs with line counts, the fixture
with its short sha, and the arguments.

## One worktree per arm

Create both with `my-command-tools worktree begin --branch ab/<trial>-a --base
<fixture sha> --bootstrap` and the same for `-b`, one call each. Each arm needs
its own branch, because git will not check one branch out twice. The branch name
matters: `my-command-tools pr` always previews a branch under `ab/`, so an arm
that forgets `--dry-run` still publishes nothing. If a bootstrap fails, tear
down what was made and stop.

## Run both arms, isolated

Start both subagents together so neither can be shaped by the other's result.
Each one gets only:

- its worktree path, as the only place it may work;
- the invocation as the user would type it, the workflow name plus the shared
  arguments;
- that version's full text, as its instructions for that invocation.

Tell each arm the same rules: follow only the given text and never read
another copy of the workflow; publish nothing — every `my-command-tools pr` call
carries `--dry-run`, no `git push`, no writing `gh` call, no hosted store —
skipping only the publishing call and noting it; local commits on the `ab/`
branch are fine; count every refusal it takes; close exactly as the text says;
and end its final message with a fenced `ab-report` block listing
`refusals: <n>`, each refusal's first line, and each skipped publish. Never give
an arm the other arm's text, ref, or path, and never tell it which arm it is.

## Collect each run

Read the outputs in one batch. For each arm:

- **Output** — the `pr` preview at
  `<git dir>/my-command/pr-dry-run.json` (its `title`, `body` and `action`) when
  the arm ran `pr`, where the git dir is
  `git -C <path> rev-parse --absolute-git-dir`. Otherwise, its final message
  without the `ab-report` block. Add its commits and diff stat against the
  fixture sha.
- **Turns, tokens and duration** — whatever the subagent result reports.
  Write `unknown` for a figure it does not carry, and never estimate one.
- **Refusals and skipped publishes** — from the `ab-report` block.
- **Close** — `correct` when the last line before the `ab-report` block is the
  workflow's return marker and the run reported an outcome, otherwise `wrong`
  with the reason.

An arm that crashed or returned no report is still a result; mark what is
missing as `none`.

## Judge blind

Flip a coin with `echo $((RANDOM % 2))`: on 0, A is Output 1; on 1, B is. Keep
the mapping out of the judge's brief. Start one read-only subagent with the
invocation, what the fixture changes (`git diff --stat <default>...<sha>`), the
rubric, and Output 1 and Output 2 with their diff stats. Leave out the refs, the
texts, their line counts, the metrics, and any word or branch name that hints at
a version. Ask it to judge what a reader receives, facts before brevity, and to
reply with `verdict: 1 | 2 | tie`, a confidence, and one reason per line. Map
the verdict back through the coin.

## Report, pick, record, tear down

Print one line naming the workflow, the fixture and the judge's verdict in A/B
terms. Then print a table with one column per arm: instruction lines, turns,
tokens, duration, refusals, close, skipped publishes, and the `pr` action. Then
print each output whole, A then B, then the judge's verdict, confidence,
reasons, and which arm was Output 1.

Ask the user for their pick: A, B, tie, or don't record. Ask only after the
verdict is printed, and never fill the pick in yourself. Write the trial to
`~/.my-command/ab/<trial>/trial.json` with `command`, `args`, `fixture`,
`rubric`, `versions.a/b` (`ref`, `lines`), `runs.a/b` (output, the metrics,
close, skipped publishes, `pr` action), `judge` (`shownFirst`, `verdict`,
`confidence`, `reasons`), and `pick`. An unread figure is `null`, not `0`. On a
pick, run `my-command-tools jev-record label --file <that path>`, which stores the
trial as a `kind: "ab"` session beside the recorded judgement-layer exchanges,
and report the session and whether the pick agreed with the judge. With no
pick, leave `pick` out and print that command for later.

Remove both worktrees with `my-command-tools worktree end --branch
ab/<trial>-a --force --drop-shots`, and the same for `-b`. `--force` is right
here and only here, because the branches were never pushed by design. Then
delete each branch with `git branch -D`, one call each. A worktree another live
session still holds is left in place and reported. Nothing leaves the device:
no push, no pull request, no comment, no hosted write. One trial is one sample,
so say so when the outputs are close.

## Closing turn

Close the run in a text-only turn: one final message carrying text and zero tool
calls, sent after the last tool call returns rather than alongside it. A run's
outcome is recorded only from a message with no tool call in it, so ending on one
— or bundling the report into one — records no outcome at all. Every ending owes
that turn, including one that stops early, is blocked, or hands work back to an
invoking workflow. Lead with the judge's verdict, the user's pick and the
recorded session, or with what stopped the trial.

Which turn that is depends on how this run was invoked, and there are exactly
three cases. Invoked directly by the user, this is the outermost run and it
closes in a text-only turn as above. Invoked inline by another workflow in the
same session, as a step of that invoker's own pipeline, it hands back without
spending a text-only turn: the report and the return marker go out as text in
the same message that carries the invoker's next tool call, so the turn
continues into the invoker's next step instead of returning control to the user.
A text-only turn there ends the whole assistant turn and strands every step the
invoker still owes. Dispatched as a subagent, it closes in its own text-only
turn like an outermost run, because its final message is a report to the parent
session rather than a turn in the parent's conversation. The return marker is
written exactly once in all three cases, alone on the last line of the message
that hands control back — never weakened, deferred to a later message, or
dropped because the turn continues.

Anchor that turn before the first tool call: put "close the run in a text-only
turn" in the todo list as its own final item, because the todo list is live
session state that a compaction carries forward and this prompt is not. Resolve
it in the same tool-call turn as the run's last piece of real work, so the list
is already clean when that turn returns and the only thing left to do is speak.
Never leave marking it as a call of its own after the work ends: a run whose
last scheduled action is a bookkeeping tool call ends on that call — the mark
lands every time, and the message meant to follow it never arrives. A compaction
boundary is a checkpoint, not an ending — a recap prompt, a background-task
notification, or a session-continuation preamble each mean the run is still owed
its turn, so answer in text alone, say where the run stands, and restore the
todo item if it did not survive. Each side of a boundary records its own
standing, because a run split across two transcripts is two runs to the record.
Every message from the user opens a task in the same transcript, and only a
reply carrying text and no tool call closes it, so answer a mid-run question,
correction, or recap in text before returning to tool calls. A reply to another
session is not that turn either: sending a message is a tool call, so send the
reply, let it return, then close in text alone.

## Step marker

Open every step with its marker on the first line of the message that enters it:
the word `STEP` in capitals, the number written in the step heading being
entered, a slash, and how many steps this workflow declares — `STEP <n>/<N>`.
Take the number from the heading, not from a count of finished steps. Write it
once on entry; re-entering a step after a correction writes it again. Keep
naming the step in prose as well.
