<h1 align="center">MyCommand</h1>

<p align="center"><strong>Your Wish is My Command.</strong></p>

<p align="center">
  A bundle of Claude Code commands and Codex Skills for carrying tasks from idea
  to a merged pull request and keeping long sessions focused.
</p>

---

## What's inside

| Command | What it does |
| :------ | :----------- |
| `task` | Take a task from plain-language criteria to an open PR: isolated branch/worktree, bootstrap, implement, verify, then clean + PR. |
| `god` | Take a task all the way to **merged**: `task` with `review` woven in, `mc` on conflict, wait for CI, merge the PR into `main`, pull `main`. No human in the loop. |
| `fb` | Implement a feedback request. Thin wrapper around `task` — current branch by default, or a worktree of an existing branch with `--target`. |
| `review` | Independently review an open PR against the codebase, then apply its findings via `fb`. Spawns a fresh reviewer by default; `--here` reviews directly in the current agent. |
| `pr` | Create/update the PR for the current branch with a concise bulleted description, written straight to GitHub. |
| `clean` | Clean up comments across a branch's changes — lean and to the point, comments only, never code. |
| `mc` | Merge the latest `main` into open PR branches (or one branch), resolve every conflict, and push. |
| `merge-deps` | Batch-merge open non-draft Dependabot PRs into `main` — resolve each with `/mc`, verify in a worktree, merge, and clean up. |
| `task-bootstrap` | One-time per repo: interview the stack and generate that repo's own `scripts/bootstrap-worktree.sh` so `task` can bootstrap fresh worktrees. |
| `sync` | Update this device's installed commands to the latest version from GitHub. |
| `changelog` | Add a concise entry to the current repo's `CHANGELOG.md`, matching its existing format. |
| `docs` | Reconcile a repo's [okq](https://github.com/mikevalstar/okq) doc bundle with the code, then truncate dirty docs to high-signal prose in the same `/task` run. |
| `truncate` | Cut a doc bundle down to high-signal tokens without losing a claim — standalone density cleanup for hand edits, explicit scopes, and full sweeps, with surviving prose rewritten toward a stated vocabulary standard. |
| `revive` | Resume an interrupted session from its recorded transcript — reconstruct what it was doing, recover its branch/worktree, finish only what's outstanding, and complete the original workflow. |
| `improve` | Turn claude-proxy's session suggestions **and the ideas a human accepted** into an implemented improvement — read the pending findings for a range of session buckets, have `judge` check them against the transcripts, escalate the ones whose last fix didn't hold, hand the confirmed ones plus any accepted ideas to `task` as criteria, and flag what shipped as done. |
| `ideate` | Propose what's worth **building**, not what's slow — survey a repo through evidence a person already wrote down (open questions, judge notes, the CHANGELOG, written deferrals), record every proposal in a ledger as `proposed`, and exit pointing at the dashboard's Advice page, where a sign-off turns the accepted ones into advice `improve` acts on. Proposal only: no branch, no PR, and no question asked. |
| `judge` | Decide whether claude-proxy's suggestions are true — read the raw transcripts behind each fired suggestion, confirm the ones the sessions support with context written from the transcript, dismiss the ones the rule misread, and record both verdicts per bucket. `improve`'s precondition. |
| `trim` | Decide whether the current conversation is safe to compact, then provide focused instructions for Claude Code's built-in `/compact`. |
| `cp` | Compose another command's invocation from a prompt and copy it to the clipboard, ready to paste into another agent — without running it or printing it. Every copy is also stashed under `~/.claude`, so `--again` puts it back after a later copy clobbers it. |
| `teach` | Learn the real name for something you can only describe — one question at a time, until you can say it back as a single Simplified Technical English sentence, printed and copied. |

## Use cases

Each command parses **leading flags off the front**; everything after them is the
free-text criteria (task, feedback, etc.). The examples below focus on how the
parameters change what happens. In Codex, use the same names and flags with
skill syntax—for example, `$task -h ...`, `$review -t 42`, or `$mc -t feat/search`.

