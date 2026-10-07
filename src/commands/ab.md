---
description: A/B-test two versions of a MyCommand command — in two worktrees of one fixture branch that publish nothing, or with --scenario in two sandbox GitHub repos where each arm opens and merges real PRs — then a blind judge, a side-by-side report, and your pick recorded as a label
argument-hint: "<refA> <refB> [--fixture <branch> | --scenario <name>] [--command <name>] [--rubric <text>] -- <args>"
---

Run two versions of one command against the same starting point and show which one did better. Each version runs in a fresh agent, in a workspace of its own, with only that version's text as its instructions and the shared arguments as its input. Neither run sees the other. A third agent then judges the two outputs blind. You get a side-by-side report, and your own pick is recorded as the label.

There are two modes, and the flags pick one:

- **Worktree mode**, the default. Each arm gets its own worktree of one fixture branch in this repo and publishes nothing. Use it for trials on MyCommand itself, and for any command whose output is text.
- **Scenario mode**, with `--scenario <name>`. Each arm gets its own sandbox GitHub repo, reset to the named scenario, and works in that repo's clone with the real `gh`. It pushes, opens PRs, and merges into its own sandbox's default branch. Two repos means a command that merges, such as `/god` or `/merge-deps`, cannot collide with the other arm.

Your input is the text in the `<command-args>` block above. Everything before the first standalone `--` is the two refs and this command's flags. Everything after it is the argument string both runs receive, passed through verbatim.

<!-- include: shared/closing-turn-anchor.md -->**Before the first tool call, anchor the way this run ends.** Put "close the run in a text-only turn" in the harness todo/task list as its own final item — worded on its own, never folded into the work it follows. The todo list is live session state that a compaction carries forward; this prompt is not, so once this run is summarized that item is the only surviving record that an outcome is still owed. **A run another command invoked inline with the `Skill` tool anchors its handback instead**, worded as "hand back to the invoking command in its next turn": a nested run that spends a text-only turn ends the whole assistant turn and strands every step its parent still owes, so the item it carries must not tell it to. A run the user invoked directly, and one dispatched as a subagent, both anchor the text-only close. **Resolve the item in the same tool-call turn as the run's last piece of real work** — the teardown, the final `verify`, the closing `gh` call — so the anchor is already marked completed when that turn returns and the only thing left for the run to do is speak. **Never leave marking it as a call of its own after the work ends.** A run whose last scheduled action is a bookkeeping tool call ends on that call: the mark lands, the message that was meant to follow it does not, and the run records no outcome — the exact failure this anchor exists to prevent, arriving through the anchor itself. Compose the closing message against a task list that is already clean, and if the anchor somehow survives the work, close it alongside whatever you are already calling rather than scheduling a turn for it — a still-open anchor is never a reason to end the run on a tool call.<!-- /include -->

<!-- include-block: shared/step-marker.md -->
### Mark each step as you enter it

**Open every step with its marker, on the first line of the message that enters it:** the word `STEP` in capitals, the number written in the `## Step …` heading you are entering, a slash, and how many `## Step …` headings this command declares — `STEP <n>/<N>`. The marker states the step outright, so the record of this run anchors it exactly instead of inferring it from the words around it.

- **Take `<n>` from the heading, not from a count of the steps you have finished.** `## Step 1.5 — …` writes `1.5` and keeps the fraction. A command whose headings start at `## Step 0 — …` writes `0` for its first step. `<N>` is the number of `## Step …` headings in this command, counting a `Step 0` and a `Step 1.5` like any other.
- **A command with no `## Step …` headings has no marker to write.** A single `## Steps` list declares nothing to anchor against, so open those runs in prose alone.
- **Write the marker on entry, once.** Continuing inside a step you already opened writes nothing. Re-entering a step after a correction writes it again, because that is an entry.
- **Keep naming the step in prose as well.** The prose is the only reading for any message the marker is missing from (ADR 0024). Dropping it to save a line costs the fallback and buys nothing.
<!-- /include-block -->

