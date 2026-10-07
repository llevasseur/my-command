---
name: ab
description: A/B-test two versions of a MyCommand workflow — in two worktrees of one fixture branch that publish nothing, or with --scenario in two sandbox GitHub repos where each run opens and merges real PRs — then a blind judge, a side-by-side report, and the user's pick recorded as a label.
---

# A/B

Run two versions of one workflow against the same starting point and show which
one did better. Each version runs in a fresh subagent, in a workspace of its
own, with only that version's text as its instructions and the shared arguments
as its input. Neither run sees the other. A third subagent judges the two
outputs blind. The user gets a side-by-side report, and their own pick is
recorded as the label.

Two modes:

- **Worktree mode**, the default: each arm gets a worktree of one fixture branch
  in this repo and publishes nothing. For trials on MyCommand itself and for
  workflows whose output is text.
- **Scenario mode**, with `--scenario <name>`: each arm gets its own sandbox
  GitHub repo, reset to the named scenario, and works in that repo's clone with
  the real `gh`. It pushes, opens PRs, and merges into its own sandbox's default
  branch, so a workflow that merges cannot collide with the other arm.

## Input

`<refA> <refB> [flags] -- <args>`. Everything before the first standalone `--`
is the two refs and this workflow's flags. Everything after it is the argument
string both runs receive, passed through verbatim.

- Each ref is `<rev>:<path>` (a workflow file at a git revision, such as
  `origin/main:src/commands/pr.md`), a path to a file on disk, or `paste`. The
  first `paste` takes the first fenced block the user pasted after the
  invocation, and the second takes the second.
- `--fixture <branch>` — worktree mode: the branch both runs start from.
  Default: the current branch. The default branch is allowed.
- `--scenario <name>` — scenario mode: the scenario both sandboxes are reset to.
  Refuse it together with `--fixture`.
- `--command <name>` — the workflow's name. Default: the shared basename of the
  two paths. Required when either ref is `paste` or the basenames differ.
- `--rubric <text>` — what the judge weighs. Default: which output the person
  who invoked the workflow would rather have received.

## Resolve the trial

Read live state with `my-command-tools state`, then run `git fetch origin` as its
own shell call. In worktree mode, pin the fixture to its sha with
`git rev-parse --verify <fixture>^{commit}` and use the sha from here on, so both
runs start from the same commit. Read both versions: `git show <rev>:<path>`, the
file, or the pasted block. Stop and name the ref if one does not resolve, and
stop if the two texts are identical, because that trial measures noise.

Open the trial directory at `~/.my-command/ab/<command>-<UTC timestamp>/`, outside
every checkout, and save the two versions there as `a.md` and `b.md`. State the
trial back in one line: the mode, the workflow, both refs with line counts, the
fixture with its short sha or the scenario name, and the arguments.

## One workspace per arm

**Worktree mode.** Create both with `my-command-tools worktree begin --branch
ab/<trial>-a --base <fixture sha> --bootstrap` and the same for `-b`, one call
each. Each arm needs its own branch, because git will not check one branch out
twice. The branch name matters: `my-command-tools pr` always previews a branch
under `ab/` outside the sandbox root, so an arm that forgets `--dry-run` still
publishes nothing. If a bootstrap fails, tear down what was made and stop.

**Scenario mode.** Arm A works in sandbox `a`, arm B in sandbox `b`. Run
`my-command-tools sandbox status`; if either reports `repo: "absent"` or a clone
state other than `clone`, run `my-command-tools sandbox init`, and stop on a clone
path it refuses rather than clearing it. Then run `my-command-tools sandbox reset
--scenario <name>`, one call for both, and stop if it fails. Keep each sandbox's
`clone`, `env`, `nameWithOwner`, `url`, `defaultBranch`, the PRs the scenario
seeded under `reset.prs`, and `reset.mainSha` as that arm's start sha. The verb
clones over SSH through `MY_COMMAND_GIT_HOST` (default `github.com`); on a device
where plain `github.com` signs in as another account the user sets it to their
`~/.ssh/config` alias. Read it from the environment and never pass a host of your
own.

## Run both arms, isolated

Start both subagents together so neither can be shaped by the other's result.
Each one gets only:

- the mode, `worktree` or `scenario`;
- its worktree path or sandbox clone, as the only place it may work, by
  absolute path;
- in scenario mode, the sandbox's `env` as `KEY=value` lines to set on every
  shell call and to pass on to any subagent it starts, and the sandbox repo as
  the only repo it may publish to;
- the invocation as the user would type it, the workflow name plus the shared
  arguments;
- that version's full text, as its instructions for that invocation.

Tell each arm the same rules: follow only the given text and never read
another copy of the workflow. In worktree mode publish nothing — every
`my-command-tools pr` call carries `--dry-run`, no `git push`, no writing `gh`
call — and local commits on the `ab/` branch are fine. In scenario mode push,
open PRs, and merge as the text says, against the named sandbox repo only. In
both modes no hosted store, ticket tracker, or chat; skip only the forbidden call
and note it. Count every refusal it takes, close exactly as the text says, and
end its final message with a fenced `ab-report` block listing `refusals: <n>`,
each refusal's first line, and each skipped publish. Never give an arm the other
arm's text, ref, path, or repo, and never tell it which arm it is.