| Command | Example | What the parameters do |
| :------ | :------ | :--------------------- |
| `task` | `/task add a dark-mode toggle to settings` | Default — fresh worktree off `main`, implement, then `/clean` + `/pr` **inline**; no subagent is spawned. |
| `task` | `/task -h fix the typo in the footer` | `--here` / `-h` — work on the **current branch**, no worktree. |
| `task` | `/task --base release/2.0 backport the auth fix` | `--base <branch>` — branch off `release/2.0` instead of `main`. |
| `task` | `/task -d wire up the metrics endpoint` | `--draft` / `-d` — open the resulting PR as a **draft**. |
| `task` | `/task -s add a dark-mode toggle to settings` | `--sub` / `-s` — run the `/clean` + `/pr` stage in **one fresh subagent** instead of inline. Same commands and order; a fresh context for the pair. |
| `task` | `/task -a changelog note this once it works add retry logic to the fetch client` | `--add` / `-a <command> <prompt>` — weave `/changelog` into the run per its prompt, then implement the task. Separate multiple added commands with a comma before each next command. |
| `god` | `/god add a dark-mode toggle to settings` | Default — the whole `/task` pipeline with `/review` woven in, then `/mc` if `main` moved, wait for CI, `gh pr merge --squash`, and pull the new `main`. Merges without asking. |
| `god` | `/god --auto ship the retry backoff` | `--auto` — don't wait on CI; enable GitHub auto-merge and finish. `--merge`/`--rebase` change the method, `--fix <n>` sets the red-CI repair budget (default 1), `--no-review` skips the woven-in `/review`. |
| `god` | `/god -h fix the typo in the footer` | `--here` / `-h`, `--base <branch>`, and `--add` / `-a` pass straight through to `/task`. `--sub` is always added to that invocation — the woven-in `/review` needs the subagent to land in. `--draft` / `-d` is rejected — a draft can't merge. |
| `fb` | `/fb tighten the copy on the empty state` | Default — apply the feedback on the **current branch** (via `/task --here`). |
| `fb` | `/fb -t feat/checkout-redesign use the brand blue for the CTA` | `--target` / `-t <branch>` — apply the feedback onto **existing** branch `feat/checkout-redesign` in a fresh worktree. |
| `review` | `/review` | Default — review the current branch's open PR in a fresh worktree with a new agent, then apply its findings via `/fb`, run **inline** rather than in another agent. |
| `review` | `/review -h` | `--here` / `-h` — the current agent reviews the current branch's PR directly: no worktree and no spawned reviewer. Use when already running in a fresh review agent. |
| `review` | `/review -t 42` | `--target` / `-t <PR-number-or-branch>` — review PR #42 (or a named branch) instead of the current branch's PR. |
| `mc` | `/mc` | Default — merge latest `main` into **every** open PR branch, resolve conflicts, push. |
| `mc` | `/mc -h` | `--here` / `-h` — only the **current branch**. |
| `mc` | `/mc -t feat/search` | `--target` / `-t <branch>` — only the named branch `feat/search`, merged in an **isolated worktree** so the current checkout is never touched. |
| `merge-deps` | `/merge-deps` | Default — merge every open non-draft `dependencies`-labeled PR into `main`, one by one (`/mc` first, verify, `gh pr merge --squash`, clean the worktree). |
| `merge-deps` | `/merge-deps --auto -n` | `--auto` enables GitHub auto-merge instead of waiting on CI; `--dry-run` / `-n` just lists the PRs. `--label <name>` narrows the filter, `--merge`/`--rebase` change the method. |
| `docs` | `/docs` | Default — audit every doc for staleness, add missing docs, prune obsolete docs, then truncate the resulting dirty queue without losing claims. Runs both phases in one `/task`: fresh worktree off `main`, then `/clean` + `/pr`. |
| `docs` | `/docs -h` | `--here` / `-h` — reconcile on the **current branch**, no worktree (passed through to `/task`). |
| `docs` | `/docs --base release/2.0` | `--base <branch>` — worktree branched off `release/2.0` instead of `main` (passed through to `/task`). |
| `docs` | `/docs -n` | `--dry-run` / `-n` — report stale / missing / obsolete docs and the projected density queue, then change nothing. No worktree, commit, or PR. |
| `docs` | `/docs -r features/pr` | Pass flags (`--refresh` / `-r`, `--add` / `-a`, `--prune` / `-p`) narrow reconciliation; trailing text scopes it. The final density phase still clears the resulting dirty queue. `--bundle` picks the bundle; `--yes` also skips the 40% cut guard. |
| `truncate` | `/truncate` | Default — tighten every doc marked `dirty: true`, preserving every claim, then clear the flag. Use independently after hand edits or an interrupted queue; it runs via its own `/task`. |
| `truncate` | `/truncate -A` | `--all` / `-A` — evaluate the **whole bundle**, not just the dirty docs. For a bulk import or a bundle's first pass. |
| `truncate` | `/truncate -n` | `--dry-run` / `-n` — report the queue and the proposed cuts, change nothing. No worktree, commit, or PR. |
| `truncate` | `/truncate features/task` | Trailing text scopes the run to a concept id, path/glob, or topic, **overriding** the dirty filter. `--bundle` / `-b <dir>` picks the bundle, `--yes` / `-y` skips the 40%-cut confirmation, `--here` / `-h` and `--base <branch>` pass through to `/task`. |
| `revive` | `/revive 59da5fc97e6b9465` | Default — resolve the id in claude-proxy's transcript store (`$CLAUDE_PROXY_STORE`), recover the branch/worktree the session was in, finish what's outstanding, then complete its workflow (usually `/clean` + `/pr`). |
| `revive` | `/revive -n 59da5fc97e6b9465` | `--dry-run` / `-n` — report where the session stopped and what remains; change nothing. |
| `revive` | `/revive --source cli 70c65b5b-ceda-4764-89f0-d68f1db6fff6` | `--source proxy` (default), `cli`, or a `<path>` — pick the transcript store; a 36-char UUID is a CLI session id, a 16-hex id a proxy thread id. |
| `improve` | `/improve` | Default — read **every** session bucket's pending suggestions from claude-proxy (`$CLAUDE_PROXY_STORE`), compose them into criteria (regressions first), run `/task` on them in a subagent per target repo, then mark what shipped as `done`. |
| `improve` | `/improve -r 2-9` | `--range` / `-r <spec>` — only those buckets. One (`9`), a list (`2,3,9`), a span (`2-9`), or a mix (`2-4,9`). |
| `improve` | `/improve -g` | `--regressed` / `-g` — only rules whose dated fix already failed. Reads the prior fix back from its PR and requires the new one to climb the escalation ladder rather than restate it. |
| `improve` | `/improve -n -r 9` | `--dry-run` / `-n` — report the pending suggestions and the criteria they compose into; no subagent, no PR, nothing marked. |
| `improve` | `/improve -d -r 9 only the serial-discovery findings` | `--here` / `-h`, `--base <branch>`, `--draft` / `-d`, `--add` / `-a` pass straight through to `/task`; trailing text narrows which pending suggestions to act on. |
| `ideate` | `/ideate` | Default — survey the repo through all four evidence sources, compose at most 3 ranked proposals, write them all to the ledger as `proposed`, then **exit**, naming the dashboard's Advice page as where they get accepted or rejected. Unattended: no question, no branch, no PR. |
| `ideate` | `/ideate -r 2-9` | `--range` / `-r <spec>` — the bucket window for **judge notes only**. The other three sources (open questions, CHANGELOG, written deferrals) aren't bucketed and aren't narrowed. |
| `ideate` | `/ideate -n` | `--dry-run` / `-n` — report the proposals and write **nothing at all**, not even the `proposed` rows. Still reads every ledger tier for dedupe. |
| `judge` | `/judge -r 40-42` | `--range` / `-r <spec>` — judge the **dirty** buckets in that range: read the raw transcripts behind each fired suggestion, return CONFIRMED with a note written from what the agent was doing or DISMISSED with the reason the rule misread it, and record both in one call per bucket. Never touches a partial or already-judged bucket. |
| `judge` | `/judge` | Default — every bucket. It judges only the dirty ones, and names the bucket count and rough read cost before starting, since a large backlog is a megabyte-scale backfill. |
| `judge` | `/judge -n -r 41` | `--dry-run` / `-n` — report the dirty buckets, the suggestions in each, and the transcripts it would read; record nothing. |
| `trim` | `/trim` | Evaluate six evidence-backed safety gates; recommend continuing or emit a tailored `/compact` command. |
| `cp` | `/cp task add a dark-mode toggle to settings` | Default — shape the prompt to stand alone for an agent that can't see this conversation, copy `/task add a dark-mode toggle to settings` to the clipboard, and reply `Done!`. The named command is never run, loaded, or printed. |
| `cp` | `/cp -v review 42` | `--verbatim` / `-v` — copy the prompt exactly as typed, no shaping. |
| `cp` | `/cp --again` | `--again` / `-a` — restore the last copy from `~/.claude/cp-last.txt` to the clipboard. No composing, no reading, no tokens spent on the text. A trailing slot number reaches an older ring entry (`/cp --again 2` → `cp-last.2.txt`, five deep). |
| `teach` | `/teach the thing where scroll goes past the end and springs back` | Default — name the technique from a matching glossary skill, ask one question at a time until you can say it back, then print **and** copy one ≤25-word Simplified Technical English sentence. Reads no files. |
| `teach` | `/teach -h the bouncy thing our modal does` | `--here` / `-h` — read the current repo so the sentence can name the real component and the pattern already in use. |

