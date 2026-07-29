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

- `--here` / `-h` — only the **current branch**.
- `--target` / `-t <branch>` — only the named `<branch>`.
- No flag: every open PR branch.

## Behavior

Preconditions come from the toolkit's `state` verb — repo check, starting branch,
default branch, and the clean-tree check in one call. Then for each in-scope branch:
merge latest `main`, resolve conflicts (regenerating generated indexes where a resolver
script exists), sanity-check with `verify`, and push the result.

## Related

- Command source: `src/commands/mc.md`
- Called by: [merge-deps](merge-deps.md) per dependency PR, and [god](god.md) when
  `main` moved under the PR before its merge
- Spec: [Adding a command](../specs/adding-a-command.md)
