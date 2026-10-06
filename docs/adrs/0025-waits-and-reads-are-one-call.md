---
type: adr
title: A wait is one blocking call and a read sweep is one batched turn
description: Verification is waited on with the single blocking call verify --background returns, long-running processes are never busy-waited, and discovery reads a known file list in one turn, because the recorded alternatives spent dozens of turns and ended sessions mid-loop.
tags: [process, commands, toolkit, decisions]
timestamp: 2026-10-05
dirty: true
decided-by: /task
ratified: false
needs-human: false
---

# A wait is one blocking call and a read sweep is one batched turn

## Status

Accepted. **Written by `/task`, not ratified by a human**, under
[ADR 0005](0005-agent-authored-decisions-are-marked-in-frontmatter.md). It holds the history
moved out of `src/shared/verify-wait.md`, `src/shared/batched-discovery.md`,
`src/commands/task.md`, `src/commands/clean.md` and `src/commands/review.md` under
[ADR 0021](0021-command-prompts-state-the-rule-and-adrs-keep-the-history.md).

## Context

**Polling a verification report.** `my-command-tools verify --background` writes its JSON
report atomically at exit, so every read before then returns nothing. Recorded runs read one
report twenty times and another fifteen times, each time saying they would stop and then
reading again on the next turn. Two sessions ended inside that loop with the work
unreported. Runs that armed a second watch over the same file turned one wait into two
colliding ones.

**Busy-waiting on a process.** Recorded runs that waited on a dev server with a foreground
loop timed out with exit 143, and one tight `until …; do :; done` loop was killed with
exit 137.

**Walking a file list.** A recorded `/review` walked a PR diff one probe per turn for
thirty-five turns. Reviews and doc audits are where this happens most, because the file
list arrives complete and invites walking it. `/clean` runs fetched the diff a second time
after the first call had already returned all of it.

## Decision

- A verification run is waited on with the one `wait.blockingCall` that
  `verify --background` returns. One wait per run. A `PreToolUse` gate refuses early reads of
  the report and names the blocking call.
- A long-running process is started in the background with a log and waited on through
  `Monitor` or another bounded wait, never a foreground loop.
- A known file list is read in one batched turn, and `/clean` takes its diff from one call.
  A `PreToolUse` gate enforces the one-diff-call rule.