`revive`'s default proxy source is location-agnostic: export **`CLAUDE_PROXY_STORE`**
(the directory holding `<id>.md` transcripts) and optionally **`CLAUDE_PROXY_ARCHIVE`**
(where older days are relocated) in your shell. Without `CLAUDE_PROXY_STORE`,
`/revive` fails fast instead of guessing a path — `--source cli` and
`--source <path>` still work. `improve` reads the same variable: its parent is the
log directory the suggestion flags live in, and the directory above that is the
claude-proxy checkout whose `suggestions` CLI it calls. Without it, `/improve`
stops rather than searching for a checkout.

```sh
export CLAUDE_PROXY_STORE="$HOME/path/to/claude-proxy/logs/sessions"
export CLAUDE_PROXY_ARCHIVE="$HOME/path/to/archived/claude/logs"   # optional
```

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
3. **Codex Skills** — Codex-native workflows such as `$task` copied as complete
   skill folders into `~/.agents/skills/<name>/`. Set `CODEX_SKILLS_DIR` to
   override the destination, or set `CODEX_HOME` to use `<CODEX_HOME>/skills`.

The repository also ships `.codex-plugin/plugin.json`, so supported Codex
surfaces can install the complete skill bundle as a plugin.

Every choice also installs the **command toolkit** — a zero-dependency Node CLI
the commands and skills call for deterministic git/gh plumbing. It lands under
`~/.claude/my-command/` for Claude or `${CODEX_HOME:-~/.codex}/my-command/` for
Codex and gets linked onto PATH, because every workflow spells the call as a
bare `my-command-tools`. In a new shell:

