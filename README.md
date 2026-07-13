<h1 align="center">MyCommand</h1>

<p align="center"><strong>Your Wish is My Command.</strong></p>

<p align="center">
  A bundle of six Claude Code workflow commands that carry a task from idea to a
  merged pull request — set up an isolated worktree, implement, clean the
  comments, and open the PR.
</p>

---

## What's inside

| Command | What it does |
| :------ | :----------- |
| `task` | Take a task from plain-language criteria to an open PR: isolated branch/worktree, bootstrap, implement, verify, then clean + PR. |
| `fb` | Implement a feedback request. Thin wrapper around `task` — current branch by default, or a worktree of an existing branch with `--target`. |
| `pr` | Create/update the PR for the current branch with a concise bulleted description, written straight to GitHub. |
| `clean` | Clean up comments across a branch's changes — lean and to the point, comments only, never code. |
| `mc` | Merge the latest `main` into open PR branches (or one branch), resolve every conflict, and push. |
| `task-bootstrap` | One-time per repo: interview the stack and generate that repo's own `scripts/bootstrap-worktree.sh` so `task` can bootstrap fresh worktrees. |
| `sync` | Update this device's installed commands to the latest version from GitHub. |
| `changelog` | Add a concise entry to the current repo's `CHANGELOG.md`, matching its existing format. |

## Install

### Quickest — the wizard

```bash
npx github:llevasseur/my-command
```

It asks how you want them installed:

1. **Claude Code plugin** — commands are namespaced (`/my-command:task`) and
   **auto-update** whenever this repo is pushed.
2. **Personal commands** — bare commands (`/task`) copied into
   `~/.claude/commands`.

### Manual — as a plugin

```bash
claude plugin marketplace add llevasseur/my-command
claude plugin install my-command@my-command
```

Then run `/reload-plugins`. Claude Code always namespaces plugin commands, so
they are invoked as `/my-command:task`, `/my-command:pr`, and so on.

## Repository layout

```
src/commands/       Canonical BARE commands — edit these (they call each other as /task, /clean, …)
commands/           GENERATED namespaced commands the plugin ships (do not edit by hand)
scripts/
  build-plugin.sh      Regenerate commands/ from src/commands/ (bare → /my-command:)
  install-personal.sh  Symlink src/commands/*.md into ~/.claude/commands (bare, git-synced)
bin/my-command.mjs  The npx install wizard (zero dependencies)
.claude-plugin/     plugin.json + marketplace.json
```

Two forms exist because the commands reference each other: a bare `task` calls
`/clean`, but the published plugin's `task` must call `/my-command:clean`. The
**bare source is canonical**; the namespaced `commands/` is built from it.

## Editing the commands (maintainer)

```bash
# 1. Edit the bare source
$EDITOR src/commands/task.md

# 2. Regenerate the namespaced plugin commands
./scripts/build-plugin.sh

# 3. Commit + push — installed plugins auto-update (version is SHA-based)
git add -A && git commit -m "…" && git push
```

## Use them yourself, synced across devices

Keep the short bare commands (`/task`) on every machine, controlled from this repo:

```bash
git clone git@github.com:llevasseur/my-command.git
cd my-command
./scripts/install-personal.sh      # symlinks the bare commands into ~/.claude/commands
```

The symlinks point back into the clone, so `git pull` in this repo updates every
command on that device. Run `install-personal.sh` once per machine (it's
path-agnostic — clone the repo wherever you like).

Once set up, pull updates from any session with **`/sync`** — it finds the clone,
fast-forwards it, and re-links any newly added commands, without hardcoding where
the repo lives.

## Changelog

See [CHANGELOG.md](./CHANGELOG.md). New entries are added with the bundle's own
`changelog` command.

## License

MIT © Leevon Levasseur
