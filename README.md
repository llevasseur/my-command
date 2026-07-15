<h1 align="center">MyCommand</h1>

<p align="center"><strong>Your Wish is My Command.</strong></p>

<p align="center">
  A bundle of Claude Code workflow commands for carrying tasks from idea to a
  merged pull request and keeping long sessions focused.
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
| `trim` | Decide whether the current conversation is safe to compact, then provide focused instructions for Claude Code's built-in `/compact`. |

## Use cases

Each command parses **leading flags off the front**; everything after them is the
free-text criteria (task, feedback, etc.). The examples below focus on how the
parameters change what happens.

| Command | Example | What the parameters do |
| :------ | :------ | :--------------------- |
| `task` | `/task add a dark-mode toggle to settings` | Default — fresh worktree off `main`, implement, then `/clean` + `/pr`. |
| `task` | `/task -h fix the typo in the footer` | `--here` / `-h` — work on the **current branch**, no worktree. |
| `task` | `/task --base release/2.0 backport the auth fix` | `--base <branch>` — branch off `release/2.0` instead of `main`. |
| `task` | `/task -d wire up the metrics endpoint` | `--draft` / `-d` — open the resulting PR as a **draft**. |
| `task` | `/task -a changelog note this once it works add retry logic to the fetch client` | `--add` / `-a <command> <prompt>` — weave `/changelog` into the run per its prompt, then implement the task. Separate multiple added commands with a comma before each next command. |
| `fb` | `/fb tighten the copy on the empty state` | Default — apply the feedback on the **current branch** (via `/task --here`). |
| `fb` | `/fb -t feat/checkout-redesign use the brand blue for the CTA` | `--target` / `-t <branch>` — apply the feedback onto **existing** branch `feat/checkout-redesign` in a fresh worktree. |
| `mc` | `/mc` | Default — merge latest `main` into **every** open PR branch, resolve conflicts, push. |
| `mc` | `/mc -h` | `--here` / `-h` — only the **current branch**. |
| `mc` | `/mc -t feat/search` | `--target` / `-t <branch>` — only the named branch `feat/search`. |
| `trim` | `/trim` | Evaluate six evidence-backed safety gates; recommend continuing or emit a tailored `/compact` command. |

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
