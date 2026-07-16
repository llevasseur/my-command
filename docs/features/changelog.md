---
type: feature
title: changelog
description: Add a concise entry to the current repo's CHANGELOG.md, matching its existing format.
tags: [command, docs]
timestamp: 2026-07-15
---

# changelog

## Summary

Adds a tight, factual changelog entry for the session's work, matching the repo's
existing CHANGELOG conventions (dated vs. versioned, bullet style, area tags).

## Flags / Parameters

- Optional **summary / area tag** (`$ARGUMENTS`) to record; otherwise the entry is
  derived from the actual changes.

## Behavior

Reads `git status`/`diff`/log to base the entry on real changes, finds or creates
`CHANGELOG.md`, and inserts one grouped entry most-recent-first. Applies the edit
directly; does not commit unless the repo's flow expects it.

## Related

- Command source: `src/commands/changelog.md`
- Spec: [Adding a command](../specs/adding-a-command.md)
