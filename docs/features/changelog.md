---
type: feature
title: changelog
description: Add a concise entry to the current repo's CHANGELOG.md, matching its existing format.
tags: [command, docs]
timestamp: 2026-07-15
updated: 2026-08-02
---

# changelog

## Summary

Adds a tight, factual changelog entry for the session's work, matching the repo's
existing CHANGELOG conventions (dated vs. versioned, bullet style, area tags).

## Flags / Parameters

- Optional **summary / area tag** (the `<command-args>` block) to record; otherwise
  the entry is derived from the actual changes.

## Behavior

Reads the toolkit's `state` verb — branch commits, per-file diffstat, and uncommitted
changes in one call — to base the entry on real changes, finds or creates
`CHANGELOG.md`, and inserts one grouped entry most-recent-first. Never invents a PR
or issue number; includes one only when the arguments or the branch supply it.
Applies the edit directly; does not commit unless the repo's flow expects it.

## Related

- Command source: `src/commands/changelog.md`
- Spec: [Adding a command](../specs/adding-a-command.md)
