---
type: adr
title: /improve routes a systematically wrong suggestion rule to a fix in its rule code
description: A rule whose suggestions /judge keeps dismissing becomes one criterion against claude-proxy's suggestions.ts through suggestions defects, because leaving it pending billed attention on every /improve run and could never resolve.
tags: [process, commands, improve, decisions]
timestamp: 2026-10-05
dirty: true
decided-by: /task
ratified: false
needs-human: false
---

# /improve routes a systematically wrong suggestion rule to a fix in its rule code

## Status

Accepted. **Written by `/task`, not ratified by a human**, under
[ADR 0005](0005-agent-authored-decisions-are-marked-in-frontmatter.md). It holds the history
moved out of `src/commands/improve.md` under
[ADR 0021](0021-command-prompts-state-the-rule-and-adrs-keep-the-history.md).

## Context

`/improve` once had no exit for a rule that was systematically wrong. Its suggestions were
dismissed by `/judge` and reported as "out of scope and still `pending`". The rule kept
firing, billed attention on every later `/improve` run, and could never resolve, because
nothing in the command was allowed to touch claude-proxy's rule code.

## Decision

`suggestions defects` turns a pattern of dismissals into one criterion against
`packages/core/src/suggestions.ts`. A suggestion whose fix belongs to the dashboard or the
recurrence model, rather than the rule code, still stays `pending` and is reported as out of
scope.