## Flags

- `<refA> <refB>` — the two versions, in that order, as the first two tokens before `--`. Each is one of:
  - `<rev>:<path>` — a command file at a git revision, e.g. `origin/main:src/commands/pr.md` or `chore/pr-minimal:commands/pr.md`. Read with `git show`.
  - a path to a file on disk.
  - `paste` — the command text you pasted into the message, in a fenced block. The first `paste` takes the first fenced block after the invocation, and the second `paste` takes the second.
- `--fixture <branch>` — worktree mode: the branch both runs start from. Default: the current branch from `my-command-tools state`. The default branch is allowed, because a command such as `/task` starts from a clean default branch.
- `--scenario <name>` — scenario mode: the scenario both sandboxes are reset to, by the name the fixture template's `scripts/reset-scenario.sh` knows it under. Refuse it together with `--fixture`, because the scenario is the fixture.
- `--command <name>` — the command's name, without the slash. Default: the basename of the refs' paths when both name the same file. Required when either ref is `paste` or the basenames differ.
- `--rubric <text>` — what the judge should weigh. Default: which output a person who invoked the command would rather have received.

## Step 1 — Resolve the trial

1. **Read live state.** Run `my-command-tools state` for `root`, `branch` and `defaultBranch`, then `git fetch origin` in its own Bash call so `origin/…` revisions are current. <!-- include: shared/approval-own-call.md -->**A command that may need approval goes in its own Bash call** — `git fetch`, `git config`, and, as a narrow exception to the general rule to chain dependent mutations, branch-lifecycle operations such as checkout/switch, pull, remote-branch inspection, and local branch deletion. Folding one into an `&&` chain escalates approval to the whole compound command and costs a turn plus a retry. Put status output, pipes, and follow-up verification in separate read-only calls.<!-- /include -->
2. **Pin the fixture, in worktree mode.** Take `--fixture` or the current branch. Resolve its sha with `git rev-parse --verify <fixture>^{commit}` and use that sha from here on, so both runs start from the same commit even if the branch moves. In scenario mode, skip this: Step 2 takes each arm's starting sha from the reset.
3. **Read both versions.** For `<rev>:<path>`, run `git show <rev>:<path>`. For a file path, use `Read`. For `paste`, take the fenced block. Stop and name the ref if any of them comes back empty or does not resolve. If the two texts are byte-identical, say so and stop, because the trial would measure noise.
4. **Name the command.** Use `--command`, or the shared basename of the two paths. Stop and ask for `--command` if neither gives one name.
5. **Open the trial directory.** Use `~/.my-command/ab/<trial>/`, where `<trial>` is `<command>-<UTC timestamp to the second>`. It sits outside every checkout, so nothing from the trial can be committed by accident. Write each version there as `a.md` and `b.md` with `Write`.

State the trial back in one line: the mode, the command, both refs with their line counts, the fixture with its short sha or the scenario name, and the argument string.

## Step 2 — Prepare one workspace per arm

**Worktree mode.** Run two calls, one per arm:

```bash
my-command-tools worktree begin --branch ab/<trial>-a --base <fixture sha> --bootstrap
my-command-tools worktree begin --branch ab/<trial>-b --base <fixture sha> --bootstrap
```

Each arm gets its own throwaway branch under `ab/`, because git refuses to check out one branch in two worktrees. Starting both from the same sha keeps the fixture identical. `my-command-tools pr` always previews a branch under `ab/` outside the sandbox root, so an arm that forgets `--dry-run` still pushes nothing. Keep each reported `path`. If either bootstrap fails, tear down what was made (Step 6) and stop: an arm without dependencies fails for a reason that has nothing to do with its text.

**Scenario mode.** Arm A works in sandbox `a`, and arm B in sandbox `b`.

