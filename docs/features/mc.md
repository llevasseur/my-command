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

For each in-scope branch: merge latest `main`, resolve conflicts (regenerating
generated indexes where a resolver script exists), and push the result.

## Related

- Command source: `src/commands/mc.md`
- Spec: [Adding a command](../specs/adding-a-command.md)
