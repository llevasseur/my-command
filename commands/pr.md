---
description: Create or update a PR for the current branch with a concise bulleted description, written directly to GitHub
argument-hint: "[--draft|-d] [optional title or extra context]"
allowed-tools: Bash(git:*), Bash(gh:*), Bash(my-command-tools:*), Write, Skill, ExitWorktree
---

Open or update the PR for this branch. Push and write PR metadata only: never commit, and stop if `my-command-tools state` says you're on the default branch. Leftover text in the arguments is a title or extra context.

- Write the body to a file outside the repo, for a reviewer who never saw the request: bullets only, under 400 words, no log of what you checked. Run the `unslop` skill over it if installed.
- Publish with `my-command-tools pr --title "<title>" --body-file <path>`, adding `--draft` for `-d`. It pushes, creates or updates, and keeps existing assets and screenshots. Never take a PR out of draft.
- If you created this worktree yourself and no command invoked you, remove it once pushed.
- Report the PR URL. If another command invoked you, put that report beside its next tool call rather than ending the turn. Either way, end with `RETURN /my-command:pr`.
