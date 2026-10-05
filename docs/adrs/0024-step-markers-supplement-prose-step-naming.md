---
type: adr
title: STEP markers supplement prose step naming rather than replacing it
description: The STEP <n>/<N> marker anchors a run's position exactly, but runs keep naming each step in prose, because transcripts that predate the marker and messages that miss it can only be read from that prose.
tags: [process, commands, run-markers, decisions]
timestamp: 2026-10-05
dirty: true
decided-by: /task
ratified: false
needs-human: false
---

# STEP markers supplement prose step naming rather than replacing it

## Status

Accepted. The marker shipped in PR #81. **Written by `/task`, not ratified by a human**, under
[ADR 0005](0005-agent-authored-decisions-are-marked-in-frontmatter.md); it holds the history
`src/shared/step-marker.md` carried until
[ADR 0021](0021-command-prompts-state-the-rule-and-adrs-keep-the-history.md).

## Context

The commands eval reads a run's transcript and works out which step each message belongs to.
Before PR #81 it could only infer that from prose ("Step 2: implement"). The `STEP <n>/<N>`
marker states it exactly. Every transcript recorded before the marker existed still carries
prose alone, and any later message where a run forgets the marker does too.

## Decision

**A run writes the marker on entry to each step and keeps naming the step in prose.** The
prose is the fallback reading for every message without a marker, and dropping it saves a
line while losing that fallback. See [run markers](../specs/run-markers.md).
