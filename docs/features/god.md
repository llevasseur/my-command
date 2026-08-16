---
type: feature
title: god
description: Carry a plain-language task all the way to merged — /task with /review woven in, /mc on conflict, wait for CI, merge the PR into main, pull main. No human in the loop.
tags: [command, workflow, git, merge]
timestamp: 2026-07-24
updated: 2026-08-15
dirty: true
---

# god

## Summary

`/task`'s pipeline plus the last mile. `/task` takes the criteria to a reviewed,
open PR; `god` then makes that PR mergeable, gets it green, merges it into its
merge target — `main` by default, any branch under `--into` — and pulls that
branch into the local checkout. Designed to run unattended —
invoking it is standing permission to merge this run's own PR.

## Flags / Parameters

Forwarded to `/task` untouched:

- `--here` / `-h` — no worktree; work on the current branch.
- `--base <branch>` — the **cut point**: branch off `<branch>` instead of `main`.
  It says nothing about where the PR lands; use `--into` for that.
- `--add` / `-a <list>` — extra commands to weave into the `/task` run. `god`
  appends its own `review` entry after any entries passed in.

Set unconditionally on the `/task` invocation:

- `--sub` — `/task` runs `/clean` + `/pr` inline by default; `god` always asks for
  the subagent form, because that subagent is where the woven-in `review` entry
  lands. Passing `--sub` / `-s` yourself is accepted and redundant.

Owned by `god`:

- `--into <branch>` — the **merge target**: the branch the PR is merged into and
  the branch pulled at the end. Independent of `--base` and **never inherited from
  it** — `--base` is where the branch is cut, `--into` is where it lands, and a run
  that wants both states both (`--base release/2.0 --into release/2.0`). Omitted,
  the merge target is the default branch, so every invocation written before this
  flag behaves exactly as before.
- `--squash` (default) / `--merge` / `--rebase` — method handed to `gh pr merge`.
  Mutually exclusive.
- `--auto` — don't wait on CI; enable GitHub auto-merge and finish. The `main`
  pull is skipped and the PR is reported as queued.
- `--fix <n>` — auto-repair rounds spent on red CI before giving up. Default `1`;
  `0` disables repair.
- `--no-review` — don't weave `/review` into the `/task` run.
- `--draft` / `-d` — **rejected**; a draft PR cannot be merged.
- Everything after the flags is the **task criteria**, passed to `/task` verbatim.

## Behavior

Preconditions come from the toolkit: `doctor` confirms `git` and `gh` are present, and
`state` records the starting branch and the **main checkout path** up front, because
`/task` tears down the worktree it creates before the merge stage runs. The **merge
target** is resolved once here too — `<branch>` from `--into`, or the default
branch — and the conflict test, the merge, and the final pull all act on that one
branch.

`/task` is then invoked with `--sub`, the forwarded flags and, unless `--no-review`, an
appended `--add review …` entry. `--sub` is what makes `/task`'s `/clean` + `/pr` stage a
single fresh subagent, and that entry lands the review inside it: it runs
`/review --here` after `/pr` and before teardown, where the subagent is already on the
PR's branch with the PR pushed, so `/review`'s own `/fb` chain runs inline there and
updates the same PR rather than nesting a worktree or another agent.
Both review outcomes resolve inside that subagent: findings mean it runs the `/fb`
line itself, and a clean sign-off means it returns without one — neither comes back
to `god` as pending work. A `/task` run that produced no changes ends the whole
command — no PR, no merge.

The merge stage re-resolves the PR from `gh` and refuses any PR whose head is not
this run's branch. Its base is then made true: `/pr` opens every PR against the
default branch by design and is left untouched as the PR wrapper, so a PR whose
base is not the merge target is retargeted with `gh pr edit <number> --base
<merge target>`. That happens before the conflict stage, because `/mc` resolves a
branch's base from its own open PR. Conflicts are detected locally with
`git merge-tree --write-tree <merge target> <branch>` (GitHub's `mergeable` is
lazy and reports `UNKNOWN` for fresh branches) and delegated to `/mc -t <branch>`;
a branch `/mc` lands in its 🔴 list stops the run. Checks are watched with
`gh pr checks --watch --fail-fast`, and a red result spends up to `--fix <n>`
rounds of `/fb -t <branch>` against the failure log before stopping. The merge is
`gh pr merge` with the chosen method and no `--delete-branch` — the PR's base is
already the merge target, so nothing extra is passed — falling back to `--auto`
when GitHub blocks on pending checks and looping back to the conflict stage once
if the merge target moved underneath. Finally the merge target is checked out and
fast-forward pulled in the main checkout, and the branch retired with
`my-command-tools cleanup --branch <branch>`. That is a verb rather than a
`git branch -d` because both halves of the hand-run form fail on states this stage
produces: a squash merge leaves the branch with no commits on the target, so git
calls it unmerged and refuses, and GitHub's auto-delete has usually already taken
the remote ref, so deleting it again errors. The verb decides each half against the
merged PR and reports which was already done.

Four situations stop the run rather than being driven through: an unresolvable
`/mc` conflict, CI still red after the repair budget, a diverged local merge
target, and a PR that isn't this run's. Nothing is ever merged with `--admin`, the
merge target is never pushed to directly, and nothing is force-pushed. A refused merge or remote-ref
deletion is final — it is surfaced, not re-expressed through `gh api`; `cleanup`'s
remote half is the second place that can fire.

## Related

- Command source: `src/commands/god.md`
- Wraps: [task](task.md) — which itself chains [clean](clean.md), [pr](pr.md), and
  the woven-in [review](review.md)
- Chains: [mc](mc.md) for conflicts, [fb](fb.md) for CI repair
- Spec: [Adding a command](../specs/adding-a-command.md)