```bash
my-command-tools doctor
```

`doctor`'s `onPath` block reports whether that bare call resolves and whether it
resolves to this install's shim. If the installer found neither `~/.local/bin` nor
`~/bin` on your PATH it links nothing and prints the `ln -s` line to run — it never
edits a shell profile.

The Claude commands and Codex skills route git/gh plumbing through it—`task`
sets up its worktree with `worktree begin`, gates on `state`'s `hasWork`, runs
repository checks with `verify`, and commits an explicit path list with
`commit`; `pr` pushes and opens or updates the PR in one call. Judgment stays in
the prompts. `clean` is the deliberate exception because comment scope itself
requires judgment.

See [Command toolkit](./docs/specs/command-toolkit.md).

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
skills/             Codex-native workflow skills — one semantic counterpart per Claude command
src/my-command.ts   The npx install wizard, in TypeScript (compiled to dist/, ships dependency-free)
src/toolkit/        Shared CLI every command calls — raw .mjs, shipped as-is (see docs/specs/command-toolkit.md)
  cli.mjs              Entrypoint and verb registry; JSON on stdout
  verbs/               state, scope, verify, commit, pr, prs, worktree, doctor
  lib/                 git/process/path/gh helpers
  bin/my-command-tools The shim that resolves the toolkit device-wide
src/hooks/          Workflow gates the harness runs (see docs/specs/workflow-gates.md)
  pre-tool-use.mjs     Refuses serial discovery, redundant reads, and an unresolvable relative cd
  stop.mjs             Refuses to end a run that recorded no outcome
  settings-fragment.json  What gets merged into settings.json (hooks + read-only allowlist)
  install-hooks.mjs    The idempotent merge; --uninstall removes it again
