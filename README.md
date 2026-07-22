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
| `review` | Spawn a fresh agent to review an open PR against the codebase, then apply its findings via `fb`. Worktree by default, or `--here`/`--target` like `fb`. |
| `pr` | Create/update the PR for the current branch with a concise bulleted description, written straight to GitHub. |
| `clean` | Clean up comments across a branch's changes — lean and to the point, comments only, never code. |
| `mc` | Merge the latest `main` into open PR branches (or one branch), resolve every conflict, and push. |
| `merge-deps` | Batch-merge open non-draft Dependabot PRs into `main` — resolve each with `/mc`, verify in a worktree, merge, and clean up. |
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
| `review` | `/review` | Default — review the current branch's open PR in a fresh worktree with a new agent, then apply its findings via `/fb`. |
| `review` | `/review -h` | `--here` / `-h` — review the current branch's PR in place, no worktree. |
| `review` | `/review -t 42` | `--target` / `-t <PR-number-or-branch>` — review PR #42 (or a named branch) instead of the current branch's PR. |
| `mc` | `/mc` | Default — merge latest `main` into **every** open PR branch, resolve conflicts, push. |
| `mc` | `/mc -h` | `--here` / `-h` — only the **current branch**. |
| `mc` | `/mc -t feat/search` | `--target` / `-t <branch>` — only the named branch `feat/search`. |
| `merge-deps` | `/merge-deps` | Default — merge every open non-draft `dependencies`-labeled PR into `main`, one by one (`/mc` first, verify, `gh pr merge --squash`, clean the worktree). |
| `merge-deps` | `/merge-deps --auto -n` | `--auto` enables GitHub auto-merge instead of waiting on CI; `--dry-run` / `-n` just lists the PRs. `--label <name>` narrows the filter, `--merge`/`--rebase` change the method. |
| `trim` | `/trim` | Evaluate six evidence-backed safety gates; recommend continuing or emit a tailored `/compact` command. |

The `trim` command adapts the context-compaction strategy introduced by Yujiang Li,
Zhenyu Hou, Yi Jing, Jie Tang, and Yuxiao Dong in
[*CompactionRL: Reinforcement Learning with Context Compaction for Long-Horizon Agents*](https://arxiv.org/abs/2607.05378)
to an inference-time safety rubric for interactive coding sessions.

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
src/my-command.ts   The npx install wizard, in TypeScript (compiled to dist/, ships dependency-free)
dist/               GENERATED wizard build (tsc output; gitignored, built on install via `prepare`)
commands/           GENERATED namespaced commands the plugin ships (do not edit by hand)
scripts/
  build-plugin.sh      Regenerate commands/ from src/commands/ (bare → /my-command:)
  check-commands.sh    Enforce command invariants (commands/ in sync, feature docs, wizard glob) — runs in CI
  install-personal.sh  Symlink src/commands/*.md into ~/.claude/commands (bare, git-synced)
AGENTS.md           Repo rules for agents (the adding-a-command checklist + the CI gate)
biome.json          Biome lint + format config
tsconfig.json       TypeScript config (strict; compiles src/ → dist/)
.github/workflows/  Pull-request CI (merge-conflict check, Biome, typecheck, build)
.claude-plugin/     plugin.json + marketplace.json
docs/               okq spec bundle — specs/ (process), features/ (one per command), adrs/
```

Two forms exist because the commands reference each other: a bare `task` calls
`/clean`, but the published plugin's `task` must call `/my-command:clean`. The
**bare source is canonical**; the namespaced `commands/` is built from it.

## Specs

The suite is documented as a queryable [okq](https://github.com/mikevalstar/okq)
bundle under [`docs/`](./docs) — process specs plus one feature doc per command:

- **[Adding a command](./docs/specs/adding-a-command.md)** — the checklist for
  adding a command as agent instructions (bare source → build → feature doc →
  wizard → README/CHANGELOG). Read this before adding one.
- **[Install wizard](./docs/specs/install-wizard.md)** — how `bin/my-command.mjs`
  installs the suite and its per-command overwrite behavior.
- **`docs/features/<cmd>.md`** — the flags, parameters, and behavior of each
  command.

Two invariants the specs enforce: **a new command needs a feature doc and wizard
inclusion**, and **a flag/param change needs its feature doc updated in the same
change**. Query them with `okq --bundle docs find --type feature`.

## Editing the commands (maintainer)

To **add** a command, follow the [Adding a command](./docs/specs/adding-a-command.md)
spec. To edit an existing one:

```bash
# 1. Edit the bare source
$EDITOR src/commands/task.md

# 2. Regenerate the namespaced plugin commands
./scripts/build-plugin.sh

# 3. If flags or params changed, update that command's feature doc
$EDITOR docs/features/task.md   # then: okq --bundle docs index

# 4. Commit + push — installed plugins auto-update (version is SHA-based)
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
