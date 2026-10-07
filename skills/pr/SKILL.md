---
name: pr
description: Create or update the current branch's pull request with a concise, accurate description.
---

Open or update the PR for this branch. Push and write PR metadata only: never commit, and stop if `my-command-tools state` says you're on the default branch. Leftover text is a title or extra context; `--draft` / `-d` makes it a draft.

- Write the body to a file outside the repo, for a reviewer who never saw the request: bullets only, under 400 words, no log of what you checked.
- Publish with `my-command-tools pr --title "<title>" --body-file <path> [--draft]`. It pushes, creates or updates, and keeps existing assets and screenshots. Never take a PR out of draft.
- If you created this worktree yourself and no workflow invoked you, remove it once pushed.
- Report the PR URL in a text-only turn. If another workflow invoked you, it hands back without spending a text-only turn: put the report beside its next step. A compaction boundary is a checkpoint, not an ending.
