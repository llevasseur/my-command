---
type: feature
title: ab
description: A/B-test two versions of a MyCommand command — in two worktrees of one fixture branch that publish nothing, or with --scenario in two sandbox GitHub repos where each arm opens and merges real PRs — then a blind judge, a side-by-side report, and the user's pick recorded as a label in the jev-record keep.
tags: [command, eval, agents]
timestamp: 2026-10-07
updated: 2026-10-07
dirty: true
---

# ab

## Summary

Runs two versions of one command against the same starting point and compares
what each produced. Each version runs in a fresh agent, in a workspace of its
own, with only its own text as instructions. A third agent judges the two
outputs without knowing which version produced which. The user's pick is
recorded as the label.

The motivating case is `/pr`: the 143-line version on `origin/main` against the
five-line version on `chore/pr-minimal`. A shorter prompt is cheaper on every
run, and the open question is whether the PR body gets worse. Reading the two
prompts does not answer that, so the trial runs both and compares the output.

```text
/ab origin/main:src/commands/pr.md chore/pr-minimal:src/commands/pr.md --fixture feat/some-branch --
/ab origin/main:src/commands/god.md feat/god-v2:src/commands/god.md --scenario merge-conflict -- fix the failing test
```

## Flags / Parameters

- `<refA> <refB>` — the two versions. Each is `<rev>:<path>`, a file path, or
  `paste` (the next fenced block pasted after the invocation).
- `--fixture <branch>` — worktree mode: the branch both runs start from.
  Default: the current branch. The default branch is allowed.
- `--scenario <name>` — scenario mode: the scenario both sandboxes are reset
  to. Not combined with `--fixture`.
- `--command <name>` — the command's name. Default: the shared basename of the
  two paths. Required with `paste`.
- `--rubric <text>` — what the judge weighs. Default: which output the person
  who invoked the command would rather have received.
- `-- <args>` — everything after the first standalone `--`, passed verbatim to
  both runs.

## Behavior

**Two modes.** Worktree mode, the default, runs both arms in this repo and
publishes nothing. It suits trials on MyCommand itself and any command whose
output is text. Scenario mode runs each arm against its own private GitHub repo
from [`my-command-tools sandbox`](../specs/command-toolkit.md), so a command
that opens PRs, merges, or reads the claude-proxy store acts on real state the
other arm cannot see. `/god` in arm A and `/god` in arm B merge into two
different `main` branches and cannot collide.

**Worktree isolation.** Both arms start from the fixture's sha, each on its own
throwaway `ab/<trial>-a|b` branch, because git will not check one branch out in
two worktrees. The fixture may be the default branch.

**Scenario isolation.** Before dispatch, `/ab` runs `sandbox status`, then
`sandbox init` if either sandbox is missing, then `sandbox reset --scenario
<name>`. Arm A works in sandbox `a`'s clone and arm B in sandbox `b`'s, through
absolute paths, with that sandbox's `CLAUDE_PROXY_STORE` and `LOG_DIR` set on
every call and the real `gh`. Each arm's start sha is the `mainSha` its reset
reported. The verb clones over SSH through `MY_COMMAND_GIT_HOST`. On a device
where plain `github.com` signs in as another account, set it to the
`~/.ssh/config` alias for the owner's key, for example `github-personal`. `/ab`
reads it from the environment and never passes a host of its own.

**What each arm may publish.** Both arms are `mycommand-ab-runner` subagents,
dispatched in one message. A brief carries the mode, the path, the invocation,
and that version's text, plus the sandbox's env and repo in scenario mode. It
says nothing about the other arm. In worktree mode the runner forbids pushes
and `gh` writes, and `my-command-tools pr --dry-run` prints the title, the body
exactly as it would be published, and whether it would create or update. The
verb also previews any branch under `ab/` without the flag. In scenario mode the
runner pushes, opens PRs, and merges as the command says, against its own
sandbox repo and no other. Neither mode writes to a hosted store, a ticket
tracker, or a chat.

**The `ab/` guard stays out of the sandboxes.** `pr` previews an `ab/` branch
only when the repo's common git directory is outside the sandbox root,
`$MY_COMMAND_SANDBOX_ROOT` or else `~/.my-command/ab/sandboxes`. A scenario
arm's PR is real whatever its branch is called, including from a worktree the
arm cut from its clone.

**Collection.** For each arm, `/ab` records the output, its turns, tokens and
duration, its gate refusals, and its close. In worktree mode the output is the
`pr` preview when there is one, and the final message otherwise. In scenario
mode it is the final message plus the title and body of each PR the arm opened,
and each PR's number, URL, state, and CI. Turns, tokens and duration come from
what the `Agent` result reports, and a missing figure is recorded as `null`.
The close is correct when the arm's last line is `RETURN /<command>`.

**Blind judging, on the full diff.** A coin flip decides which arm is shown as
Output 1. `my-command-tools ab-diff` then writes each arm's whole diff to
`output-<n>.diff` under its output number. It diffs with `--no-prefix`, so no
`a/` or `b/` prefix reaches the judge. It also replaces both arms' branches,
paths, and sandbox repo names with `<redacted>`. The `mycommand-ab-judge`
subagent has only `Read`. Its brief holds the invocation, the fixture's diff
stat or the scenario name, the rubric, and the two scrubbed outputs with their
diff files. Refs, texts, line counts, metrics, PR URLs, and any word that names a
version are left out, because the judge could use any of them to tell the arms
apart.

**Report and label.** The report prints a metrics table with one column per
arm. In scenario mode it adds rows linking each arm's PRs, their CI checks, and
their file diffs, so the two sandbox repos' PRs sit side by side. Both outputs
follow in full, then the judge's verdict with its reasons. Then it asks for the
user's pick. The pick is the label and the judge's verdict is one feature of
it, so the pick is asked for only after the verdict is shown.
`my-command-tools jev-record label` stores the trial as a `kind: "ab"` session
in the same keep as the recorded Jev exchanges, so the labelled corpus stays in
one store. Scratch files stay in `~/.my-command/ab/<trial>/`.

**Teardown.** Worktree mode removes both worktrees with `--force`, because
their branches were never pushed, and deletes both branches. Scenario mode
closes every arm PR still open, then runs `sandbox reset --scenario <name>`
again to put both sandboxes back. It never destroys them.

A UI over these records is a later change. This command is CLI only.

## Related

- [pr](pr.md) — the motivating subject, and the verb whose `--dry-run` keeps
  worktree-mode arms from publishing.
- [judge](judge.md) — the other command that turns a judgement into a recorded
  verdict.
- [Command toolkit](../specs/command-toolkit.md) — `pr --dry-run`, `sandbox`,
  `ab-diff`, `jev-record label`, and the `kind: "ab"` record format.
- [Subagent definitions](../specs/subagent-definitions.md) — the runner and
  judge shapes.
