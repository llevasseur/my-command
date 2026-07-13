---
description: Add a concise changelog entry to CHANGELOG.md for the work done in this session
argument-hint: "[optional summary or area to record]"
allowed-tools: Bash(git:*), Read, Edit, Write
---

Add a changelog entry describing the work from this session. Keep it concise and factual — what changed and why, no filler.

$ARGUMENTS, if given, is a summary or area tag to record; otherwise derive the entry from the actual changes.

## Steps

1. Figure out what changed: `git status`, `git diff HEAD`, and recent branch commits (`git log <base>..HEAD --oneline`). Base the entry on real changes, not guesses.
2. Find `CHANGELOG.md` at the repo root. If none exists, create one using the [Keep a Changelog](https://keepachangelog.com) layout.
3. **Match the repo's existing convention.** If `CHANGELOG.md` already has entries, copy their style exactly — heading format (dated vs. versioned), bullet style, any area tags or PR references. If `CLAUDE.md`/`AGENTS.md`/`CONTRIBUTING.md` documents a changelog format, follow that. Only fall back to Keep a Changelog (`## [Unreleased]` or `## YYYY-MM-DD`, grouped under Added / Changed / Fixed / Removed) when the repo sets no precedent.
4. Write one tight entry and insert it in the right place (most recent first). Group related changes into a single bullet rather than one per file.
5. Don't invent a PR/issue number — include one only if it's known from $ARGUMENTS or the branch.

## Finish

- Apply the edit directly. Don't commit unless the repo's flow expects the changelog committed with the work.
- Report the entry you added and where.