dist/               GENERATED wizard build (tsc output; gitignored, built on install via `prepare`)
commands/           GENERATED namespaced commands the plugin ships (do not edit by hand)
scripts/
  build-plugin.sh      Regenerate commands/ from src/commands/ (bare → /my-command:)
  check-commands.sh    Enforce command + toolkit invariants (commands/ in sync, feature docs, verbs registered) — runs in CI
  install-personal.sh  Symlink src/commands/*.md into ~/.claude/commands (bare, git-synced)
  install-codex-personal.sh  Symlink skills + toolkit into Codex device scopes (git-synced)
AGENTS.md           Repo rules for agents (the adding-a-command checklist + the CI gate)
biome.json          Biome lint + format config
tsconfig.json       TypeScript config (strict; compiles src/ → dist/)
tsconfig.toolkit.json  Typechecks src/toolkit/*.mjs via allowJs + checkJs (no emit — it ships as source)
.github/workflows/  Pull-request CI (merge-conflict check, Biome, typecheck, toolkit, build)
.claude-plugin/     Claude Code plugin + marketplace metadata
.codex-plugin/      Codex plugin manifest for the native skills bundle
docs/               okq spec bundle — specs/ (process), features/ (one per command), adrs/
```

The two Claude forms exist because the commands reference each other: a bare
`task` calls `/clean`, but the published plugin's `task` must call
`/my-command:clean`. The Codex mode installs checked-in native skills instead of
presenting Claude-only prose under Codex frontmatter. CI enforces that every
Claude command has exactly one Codex counterpart.

## Specs

The suite is documented as a queryable [okq](https://github.com/mikevalstar/okq)
bundle under [`docs/`](./docs) — process specs plus one feature doc per command:

- **[Adding a command](./docs/specs/adding-a-command.md)** — the checklist for
  adding a command as agent instructions (bare source → build → feature doc →
  wizard → README/CHANGELOG). Read this before adding one.
- **[Install wizard](./docs/specs/install-wizard.md)** — how the wizard installs
  the suite for Claude Code and Codex, including per-item overwrite behavior.
- **[Command toolkit](./docs/specs/command-toolkit.md)** — the device-wide
  `my-command-tools` CLI, its verbs and guards, and how it reaches every install
  mode.
- **[Workflow gates](./docs/specs/workflow-gates.md)** — the `PreToolUse` and
  `Stop` hooks and the toolkit recoveries that enforce the workflow rules
  mechanically, how they fail open, and how to turn them off
  (`MY_COMMAND_HOOKS=0`).
- **`docs/features/<cmd>.md`** — the flags, parameters, and behavior of each
  command.
- **[Claude and Codex support patterns](./docs/research/2026-07-19-claude-codex-support-patterns.md)** —
  research behind the Codex Skills adapter.

Two invariants the specs enforce: **a new command needs a feature doc and wizard
inclusion**, and **a flag/param change needs its feature doc updated in the same
change**. Query them with `okq --bundle docs find --type feature`.

A doc you write or change also gets **`dirty: true`** in its frontmatter—its
claims are right, but its prose has not been evaluated for density since it
changed. `/docs` consumes that queue in its final phase; standalone `/truncate`
does the same without first reconciling claims
(`okq --bundle docs find --where dirty=true`). Neither density path bumps the
claim timestamp. See
[ADR 0004](./docs/adrs/0004-docs-completes-density-pass.md).

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
./scripts/install-codex-personal.sh # symlinks $skills and toolkit for Codex
```

The symlinks point back into the clone, so `git pull` updates every Claude
command, Codex skill, the toolkit, and the workflow gates. Run the relevant
script once per machine; both are path-agnostic.

`install-personal.sh` also registers the [workflow gates](./docs/specs/workflow-gates.md)
in `~/.claude/settings.json` — the hooks that refuse serial discovery, a redundant
whole-file re-read, a relative `cd` that cannot resolve, and a run that ends with no
outcome. They fail open, never refuse the same thing twice, and always name the faster
form. Skip registering them with `./scripts/install-personal.sh --no-hooks`, silence
them at any time with `export MY_COMMAND_HOOKS=0`, or remove the registration with
`node ~/.claude/my-command/hooks/install-hooks.mjs --uninstall`.

Once set up, pull updates from any session with **`/sync`** — it finds the clone,
fast-forwards it, and re-links any newly added commands, without hardcoding where
the repo lives.

## Changelog

See [CHANGELOG.md](./CHANGELOG.md). New entries are added with the bundle's own
`changelog` command.

## License

MIT © Leevon Levasseur
