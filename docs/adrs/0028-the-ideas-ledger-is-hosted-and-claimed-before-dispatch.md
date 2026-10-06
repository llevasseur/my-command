---
type: adr
title: The ideas ledger is hosted, adjudicated on the dashboard, and claimed before dispatch
description: Ideas moved from a per-device JSON file to an append-only log on the operator Worker, /ideate stopped asking for sign-off in-session, /work took the ideas half of /improve, and a run claims an idea before writing code because two runs once built the same idea minutes apart.
tags: [process, commands, ideas, decisions]
timestamp: 2026-10-05
dirty: true
decided-by: /task
ratified: false
needs-human: false
---

# The ideas ledger is hosted, adjudicated on the dashboard, and claimed before dispatch

## Status

Accepted. **Written by `/task`, not ratified by a human**, under
[ADR 0005](0005-agent-authored-decisions-are-marked-in-frontmatter.md). It holds the history
moved out of `src/commands/ideate.md` and `src/commands/work.md` under
[ADR 0021](0021-command-prompts-state-the-rule-and-adrs-keep-the-history.md).

## Context

**A device-local file.** The ledger began as `<logDir>/ideas.json`, one copy per device.
`/ideate` walked a waterfall of fallbacks when that file was missing: the proxy's file, then
the repo's `docs/ideas.md`, then `~/.claude/ideas/<repo-slug>.md`. Each device grew its own
divergent ledger, and the `ideas` verbs took a `LOG_DIR` that pointed at the file.

**Sign-off in session.** Setting a status was possible only through
`pnpm --filter server ideas mark`, so a proposing `/ideate` run could not end without a
person at a terminal to accept or reject.

**One command for two jobs.** `/improve` once read both claude-proxy's suggestions and the
ideas ledger.

**Claiming at PR time.** An implementing run looked for `accepted` ideas until its PR
existed. Two runs reading the ledger minutes apart both saw one idea as free and built it
eleven minutes apart; one PR closed unmerged.

## Decision

- The ledger is an append-only event log served by the `operator` Cloudflare Worker over D1,
  reached with `IDEAS_URL` and `IDEAS_TOKEN`. There is no local fallback and no `LOG_DIR` on
  the `ideas` verbs.
- The dashboard's Advice page carries approve and deny cards, so `/ideate` ends without
  asking.
- `/work` owns the ideas ledger; `/improve` owns the suggestions. Neither reads the other's
  store.
- `/work` claims each idea before any code is written, the claim carries the branch, expires
  after six hours, and is pinned open by a `pr` once one exists. `--available` returns
  `accepted` plus expired claims.