## Collect each run

Read the outputs in one batch. For each arm:

- **Output, worktree mode** — the `pr` preview at
  `<git dir>/my-command/pr-dry-run.json` (its `title`, `body` and `action`) when
  the arm ran `pr`, where the git dir is
  `git -C <path> rev-parse --absolute-git-dir`. Otherwise, its final message
  without the `ab-report` block. Add its commits since the fixture sha.
- **Output, scenario mode** — fetch the clone, list the sandbox repo's PRs with
  `gh pr list --repo <nameWithOwner> --state all`, and keep the ones the scenario
  did not seed. Record each one's number, URL, state, and CI from
  `gh pr checks`. The output is the final message without the `ab-report` block,
  followed by each kept PR's title and body. If `gh` cannot see the private
  sandbox, run `my-command-tools identity --select --cwd <clone>` once and retry.
- **Full diff ranges** — worktree mode `<sha>...HEAD`; scenario mode
  `<start sha>...origin/<default>` for what merged, plus
  `origin/<default>...refs/ab/pr-<n>` for each kept PR still open, after fetching
  `pull/<n>/head` into that ref.
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
the mapping out of the judge's brief. Write each arm's full diff with
`my-command-tools ab-diff --cwd <path> --range <range> … --redact <name> … --out
~/.my-command/ab/<trial>/output-<n>.diff`, `<n>` being its output number. Redact
every name that could reveal either arm in both calls: both `ab/` branches, the
trial name, both paths, both sandbox repo names. The verb diffs with
`--no-prefix`, so no `a/` or `b/` prefix reaches the judge. Scrub each output's
text of the same names and of every PR URL.

Start one read-only subagent with the invocation, the starting point (what the
fixture changes against the default branch, or the scenario's name), the
rubric, and Output 1 and Output 2, each with its diff's file list and the path
of its diff file to read whole. Leave out the refs, the texts, their line counts,
the metrics, the PR URLs, and any word, branch, or repo name that hints at a
version. Ask it to judge what a reader receives, facts before brevity, to check
claims against the diffs, and to reply with `verdict: 1 | 2 | tie`, a confidence,
and one reason per line. Map the verdict back through the coin.

## Report, pick, record, tear down

Print one line naming the workflow, the fixture or scenario, and the judge's
verdict in A/B terms. Then print a table with one column per arm: instruction
lines, turns, tokens, duration, refusals, close, skipped publishes, and the `pr`
action in worktree mode; in scenario mode, rows for each arm's PRs (linked, with
state), their CI (linked to each PR's checks), and their diffs (linked to each
PR's files), so the two sandbox repos' PRs sit side by side. Add each arm's diff
file. Then print each output whole, A then B, unscrubbed, then the judge's
verdict, confidence, reasons, and which arm was Output 1.

Ask the user for their pick: A, B, tie, or don't record. Ask only after the
verdict is printed, and never fill the pick in yourself. Write the trial to
`~/.my-command/ab/<trial>/trial.json` with `command`, `args`, `mode`, `fixture`
(branch and sha, or `null`), `scenario` (`null`, or the name, both repos, and
both start shas), `rubric`, `versions.a/b` (`ref`, `lines`), `runs.a/b` (output,
the metrics, close, skipped publishes, `pr` action, `prs` with number, URL,
state and CI, and the diff path), `judge` (`shownFirst`, `verdict`,
`confidence`, `reasons`), and `pick`. An unread figure is `null`, not `0`. On a
pick, run `my-command-tools jev-record label --file <that path>`, which stores the
trial as a `kind: "ab"` session beside the recorded judgement-layer exchanges,
and report the session and whether the pick agreed with the judge. With no
pick, leave `pick` out and print that command for later.

Worktree mode: remove both worktrees with `my-command-tools worktree end --branch
ab/<trial>-a --force --drop-shots`, and the same for `-b`. `--force` is right
here and only here, because the branches were never pushed by design. Then
delete each branch with `git branch -D`, one call each. A worktree another live
session still holds is left in place and reported.

Scenario mode, once the pick question has resolved whatever the answer: close
each kept PR still open with `gh pr close <n> --repo <nameWithOwner>
--delete-branch`, one call each, then run `my-command-tools sandbox reset
--scenario <name>` to put both sandboxes back. Report a close or reset that fails
and leave the sandbox as it stands. Never destroy the sandboxes from here.

Worktree mode publishes nothing, and scenario mode publishes only into its two
sandbox repos; neither writes to a hosted store, ticket tracker, chat, or any
other repo. `my-command-tools pr` previews an `ab/` branch except in a repo under
the sandbox root (`$MY_COMMAND_SANDBOX_ROOT`, then `root` in
`~/.my-command/ab/config.json`, else `~/.my-command/ab/sandboxes`), so a scenario arm's PR is real whatever its
branch is called. One trial is one sample, so say so when the outputs are close.

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