1. **Check both sandboxes.** Run `my-command-tools sandbox status`. If either sandbox reports `repo: "absent"`, or a `local.state` other than `"clone"`, run `my-command-tools sandbox init`. If `init` refuses a clone path, stop and report it. Never move or delete what is there yourself.
2. **Reset both to the scenario.** Run `my-command-tools sandbox reset --scenario <name>`. One call resets both. If it fails, stop and report the arm and the `stderr` it names: an unknown scenario or a broken reset gives both arms a start that is not the trial's.
3. **Keep each sandbox's fields** from the reset report: `clone`, `env`, `nameWithOwner`, `url`, `defaultBranch`, the PRs the scenario seeded under `reset.prs`, and `reset.mainSha` as that arm's start sha.

The verb clones over SSH through `MY_COMMAND_GIT_HOST`, or `github.com` when it is unset. On a device where plain `github.com` signs in as another account, the user sets it to their `~/.ssh/config` alias for the owner's key. Read it from the environment, and never pass a host of your own.

## Step 3 — Run both arms at once, isolated

Send both dispatches **in one message**, so they run concurrently and neither can be shaped by the other's result. Each is an `Agent` call with `subagent_type: "mycommand-ab-runner"`. The definition already carries the rules for both modes: follow only the given text, work only in the given path, publish as the mode allows, count refusals, close as the text says, and append an `ab-report` block. So the brief for each arm holds this arm's specifics and nothing else:

- the mode, `worktree` or `scenario`;
- the path to work in: the worktree `path`, or the sandbox `clone`, by absolute path;
- in scenario mode, the sandbox's `env` as `KEY=value` lines to set on every Bash call, and its `nameWithOwner` as the only repo it may publish to;
- the invocation as the user would have typed it: `/<command> <args>`;
- the version's full text, inside a fenced block, introduced as the instructions for that invocation.

Never put the other arm's text, ref, path, or repo in a brief. Never say which arm is A or which is the baseline. An arm that knows it is the challenger is no longer measuring the text alone. A sandbox repo's name carries its arm letter, and that letter says nothing about which version is which, so do not explain it.

## Step 4 — Collect each run

<!-- include-block: shared/batched-discovery.md -->
### Discovery runs as one batched pass

This is a step of the workflow, not a habit to recall. Run it whenever a phase of this command has to look at more than one file.

1. **Enumerate every path, pattern, and probe, then send them as parallel calls in one turn.** Read each file once, and pass every path to a single `git diff <base>...HEAD -- <path> <path> …`. `PreToolUse` gates refuse the serial, re-read, and per-item shapes and explain why when they do.
2. **Re-establish the read-before-write precondition after a compaction.** `Edit` and `Write` reject a file this *session* has not read. Inherited context, a continuation summary, and shell output do not satisfy that precondition, even though the summary reads as though they do. So after any compaction boundary, session continuation, or hand-off into this command, treat the precondition as unmet: enumerate the files the next edit pass will write, `Read` them in one batch (a targeted `offset`/`limit` slice counts), and edit only once that batch returns. Re-running the rejected `Edit` cannot clear the error — the batched `Read` is the fix, and doing it for the whole pass at once is what stops the same rejection repeating file after file.
<!-- /include-block -->

For each arm, record:

- **Output, in worktree mode.** If the arm ran `my-command-tools pr`, the preview is at `<git dir>/my-command/pr-dry-run.json`, where `<git dir>` is `git -C <path> rev-parse --absolute-git-dir`. Its `title` and `body` are the output, and its `action` says whether it would create or update. Without a preview, the output is the arm's final message with the `ab-report` block removed. Also record the arm's commits, with `git -C <path> log --oneline <sha>..HEAD`.
- **Output, in scenario mode.** Run `git -C <clone> fetch origin` in its own call. List the arm's PRs with `gh pr list --repo <nameWithOwner> --state all --json number,url,title,body,state,headRefName --limit 50`, and keep the ones the scenario did not seed under `reset.prs`. For each kept PR, record its number, URL, state, and CI with `gh pr checks <number> --repo <nameWithOwner> --json name,state,link`; a PR with no checks has CI `none`. The output is the arm's final message with the `ab-report` block removed, followed by each kept PR's title and body. If `gh` cannot see a private sandbox, run `my-command-tools identity --select --cwd <clone>` once and retry.
- **The arm's full diff ranges**, for the judge in Step 5. In worktree mode it is `<sha>...HEAD`. In scenario mode it is `<start sha>...origin/<defaultBranch>`, which is what the arm merged, plus `origin/<defaultBranch>...refs/ab/pr-<number>` for each kept PR still open, after `git -C <clone> fetch origin pull/<number>/head:refs/ab/pr-<number>` in its own call.
- **Turns, tokens, and duration**, from the usage the `Agent` result reports. Turns are its tool-use count. Write `unknown` for a figure the result does not carry, and never estimate one.
- **Refusals**, from the arm's `ab-report` block: the count and each first line.
- **Close.** Decide `correct` or `wrong`, with the reason. It is correct when the last non-blank line before the `ab-report` block is `RETURN /<command>`, with or without a namespace prefix, and the arm reported an outcome rather than stopping mid-step. A missing marker, a different command's marker, or a final message that ends on a question is `wrong`.
- **Skipped publishes**, from the `ab-report` block.

An arm that crashed, timed out, or returned no `ab-report` block is still a result. Record what it did produce and mark the missing fields `none`.

## Step 5 — Judge blind

Flip a coin with `echo $((RANDOM % 2))`. On `0`, A is shown as Output 1. On `1`, B is. Write down the mapping and keep it out of the judge's brief.

**Write each arm's full diff under its output number**, one call per arm:

```bash
my-command-tools ab-diff --cwd <path or clone> --range <range> [--range <range> …] --redact <name> [--redact <name> …] --out ~/.my-command/ab/<trial>/output-<n>.diff
```

Pass every range Step 4 recorded for that arm, in order. Redact every name that could reveal either arm, in both calls: both `ab/<trial>-a|b` branches, the trial name, both worktree paths or clones, and both sandboxes' `nameWithOwner` and bare repo names. The verb runs `git diff --no-prefix`, so no `a/` or `b/` path prefix reaches the judge either. Scrub each output's text the same way, and replace every PR URL in it with `<redacted>`.

Dispatch one `Agent` call with `subagent_type: "mycommand-ab-judge"`. The brief holds:

- the invocation `/<command> <args>`, and the starting point: in worktree mode what the fixture changes (`git diff --stat <defaultBranch>...<fixture sha>`, or that the fixture is the default branch itself), and in scenario mode the scenario's name;
- the rubric (`--rubric`, or the default from Flags);
- **Output 1** and **Output 2**, each as collected in Step 4 and scrubbed, with its diff's `files` and the path of its `output-<n>.diff` to `Read` whole.

Leave out the refs, both command texts, the line counts, the metrics, the PR URLs, and the words A, B, baseline, old, new, minimal, or any branch or repo name that hints at a version. Each of those is a label.

Map the judge's `1`, `2`, or `tie` back to `a`, `b`, or `tie` through the coin.

## Step 6 — Report, take the pick, record, tear down

**Print the report.** Lead with one line naming the command, the fixture or scenario, and the judge's verdict in A/B terms. Then:

```text
| | A — <refA> | B — <refB> |
|---|---|---|
| instructions | <n> lines | <n> lines |
| turns (tool uses) | | |
| tokens | | |
| duration | | |
| refusals | | |
| close | correct / wrong: <reason> | |
| skipped publishes | | |
| pr action | create / update / none | |
| prs | [#<n>](<url>) <state>, … | |
| ci | <pass / fail / none> per PR, linked to the PR's checks page | |
| diff | each PR's files page, linked, then output-<n>.diff | |
```

The `pr action` row is worktree mode's and the `prs` and `ci` rows are scenario mode's; drop the rows the mode does not fill. Each PR link comes from that arm's own sandbox repo, so the two columns link two different repos side by side.

