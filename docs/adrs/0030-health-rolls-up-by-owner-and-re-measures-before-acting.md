---
type: adr
title: /health rolls up by owner, reads memory through the compressor, and re-measures before every signal
description: The measurements behind /health's rules — a per-process ranking that hid a security suite, a free-memory figure that implied a crisis, a backend that changed PID three times in twenty minutes, and an editor cleared as clean while it held unsaved work.
tags: [process, commands, health, decisions]
timestamp: 2026-10-05
dirty: true
decided-by: /task
ratified: false
needs-human: false
---

# /health rolls up by owner, reads memory through the compressor, and re-measures before every signal

## Status

Accepted. **Written by `/task`, not ratified by a human**, under
[ADR 0005](0005-agent-authored-decisions-are-marked-in-frontmatter.md). It holds the recorded
measurements moved out of `src/commands/health.md` under
[ADR 0021](0021-command-prompts-state-the-rule-and-adrs-keep-the-history.md).

## Context

Four recorded `/health` runs each produced one of the command's rules.

- **Roll up, then rank.** One run found 393 macOS system processes summing to 187% CPU and
  15 Sophos processes summing to 141%. Ranked per process, the top of the list was system
  noise. Ranked per owner, the security suite was the largest consumer by a factor of eight.
- **Memory through the compressor.** One run showed 58 MB free and 7.4 GB compressed.
  "Free memory" implied a crisis; the compressor figure explained the real cost.
- **CPU time as the energy proxy.** The same run put the security scanner at 44 CPU-hours
  against 425 minutes for the next owner, which was enough to rank energy without
  `powermetrics` or `sudo`.
- **Re-measure before every signal.** In one run the live backend changed PID three times in
  twenty minutes as its watcher respawned, and port ownership flipped between two duplicate
  stacks. A kill list written from the first reading would have killed the working server.
- **Ask the application about unsaved state.** One run cleared an editor as clean because
  its backup directory was empty, then found an unsaved-changes marker in the editor's own
  window list one step later.

## Decision

`/health` sums by owner before ranking, reports free percentage beside compressed bytes,
labels cumulative CPU time as a proxy for energy, re-reads port owners and the parent chain
before each signal, and treats a window as dirty unless the application itself says it is
clean.
