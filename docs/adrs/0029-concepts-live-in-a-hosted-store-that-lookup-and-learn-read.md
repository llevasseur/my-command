---
type: adr
title: Concepts live in a hosted store that /teach writes and /lookup and /learn read
description: /teach moved from writing claude-proxy's logs/concepts.jsonl to posting to a hosted concept service in a three-step rollout with no dual-write, reports a failed save instead of skipping it, and /lookup and /learn exist so the stored concepts and surfaced skills are read back.
tags: [process, commands, concepts, decisions]
timestamp: 2026-10-05
dirty: true
decided-by: /task
ratified: false
needs-human: false
---

# Concepts live in a hosted store that /teach writes and /lookup and /learn read

## Status

Accepted. **Written by `/task`, not ratified by a human**, under
[ADR 0005](0005-agent-authored-decisions-are-marked-in-frontmatter.md). It holds the history
moved out of `src/commands/teach.md`, `src/commands/lookup.md` and `src/commands/learn.md`
under [ADR 0021](0021-command-prompts-state-the-rule-and-adrs-keep-the-history.md).

## Context

**A local file.** `/teach` first appended each settled concept to claude-proxy's
`logs/concepts.jsonl` on the device that ran it. Moving to a hosted service took three steps:
the service shipped, `/teach` started posting to it, and claude-proxy retires the file and its
schema only after every device runs the posting version. Deleting the file earlier would drop
concepts written by a device still on the file-writing `/teach`. There is no dual-write,
because two stores that each look complete is the failure the ordering avoids.

**A silent skip.** When the save failed, `/teach` skipped it without a word, which turned a
broken store into quiet loss.

**Nothing read the corpus back.** A concept taught in March was taught again in August under
a second wording, and the two sentences disagreed. `/lookup` was added as the gate that reads
the store before a `/teach` starts.

**Dropped skills.** `/teach` discovered skills relevant to a concept and did not install them,
and those names were lost. PR #52 recorded them as `surfacedSkills`, and `/learn` is the
reader that list lacked.

## Decision

- `/teach` posts to the hosted store only, and says in one line why a save failed.
- `/lookup` reads the store before a concept is named, and its answer decides whether a
  `/teach` starts.
- `/learn` reads the stored record's `surfacedSkills` before searching for a skill.