After the table, print each output whole under `### A — output` and `### B — output`, one after the other, unscrubbed. A terminal cannot show two bodies side by side, and a truncated body cannot be judged. Then print the judge's verdict, confidence, and reasons, and say which output was shown as Output 1.

**Take the pick.** Ask with one `AskUserQuestion`: A, B, Tie, or Don't record. Your pick is the label, and the judge's verdict is only a feature of it. So ask after printing the verdict and never before, and never fill the pick in yourself. Where no answer can be collected, as in a background run or a dismissed question, record nothing. Say that the trial file is kept and give the command that records it later.

**Record it.** Write `~/.my-command/ab/<trial>/trial.json` with `Write`:

```json
{
  "command": "<command>",
  "args": "<args>",
  "mode": "worktree",
  "fixture": { "branch": "<fixture>", "sha": "<sha>" },
  "scenario": null,
  "rubric": "<rubric or null>",
  "versions": {
    "a": { "ref": "<refA>", "lines": 0 },
    "b": { "ref": "<refB>", "lines": 0 }
  },
  "runs": {
    "a": { "output": "<output>", "toolUses": 0, "tokens": 0, "durationMs": 0, "refusals": 0, "close": "correct", "closeReason": "", "skipped": [], "prAction": "create", "prs": [], "diff": "<path>" },
    "b": { "output": "<output>", "toolUses": 0, "tokens": 0, "durationMs": 0, "refusals": 0, "close": "correct", "closeReason": "", "skipped": [], "prAction": "create", "prs": [], "diff": "<path>" }
  },
  "judge": { "shownFirst": "a", "verdict": "a", "confidence": "medium", "reasons": ["…"] },
  "pick": "b"
}
```

In scenario mode, `mode` is `"scenario"`, `fixture` is `null`, `scenario` is `{ "name": "<name>", "repos": { "a": "<nameWithOwner>", "b": "<nameWithOwner>" }, "starts": { "a": "<sha>", "b": "<sha>" } }`, `prAction` is `null`, and each run's `prs` holds `{ "number", "url", "state", "ci" }` per kept PR. A figure Step 4 could not read is `null`, never `0`. On a pick, run `my-command-tools jev-record label --file ~/.my-command/ab/<trial>/trial.json`. It writes the trial as a `kind: "ab"` session in the same keep as the recorded Jev exchanges, so the labelled corpus stays one store. Report the `session` and whether your pick agreed with the judge. Under Don't record, or with no answer, leave `pick` out of the file and print the `jev-record label` command to run once it is set.

**Tear down, in worktree mode.** The arm branches were never pushed, by design, so `worktree end` needs `--force` here and only here:

```bash
my-command-tools worktree end --branch ab/<trial>-a --force --drop-shots
my-command-tools worktree end --branch ab/<trial>-b --force --drop-shots
```

Then delete each branch in its own call: `git branch -D ab/<trial>-a`, then `git branch -D ab/<trial>-b`. A worktree that refuses because a live session still holds it is reported as left in place, not forced.

**Tear down, in scenario mode**, once the pick question has resolved, whatever the answer. Close each kept PR still open with `gh pr close <number> --repo <nameWithOwner> --delete-branch`, one call per PR. Then run `my-command-tools sandbox reset --scenario <name>`, which puts both sandboxes back. The closed and merged PRs stay readable at the URLs the report linked. A close or a reset that fails is reported with the sandbox left as it stands, and is never retried with a force. Never run `sandbox destroy` from here.

Everything Step 1 wrote stays in `~/.my-command/ab/<trial>/`. <!-- include: shared/text-only-turn.md -->Deliver that report in this run's **closing turn** — the terminal step below — rather than alongside the tool call that precedes it.<!-- /include -->

## Notes

