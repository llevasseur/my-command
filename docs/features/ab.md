---
type: feature
title: ab
description: A/B-test two versions of a MyCommand command on one fixture branch — two isolated runs that publish nothing, a blind judge, a side-by-side report, and the user's pick recorded as a label in the jev-record keep.
tags: [command, eval, agents]
timestamp: 2026-10-07
updated: 2026-10-07
dirty: true
---

# ab

## Summary

Runs two versions of one command against the same fixture branch and compares
what each produced. Each version runs in a fresh agent, in its own worktree,
with only its own text as instructions. A third agent judges the two outputs
without knowing which version produced which. The user's pick is recorded as
the label.

The motivating case is `/pr`: the 143-line version on `origin/main` against the
five-line version on `chore/pr-minimal`. A shorter prompt is cheaper on every
run, and the open question is whether the PR body gets worse. Reading the two
prompts does not answer that, so the trial runs both and compares the output.

```text
/ab origin/main:src/commands/pr.md chore/pr-minimal:src/commands/pr.md --fixture feat/some-branch --
```

## Flags / Parameters

- `<refA> <refB>` — the two versions. Each is `<rev>:<path>`, a file path, or
  `paste` (the next fenced block pasted after the invocation).
- `--fixture <branch>` — the branch both runs start from. Default: the current
  branch. The default branch is refused.
- `--command <name>` — the command's name. Default: the shared basename of the
  two paths. Required with `paste`.
- `--rubric <text>` — what the judge weighs. Default: which output the person
  who invoked the command would rather have received.
- `-- <args>` — everything after the first standalone `--`, passed verbatim to
  both runs.

## Behavior

**Isolation.** Both arms start from the fixture's sha, each on its own
throwaway `ab/<trial>-a|b` branch, because git will not check one branch out in
two worktrees. Both are dispatched in one message as `mycommand-ab-runner`
subagents. A brief carries the worktree path, the invocation, and that
version's text, and nothing about the other arm.

**Nothing is published.** The runner definition forbids pushes and `gh` writes.
`my-command-tools pr --dry-run` prints the title, the body exactly as it would
be published, and whether it would create or update, without pushing or writing
to GitHub. The verb also previews any branch under `ab/` without the flag, so an
arm whose text forgets `--dry-run` still publishes nothing. `gh` is only read
when origin already has the branch, and an `ab/` branch never does.

**Collection.** For each arm, `/ab` records the output, its turns, tokens and
duration, its gate refusals, and its close. The output is the `pr` preview when
there is one, and the final message otherwise. Turns, tokens and duration come
from what the `Agent` result reports, and a missing figure is recorded as
`null`. The arm reports its refusals itself. The close is correct when the
arm's last line is `RETURN /<command>`.

**Blind judging.** A coin flip decides which arm is shown as Output 1. The
`mycommand-ab-judge` subagent has only `Read`. Its brief holds the invocation,
the fixture's diff stat, the rubric, and the two outputs. Refs, texts, line
counts, metrics, and any word that names a version are left out, because the
judge could use any of them to tell the arms apart.

**Report and label.** The report prints a metrics table with one column per
arm, both outputs in full, and the judge's verdict with its reasons. Then it
asks for the user's pick. The pick is the label and the judge's verdict is one
feature of it, so the pick is asked for only after the verdict is shown.
`my-command-tools jev-record label` stores the trial as a `kind: "ab"` session
in the same keep as the recorded Jev exchanges, so the labelled corpus stays in
one store. Scratch files stay in `~/.my-command/ab/<trial>/`.

A UI over these records is a later change. This command is CLI only.

## Related

- [pr](pr.md) — the motivating subject, and the verb whose `--dry-run` keeps
  the arms from publishing.
- [judge](judge.md) — the other command that turns a judgement into a recorded
  verdict.
- [Command toolkit](../specs/command-toolkit.md) — `pr --dry-run` and
  `jev-record label`, and the `kind: "ab"` record format.
- [Subagent definitions](../specs/subagent-definitions.md) — the runner and
  judge shapes.
