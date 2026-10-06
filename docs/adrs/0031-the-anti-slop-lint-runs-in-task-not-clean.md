---
type: adr
title: The anti-slop lint runs in /task, where code can still change, not in /clean
description: /clean only deletes and tightens comments, so a lint finding about a name, a dead branch, or a redundant wrapper had nowhere to land there; /task Step 2.5 runs the lint and may change code to clear it.
tags: [process, commands, lint, decisions]
timestamp: 2026-10-05
dirty: true
decided-by: /task
ratified: false
needs-human: false
---

# The anti-slop lint runs in /task, where code can still change, not in /clean

## Status

Accepted. The move shipped in PR #119. **Written by `/task`, not ratified by a human**, under
[ADR 0005](0005-agent-authored-decisions-are-marked-in-frontmatter.md); it holds the history
`src/commands/task.md` Step 2.5 carried until
[ADR 0021](0021-command-prompts-state-the-rule-and-adrs-keep-the-history.md).

## Context

`/clean` ran `pnpm lint:anti-slop` before PR #119. `/clean` only deletes and tightens
comments, so a finding about a name, a dead branch, or a redundant wrapper had nowhere to
land: the command could report it and never act on it.

## Decision

`/task` Step 2.5 runs the lint after implementation and before `/clean` and `/pr`, and may
change code to clear a finding on the run's own changes. `/clean` no longer runs it.
