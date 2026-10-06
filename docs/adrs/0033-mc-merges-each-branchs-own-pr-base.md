---
type: adr
title: /mc merges each branch with its own PR base and takes no base flag
description: /mc once merged main into every branch, which pulled commits a stacked PR is never diffed against; since PR #95 it resolves each branch's base from its own open PR, and no mode lets a caller override it.
tags: [process, commands, mc, decisions]
timestamp: 2026-10-05
dirty: true
decided-by: /task
ratified: false
needs-human: false
---

# /mc merges each branch with its own PR base and takes no base flag

## Status

Accepted. The change shipped in PR #95. **Written by `/task`, not ratified by a human**, under
[ADR 0005](0005-agent-authored-decisions-are-marked-in-frontmatter.md); it holds the history
`src/commands/mc.md` referred to until
[ADR 0021](0021-command-prompts-state-the-rule-and-adrs-keep-the-history.md).

## Context

`/mc` merged `main` into every branch it handled. For a stacked PR, whose base is another
feature branch, that pulled in commits the PR is never diffed against, and the conflict
resolution was thrown away when the stack landed.

## Decision

`/mc` resolves `BASE` per branch from that branch's own open PR. No mode takes a base flag,
because a flag that overrode it would reintroduce the merge PR #95 removed.
