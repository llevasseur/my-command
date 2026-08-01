---
type: feature
title: mc
description: Merge the latest main into open PR branches (or one branch), resolve every conflict, and push.
tags: [command, git, merge]
timestamp: 2026-07-15
---

# mc

## Summary

Merges the latest `main` into open PR branches, resolves every conflict, and
pushes. Handles machine-generated index/listing conflicts (e.g. okq-generated
`index.md`) by regenerating rather than hand-merging.

## Flags / Parameters

- `--here` / `-h` — only the **current branch**, in the current checkout.
- `--target` / `-t <branch>` — only the named `<branch>`, in an **isolated worktree**.
- No flag: every open PR branch.

## Behavior

Preconditions come from the toolkit's `state` verb — repo check, starting branch,
default branch, and the clean-tree check in one call. Then for each in-scope branch:
merge latest `main`, resolve conflicts (regenerating generated indexes where a resolver
script exists), sanity-check with `verify`, and push the result.

### Target mode is isolated

`-t <branch>` never checks the branch out in the current tree. It runs
`worktree begin --branch <branch> --existing --bootstrap`, merges `origin/main` there
through `git -C <path>`, and removes the worktree on the way out. Three consequences:

- **Your checkout is untouched** — no `HEAD` move, no local `main` fast-forward. A dirty
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
