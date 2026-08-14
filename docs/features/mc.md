---
type: feature
title: mc
description: Merge each branch's own PR base into it (or one branch), resolve every conflict, and push.
tags: [command, git, merge]
timestamp: 2026-08-14
---

# mc

## Summary

Merges each branch's **own PR base branch** into it, resolves every conflict, and
pushes. Handles machine-generated index/listing conflicts (e.g. okq-generated
`index.md`) by regenerating rather than hand-merging.

## Flags / Parameters

- `--here` / `-h` — only the **current branch**, in the current checkout.
- `--target` / `-t <branch>` — only the named `<branch>`, in an **isolated worktree**.
- No flag: every open PR branch, whatever each one bases off.

There is no base flag. The base is a fact about each branch's PR, not a choice.

## Behavior

Preconditions come from the toolkit's `state` verb — repo check, starting branch,
default branch, and the clean-tree check in one call. Then for each in-scope branch:
resolve its base, merge `origin/<base>`, resolve conflicts (regenerating generated
indexes where a resolver script exists), sanity-check with `verify`, and push the result.

### The base is per branch, read from its PR

`gh pr list --state open --head <branch> --json baseRefName` names the branch to merge
in; a branch with no open PR falls back to the repo's default branch. Consequences:

- **Stacked PRs merge their real base.** PR #1066 in `konradgroup/hyperion-nexus-app`
  heads `feat/chart-export-images` off `feat/chart-artifact-panel-chrome`; merging `main`
  there produced conflicts against changes that were never in its base. That is the
  defect this behavior replaced.
- **ALL mode filters nothing.** The listing carries `baseRefName` per PR, so no `--base`
  filter is passed — a `--base main` filter used to drop every stacked PR silently while
  the run reported success. Where one listed PR bases off another's head, the lower
  branch merges first.
- **Local `main` moves only when it is actually a base.** The default-branch
  fast-forward is conditional now; a run over a stack of feature branches never touches
  it, and a diverged local `main` blocks only the branches based on `main`.

### Target mode is isolated

`-t <branch>` never checks the branch out in the current tree. It runs
`worktree begin --branch <branch> --existing --bootstrap`, merges `origin/<base>` there
through `git -C <path>`, and removes the worktree on the way out. Reading the base through
`origin/` is what lets a non-default base work with no local branch for it. Three
consequences:

- **Your checkout is untouched** — no `HEAD` move, no local fast-forward. A dirty
  working tree does not block target mode the way it blocks the other two.
- **The session does not move into the worktree**, so `/mc` stays safe to call as a step
  inside [merge-deps](merge-deps.md) and [god](god.md).
- **Teardown is refused while the merge is unpushed.** A surviving worktree means either a
  push that did not happen or pre-existing unpushed commits on the branch; the run reports
  the path rather than forcing it away.

## Related

- Command source: `src/commands/mc.md`
- Called by: [merge-deps](merge-deps.md) per dependency PR, and [god](god.md) when
  `main` moved under the PR before its merge
- Spec: [Adding a command](../specs/adding-a-command.md)
