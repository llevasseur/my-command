---
name: pr
description: Create or update the current branch's pull request with a concise, accurate description.
---

Open or update the PR for this branch. Push and write PR metadata only: never commit, and stop if `my-command-tools state` says you're on the default branch. `--draft` / `-d` makes it a draft; leftover text is a title or extra context.

- Write the body to a file outside the repo, for a reviewer who never saw the request, with no log of what you checked. Follow the repository's own convention first: guidance in `CLAUDE.md`, `AGENTS.md`, or `CONTRIBUTING.md`, then a PR template, skill, or command it ships, then the last few merged PR bodies. Only when it states none, write bullets only.
- Publish with `my-command-tools pr --title "<title>" --body-file <path> [--draft]`, adding `--retitle` when the user gave a title or the existing one is stale. It pushes, creates or updates, and keeps existing assets and screenshots. Never take a PR out of draft.
- Read what it returns: if `bodyWarnings` fires, cut the body and publish again; name any `shotsWarning` or failed screenshot in your report.
- If you created this worktree yourself and no workflow invoked you, remove it once pushed with `my-command-tools worktree end --branch <branch>`.
- Report the PR URL in a text-only turn. If another workflow invoked you, it hands back without spending a text-only turn: put the report beside the invoking workflow's next step. A compaction boundary is a checkpoint, not an ending.