- **Worktree mode publishes nothing, and scenario mode publishes only into its two sandbox repos.** Neither arm, nor this run, writes to a hosted store, a ticket tracker, a chat, or any other repo. The only record is the local keep.
- **`pr`'s `ab/` preview is scoped to worktree mode.** The verb previews a branch under `ab/` unless the repo lives under the sandbox root: `$MY_COMMAND_SANDBOX_ROOT`, then `root` in `~/.my-command/ab/config.json`, else `~/.my-command/ab/sandboxes`. A scenario arm's PR is real whatever its branch is called. A sandbox kept under `sandbox --root <dir>` needs that directory exported as `MY_COMMAND_SANDBOX_ROOT`, or set as the config file's `root`, too.
- **One trial is one sample.** A single run of an agent is noisy, so say so when the outputs are close, and suggest running the trial again before the pick is read as a trend.
- **This is a CLI command.** The trial files and the `kind: "ab"` sessions are what a later UI would read. Nothing here builds one.
- <!-- include: shared/classifier-refusal.md -->A classifier refusal is not evidence that repository protections should be weakened. Inspect the refused command first; when the intended operation is safe and the refusal looks incidental to the command's shape — an over-broad chain, pipe, or extra flag — retry only the smallest exact command, never an allowlisted Bash pattern or a permission-settings change. **The remedy is always the command's form, and the two common refused shapes each have one:** a chained read-only probe (`head <file>; ls -l <dir>`) is refused as one command and succeeds when reissued as the single bare command you actually needed, so drop the chain rather than the intent — and where the probe was reading a file, `Read` answers it with no shell to judge; a heredoc composing a file is refused wholesale inside an isolated worktree, which is exactly where these runs work, so compose it with `Write` and change it with `Edit` instead of reaching for a quoting trick. **One refusal in this family is correct and stays correct:** a probe that names a `.env` file is refused because of the file, not the shape, and no smaller form of it is the fix — never rewrite it, never allowlist it, and never work around it. If you need a value from `.env`, ask me to run the command myself with `! <command>`.<!-- /include -->

## Step 7 — Close the run in a text-only turn

<!-- include-block: shared/closing-turn.md -->
**Every run states its outcome on the way out, and *how* it states it depends on how this run was invoked.** One mechanic decides all three cases: in Claude Code an assistant message carrying text and **zero tool calls** ends the assistant's turn and hands control back to the user. That is what records a run's outcome — and it is also what strands a parent pipeline when a nested run spends one, because the parent's remaining steps never get a turn to run in.

**Tell which of the three cases this run is in before composing anything, from how it was invoked:**

- **Outermost** — the user invoked this command directly, as the prompt this turn is answering. No other command run encloses it. It **closes in a text-only turn**.
- **Nested inline** — another command invoked this one with the `Skill` tool in this same session, as a step of its own pipeline, and that parent still has steps owed once this one returns. It **hands back without spending a text-only turn**.
- **Subagent** — this run was dispatched with the `Agent` tool (`--sub`, a delegated unit, any Agent-tool dispatch). It has its own conversation, and its final message is a report *to* the parent session rather than a turn *in* the parent's conversation, so nothing of the parent's is waiting behind it. It **closes in a text-only turn**, exactly like an outermost run.

**Outermost and subagent: close in a text-only turn. Never skipped, never delegated.** The run is over when this session sends **one message carrying text and zero tool calls** — not when the work lands. That is the mechanic, not a style preference: a run's outcome is recorded only from a message with no tool call in it, so a message carrying the report *and* a tool call is recorded as a decision mid-run, and a run whose last message is a tool call records no outcome at all. Make the last tool call, let it return, then reply with text alone.

**Nested inline: hand back without spending a text-only turn.** Emit the report and the return marker as **text in the same assistant message that carries the parent's next tool call**, so the turn continues into the parent's next step instead of ending and returning control to the user. A nested run that closes in a text-only turn strands every step its parent still owes, including the next child, the teardown, and the parent's own outcome, so a live run reads as abandoned (ADR 0022). So do not compose a message of text alone here, and do not stop to let the parent speak: say what this run did, write the marker, and make the parent's next call in that same message. The parent's own closing turn is the one that records the outcome for both.

