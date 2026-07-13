<h1 align="center">MyCommand</h1>

<p align="center"><strong>Your Wish is My Command.</strong></p>

<p align="center">
  A Claude Code plugin bundling six workflow commands that carry a task all the
  way from idea to a merged pull request — set up an isolated worktree, implement,
  clean the comments, and open the PR.
</p>

---

## What's inside

| Command | What it does |
| :------ | :----------- |
| `/my-command:task` | Take a task from plain-language criteria to an open PR: sets up an isolated branch/worktree, bootstraps it, implements, verifies, then runs `/my-command:clean` and `/my-command:pr`. |
| `/my-command:fb` | Implement a feedback request. Thin wrapper around `/my-command:task` — runs on the current branch by default, or in a worktree of an existing branch with `--target`. |
| `/my-command:pr` | Create or update the PR for the current branch with a concise, bulleted description, written straight to GitHub. Removes the session worktree on the way out. |
| `/my-command:clean` | Clean up comments across a branch's changes — lean and to the point, comments only, never code. |
| `/my-command:mc` | Merge the latest `main` into open PR branches (or a single branch), resolve every conflict one by one, and push. |
| `/my-command:task-bootstrap` | One-time per repo: interview the stack and generate that repo's own `scripts/bootstrap-worktree.sh` so `/my-command:task` can bootstrap fresh worktrees for it. |

All commands are namespaced under `my-command:` — that prefix is how Claude Code
keeps plugin commands from colliding with each other. The commands reference one
another by their namespaced names, so the bundle is self-contained once installed.

## Install

```bash
# 1. Register the marketplace (points at this GitHub repo)
claude plugin marketplace add llevasseur/my-command

# 2. Install the plugin
claude plugin install my-command@my-command
```

Or from inside a Claude Code session:

```
/plugin marketplace add llevasseur/my-command
/plugin install my-command@my-command
```

After installing, run `/reload-plugins` (or restart the session) and the
`/my-command:*` commands become available everywhere.

## Typical flow

```
/my-command:task fix the artifact panel scroll jump on resize
# → branches, implements, verifies, cleans comments, opens the PR

/my-command:fb -t feat/some-branch address the review comments on the export path
# → applies feedback onto an existing branch, then opens/updates its PR

/my-command:mc
# → merges latest main into every open PR branch and resolves conflicts
```

## Notes

- These are **workflow** commands: they assume `git` and the GitHub CLI (`gh`)
  are installed and authenticated, and they never commit to `main`.
- `/my-command:task` looks for a repo-provided `scripts/bootstrap-worktree.sh`
  (or a "Worktree Setup" section in `AGENTS.md`/`CLAUDE.md`) to prepare fresh
  worktrees. Run `/my-command:task-bootstrap` once per repo to generate one.
- The commands stay device- and project-agnostic — anything repo-specific comes
  from detection and the repo's own bootstrap, never hardcoded here.

## License

MIT © Leevon Levasseur
