---
type: adr
title: Dispatched units work by absolute path in a worktree the dispatcher made
description: A subagent starts at the repository root, where EnterWorktree always refuses, so the dispatch site runs worktree begin per unit and hands the path over as --worktree; every run treats that path as its working root rather than as a fallback.
tags: [process, commands, worktrees, decisions]
timestamp: 2026-10-05
dirty: true
decided-by: /task
ratified: false
needs-human: false
---

# Dispatched units work by absolute path in a worktree the dispatcher made

## Status

Accepted. **Written by `/task`, not ratified by a human**, under
[ADR 0005](0005-agent-authored-decisions-are-marked-in-frontmatter.md). It holds the history
`src/shared/enter-worktree.md` and `src/shared/dispatch-worktree.md` carried in prose until
[ADR 0021](0021-command-prompts-state-the-rule-and-adrs-keep-the-history.md).

## Context

A run dispatched with the `Agent` tool starts with its working directory at a repository
root. `EnterWorktree` refuses there with "the current working directory … is the repository
root". **Ten recorded runs called it anyway**, took that refusal, and then did what they
could have done first: worked by absolute path under the worktree.

Moving the advice into the repo's conventions did not help a wave. Sibling units go out in
the same turn and run concurrently, so a lesson one learns never reaches the others. A unit
reads the conventions only after dispatch, from the repository root, which is the state in
which its worktree call cannot succeed. **Recorded waves put three siblings into the
identical refusal at the identical step**: the count follows the fan-out, not any agent's
judgement.

## Decision

- The `path` that `worktree begin` prints is a run's working root, and every read, edit,
  commit and `--cwd` resolves under it. That is the documented mode, not a recovery.
- Only a run the user invoked directly, in the repo the session started in, calls
  `EnterWorktree`, and then with `path`, never `name`.
- A dispatch site runs `worktree begin` once per unit before composing the prompt, passes
  `--worktree <path>`, tells the unit not to create or enter a worktree, and owns teardown
  after collecting the wave.

`scripts/check-commands.sh` requires the `working root` wording in
`src/shared/enter-worktree.md` and the dispatch snippet at every dispatch site.
