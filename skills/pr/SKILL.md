---
name: pr
description: Create or update the current branch's pull request with a concise, accurate description.
---

Open or update the PR for this branch. Push and write PR metadata only: ship what's committed, and stop if `my-command-tools state` says you're on the default branch. If it shows uncommitted changes and no workflow invoked you, ask the user whether they belong in this PR before publishing; under a workflow, never commit. `--draft` / `-d` makes it a draft; leftover text is a title or extra context.

- Take the title and opening bullets from the net change, `git diff origin/<base> HEAD`, not from commit subjects. If GitHub's diff will show more than that (no merge base, so already-merged commits reappear), say so in the body.
- Title the PR as the thing itself, in Title Case, with no conventional-commit `<type>:` prefix: "Turn Setup-Node's pnpm Cache Back On in the Scripts Job", not "ci: turn setup-node's pnpm cache back on in the scripts job".
- Write the body with a file-editing tool, not a shell heredoc, to a scratch directory outside the repo rather than shared `/tmp`, for a reviewer who never saw the request, with no log of what you checked. Follow the repository's own convention first: guidance in `CLAUDE.md`, `AGENTS.md`, or `CONTRIBUTING.md`, then a PR template (quote the glob: `git ls-files '.github/PULL_REQUEST_TEMPLATE*'`), skill, or command it ships, then the last few merged PR bodies. Only when it states none, write bullets only. Whatever the shape, keep each bullet to one line a reviewer reads at a glance, about 15 words: what changed or what to watch for, not file-by-file detail the diff already shows.
- Publish with `my-command-tools pr --title "<title>" --body-file <path> [--draft]`, adding `--retitle` when the user gave a title or the existing one is stale. It pushes, creates or updates, and keeps existing assets and screenshots. Never take a PR out of draft.
- Read what it returns: if `bodyWarnings` fires, cut the body and publish again; name any `shotsWarning` or failed screenshot in your report.
- If you created this worktree yourself and no workflow invoked you, remove it once pushed with `my-command-tools worktree end --branch <branch>`.
- Report the PR URL in a text-only turn. If another workflow invoked you, it hands back without spending a text-only turn: put the report beside the invoking workflow's next step. A compaction boundary is a checkpoint, not an ending.
