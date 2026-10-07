---
description: Create or update a PR for the current branch with a concise bulleted description, written directly to GitHub
argument-hint: "[--draft|-d] [optional title or extra context]"
allowed-tools: Bash(git:*), Bash(gh:*), Bash(my-command-tools:*), Write, Skill, ExitWorktree
---

Open or update the PR for this branch. Push and write PR metadata only: ship what's committed, and stop if `my-command-tools state` says you're on the default branch. If it shows uncommitted changes and no command invoked you, ask whether they belong in this PR before publishing; under a command, never commit. `--draft` / `-d` makes it a draft; leftover text is a title or extra context.

- Take the title and opening bullets from the net change, `git diff origin/<base> HEAD`, not from commit subjects. If GitHub's diff will show more than that (no merge base, so already-merged commits reappear), say so in the body.
- Title the PR as the thing itself, in Title Case, with no conventional-commit `<type>:` prefix: "Turn Setup-Node's pnpm Cache Back On in the Scripts Job", not "ci: turn setup-node's pnpm cache back on in the scripts job".
- Write the body with the `Write` tool under `$CLAUDE_JOB_DIR/tmp/`, never a heredoc or bare `/tmp`, for a reviewer who never saw the request, with no log of what you checked. Follow the repo's own convention first: guidance in `CLAUDE.md`, `AGENTS.md`, or `CONTRIBUTING.md`, then a PR template (quote the glob: `git ls-files '.github/PULL_REQUEST_TEMPLATE*'`), skill, or command it ships, then the last few merged PR bodies. Only when it states none, write bullets only. Whatever the shape, keep each bullet to one line a reviewer reads at a glance, about 15 words: what changed or what to watch for, not file-by-file detail the diff already shows.
- Publish with `my-command-tools pr --title "<title>" --body-file <path> [--draft]`, adding `--retitle` when I gave a title or the existing one is stale. It pushes, creates or updates, and keeps existing assets and screenshots. Never take a PR out of draft.
- Read what it returns: if `bodyWarnings` fires, cut the body and publish again; name any `shotsWarning` or failed screenshot in your report.
- If you created this worktree yourself and no command invoked you, remove it once pushed. If `ExitWorktree` refuses, step out with `action: "keep"` and run `my-command-tools worktree end --branch <branch>`.
- Report the PR URL. If another command invoked you, put the report beside the invoking command's next tool call rather than ending the turn. Otherwise send it after the last tool call returns, as a message with text and no tool call. Either way, end with `RETURN /pr`.