- **Every exit routes here, not just the shipped one.** Finished; nothing to do; a gate still failing; a step blocked, refused, or awaiting my answer; the request abandoned as wrong. The wording changes; which of the three cases applies does not. A run that stopped early says where it stopped and what is on the branch, and leaves `/revive <thread id>` as the recovery path when the proxy thread id is available. A nested run that stopped early still hands back in the parent's turn — it reports the stop as text beside the parent's next call, and the parent decides whether to carry on.
- **Say it in one self-contained line first**, then any detail. Someone who never saw the request should be able to read that line alone.
- **End the message with this run's return marker, alone on the last line, in all three cases:** the word `RETURN` in capitals, a space, then the name this run was invoked under, leading slash and all — `RETURN /<command>`, carrying whatever namespace prefix that invocation carried. Written **exactly once**, on the last line of the message that hands control back, whether that message is a text-only close or a nested handback riding the parent's next tool call. The marker is the only record of where a run handed control back, so it is never weakened, deferred to a later message, or dropped because the turn continues: without it a nested run's span runs on to the next nested invocation, or to the end of the transcript for the last one, and that run is charged with everything its host did after it returned. **A run that ends abnormally never reaches this step and writes no marker**, so its span still runs to the end of the transcript: the marker makes the normal exit exact and leaves the abnormal one exactly as it already was.
- **A compaction boundary is a checkpoint, not an ending.** A recap prompt ("The user stepped away and is coming back…"), a `[SYSTEM NOTIFICATION - NOT USER INPUT]` event, or a session-continuation preamble each mean the run is still owed its turn: answer that prompt in text alone, say where the run actually stands, and restore the anchor todo item if it did not survive. A session is likeliest to die just after a compaction, so that answer is often the only outcome the run ever records. **Each side of the boundary records its own standing**, because a run split across two transcripts is two runs to the record: one that carried a PR across a boundary and closed on neither side reads as two abandoned runs, not one shipped one.
- **Every prompt from me opens a task, and only a text-only reply closes it.** The transcript starts a new `## Task:` at each of my messages — a mid-run question, a correction, a recap prompt, a change of direction — and writes `- done:` only when a reply carries text and no tool call. So answer my message in text alone *before* returning to tool calls. That is true even inside a nested run: my message is addressed to the session, not to whichever command currently holds it. A run that reads the message and keeps working straight through leaves that task, and every task before it, with no outcome line. There is no `- done:` marker to type: that line is written for you from any text-only turn, and skipped entirely from a turn that carries a tool call.
- **A reply to another session is not this turn either.** `SendMessage` is a tool call, so a run whose whole job was answering another agent records no outcome when that reply is the last thing it sends. Send the reply, let it return, then close in text alone — even when the closing message says much what the reply already said.
- **A subagent's report is never the dispatching run's turn.** The outcome belongs to the session the run started in, so after an `Agent` call returns, close that run in a message of your own.
- **Resolve the anchor before the message is composed, never as a call after it.** Mark the anchor todo item completed in the same tool-call turn as the run's last piece of real work, so nothing is left scheduled when that turn returns and the run's next action is the message itself. A standalone final mark lands and the message never follows, so the run records no outcome (ADR 0022). Handing back with it still open reads as abandoned, so close it — alongside a call you were already making, never as a turn of its own.
- **Do not tack the report onto the tool call before it — in the two closing cases.** `ExitWorktree`, `worktree end`, `verify`, and a closing `gh` call are exactly the calls that sit at the end of an outermost or subagent run and swallow the outcome. The nested handback is the deliberate exception and the only one: there the report rides the parent's **next** call, which is what keeps the parent's turn alive.
<!-- /include-block -->

Lead with the judge's verdict, your pick, and the recorded `session`, or with what stopped the trial.
