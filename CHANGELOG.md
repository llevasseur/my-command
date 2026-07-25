# Changelog

All notable changes to MyCommand are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com). There are no fixed release
versions — the plugin publishes continuously and installed copies track the
latest commit (SHA-based versioning), so changes are grouped by date.

## 2026-07-24

### Added

- **`revive` command** — resume a session that stopped mid-flight (cleared, compacted away, killed, or abandoned) and left its work half-applied on a branch. `/revive <session-id>` resolves the id against **claude-proxy's transcript store by default** — `$CLAUDE_PROXY_STORE/<threadId>.md`, where the thread id is `sha256(sessionId + "\n" + first-user-text).slice(0, 16)` — searching the live store and then globbing the relocated days under `$CLAUDE_PROXY_ARCHIVE`; a 36-char UUID or `--source cli` reads the Claude Code JSONL instead, and `--source <path>` reads a file directly. It walks between the two stores through the transcript's `- session: <uuid>` header, and knows one session id can own several thread ids because each subagent gets its own conversation root. The transcript is treated as a **lossy digest**: read for the ask, the (often nested) slash-command workflow that was running, the human's already-settled mid-run decisions, the `- ✗` errors, and the point where it stops — the transcript simply *ending* being the interruption signal. Workspace recovery reads `cwd`/`gitBranch` from the CLI transcript and resumes that directory in place, or recreates a worktree checking out the **existing** branch, never a fresh branch off `main`. Then `git status`/`diff`/`log` plus the repo's own gate scripts establish what actually landed, and only the remainder is worked — each claim re-verified against source, since the digest's reasoning lines are truncated summaries. The run finishes on the *original* workflow's terms (for anything wrapped in `/task`: commit, `/clean`, `/pr`, teardown) without nesting a new `/task`. `--dry-run` / `-n` reports where it stopped and what remains, changing nothing. Ships with `docs/features/revive.md` and README entries.
- **`docs` command** — reconcile a repo's [okq](https://github.com/mikevalstar/okq) doc bundle with the code it describes, covering all three directions docs rot: **stale** (a doc that no longer matches the code), **missing** (a feature with no doc), and **obsolete** (a doc for something that was removed). It discovers the bundle, reads the bundle's *own* contract first (frontmatter keys, generated `index.md`s, folder templates, the 1:1 unit it documents, any docs gate script) and lets those rules win, then reconciles concepts against documentable units into CHECK / MISSING / OBSOLETE before editing anything. The staleness pass audits docs **one at a time** in fresh subagents, using git recency only to rank suspicion and claim-level comparison (flags, defaults, paths, exit codes, behavior — `old → current`) as the real verdict; drift found in one doc is re-checked across its `neighbors`/`backlinks`. Code that looks like the regression is flagged for the user rather than blessed by rewriting the doc, a wrong ADR is superseded rather than edited, a rename is repointed rather than deleted, and every deletion is confirmed with evidence and made with `git rm`. Pass flags `--refresh` / `-r`, `--add` / `-a`, `--prune` / `-p` combine (all three by default); `--dry-run` / `-n` plans without writing, `--bundle` / `-b <dir>` picks the bundle, `--yes` / `-y` skips confirmations, and trailing text scopes the run to a concept, path, or topic. Ships with `docs/features/docs.md` and README entries.

### Changed

- **`revive` now reads the claude-proxy store location from the environment instead of hardcoded paths.** Step 1 named one device's checkout (`~/Documents/ghub/personal/claude-proxy/logs/sessions/`) and one archive root (`~/Documents/logs/claude/<date>/`), so the default `--source proxy` path only resolved on a machine where claude-proxy happened to live there. The store is now **`$CLAUDE_PROXY_STORE`** — the directory holding `<id>.md` transcripts, read from the environment, never guessed and never derived from a repo checkout — with an optional **`$CLAUDE_PROXY_ARCHIVE`** searched recursively for relocated days (unset means the archive is skipped and the command says so). When `CLAUDE_PROXY_STORE` is unset or its path is missing, `/revive` **fails fast**: it reports the missing variable, shows the `export` to add, and offers `--source cli` / `--source <path>` rather than searching for the store or silently falling back. The cross-walk grep and the retention note follow the variables, and the two references to claude-proxy's own source files (`proxy/session.mjs`, `packages/core/src/sessions.ts`) are gone — the thread-id derivation and transcript shape are stated directly. Feature doc gained an **Environment** section; README gained the `export` snippet.
- **`task` now skips `/clean` and `/pr` when a run produced no changes.** Step 3 dispatched both subagents unconditionally, so criteria that turned out to be already satisfied ("do X if it isn't already the case") still burned two subagents and ended with `/pr` pushing a branch and opening a PR with an empty diff. Step 3 now opens with a gate: check this run's commits (`<base>..HEAD`, where the base is `origin/<default>`, `--base <branch>`, or the pre-run commit under `--here`) and `git status --porcelain`, discounting pre-existing untracked files carried over from the original workspace. When both are empty it skips straight to teardown and reports what it checked and that no PR was opened; under `--here` it leaves any pre-run unpushed commits alone rather than shipping them as this run's work. Step 2 gained the matching instruction not to manufacture edits when inspection shows the criteria already hold.
- **`task` now states outright that step 3's teardown removes the worktree even when the PR is a draft.** `--draft` / `-d` was documented only as a flag passed through to `/pr`, which left room to read a draft PR as unfinished work worth keeping a local worktree for. The teardown step and the flag description now say the opposite explicitly: `--draft` controls the PR's review state on GitHub, not the local workspace, and a draft's commits are on origin just the same — `--here` is the only thing that skips teardown.
- **`task` now expects `ExitWorktree`'s commit guard at teardown and calls the form that satisfies it.** On the shipped path the branch always carries commits, so `ExitWorktree` with `action: "remove"` alone refuses — `Worktree has N commits on <branch>. Removing will discard this work permanently.` — and asks for a second invocation with `discard_changes: true`, making a failed tool call part of every successful run. Step 3's teardown now says to confirm `git rev-parse HEAD` matches `git rev-parse origin/<branch>` once `/pr` has pushed and then pass `action: "remove"` **and** `discard_changes: true` on the first attempt, since with every commit on origin the "discard" drops only the local worktree. HEAD ahead of origin means push before tearing down rather than discarding, and the no-change path still uses plain `action: "remove"` because it has no commits to guard.
- **`docs` now runs inside a `/task` workflow and takes workspace flags.** Previously it edited docs in the current checkout and left committing to whatever invoked it, so a direct `/docs` run ended with uncommitted edits and no PR. A new Step 0 resolves *where* the work happens and hands the passes to `/task` as plain-language criteria, so `/task` owns worktree setup, commits, `/clean`, `/pr`, and teardown — exactly how `/fb` wraps `/task`, but defaulting the other way: `/docs` with no flags gets a fresh worktree off the latest `main` on a `docs/<summary>` branch, matching `/task`'s own default. `--here` / `-h` reconciles on the current branch and `--base <branch>` branches off something other than `main`, both passed straight through. `--dry-run` / `-n` short-circuits the handoff entirely — it stays in the current checkout and creates no worktree, commit, or PR. The command still creates no worktree itself (that would nest one inside another), and the pass flags stay local: `-a` is the missing-docs pass here but registers commands in `/task`, so they are never forwarded as flags.

## 2026-07-22

### Added

- **`review` command** — spawn a fresh, independent agent to review an open PR (worktree by default, `--here` in place, `--target`/`-t <PR-number-or-branch>` like `fb`). The reviewer checks the diff against the PR's own description, runs the repo's verification, compares against existing conventions, and returns findings plus a single ready-to-run `/fb` line. `/review` shows that copy-pasteable output, then applies it itself via the `fb` skill — chaining into `task`, `clean`, and `pr` to update the same PR. Ships with `docs/features/review.md` and README entries.

## 2026-07-21

### Added

- **`tmp/` is now gitignored** — `tmp/*` with a `!tmp/.gitkeep` exception ignores the scratch directory's contents (research docs, throwaway logs, experiments) while keeping the empty directory tracked.

### Changed

- **Prompt-accepting commands reference the injected `<command-args>` block instead of interpolating `$ARGUMENTS`.** `fb`, `task`, `pr`, `changelog`, and `task-bootstrap` embedded `$ARGUMENTS`, which Claude Code substitutes with a full copy of the user's arguments — so a large paste (a component, an error dump) landed in the request twice: once in the harness-injected `<command-args>` block and again in the substituted body. Referring to the block drops the redundant second copy. Flag-only commands (`clean`, `mc`, `sync`, `merge-deps`) are unchanged, since their args are short tokens where duplication is negligible.

## 2026-07-18

### Added

- **`merge-deps` command** — batch-merge open non-draft Dependabot PRs into `main`, one by one. For each in-scope PR (filtered by label, default `dependencies`; fork/cross-repo PRs skipped) it runs `/mc -t <branch>` to merge `main` in and resolve conflicts, checks the branch out in a throwaway worktree to verify the bump is green, merges into `main` via `gh pr merge` (branch protection respected; `--squash` default, `--merge`/`--rebase`/`--auto` available), then removes the worktree and refreshes local `main` before the next. `--dry-run` / `-n` lists the queue without touching anything. Ships with a feature doc (`docs/features/merge-deps.md`) and README entries.
- **`scripts/check-commands.sh` + `commands` CI job** — a gate enforcing the [adding-a-command](docs/specs/adding-a-command.md) invariants: `commands/` byte-in-sync with `src/commands/`, every command has a `docs/features/<name>.md` and a generated copy, and the install wizard still enumerates `src/commands/` dynamically. A half-wired command now fails PR CI instead of shipping silently. Exposed as `pnpm run check:commands`.
- **`AGENTS.md`** — repo rules for agents, foregrounding the command-authoring checklist and the CI gate. Makes explicit that the wizard needs **no** manual edit (it globs `src/commands/`), which is why a new command auto-appears.

### Changed

- **`pr` worktree teardown now force-removes up front.** Step 7 calls `ExitWorktree` with `discard_changes: true` in the same call as `action: "remove"`, expecting this task's commits to live on the worktree. Since the branch was already pushed to origin in step 2, force-removing discards only the redundant local copy — this avoids the refuse-then-retry round-trip the previous confirm-first flow triggered on every worktree that carried a commit.

### Fixed

- The [adding-a-command](docs/specs/adding-a-command.md) spec's "Confirm wizard inclusion" step pointed at the retired `bin/my-command.mjs`; the wizard has been `src/my-command.ts` since the TypeScript migration. Updated the path and clarified the wizard enumerates `src/commands/` with `readdirSync`, so there is nothing to hand-edit — only verify (now backed by `scripts/check-commands.sh`).
- `merge-deps` now fetches each PR branch fresh (`git fetch origin <branch>`) right before running `/mc` on it. Dependabot force-pushes its branches, so the ref cached by the up-front `git fetch` goes stale mid-run; branching `/mc` off the stale ref made its push get rejected as a non-fast-forward and stalled the loop. The per-PR loop and Notes now spell this out.

## 2026-07-17

### Added

- **Biome** lint + format (`biome.json`), with `lint`, `format`, and `check` package scripts.
- **TypeScript** toolchain — the install wizard is now authored in `src/my-command.ts` and compiled to `dist/` by `tsc`. A `prepare` script builds on install so `npx github:llevasseur/my-command` still runs dependency-free with no manual build. Adds `typecheck` (`tsc --noEmit`) and `build` scripts, `tsconfig.json` (strict), and a `>=22` Node engines constraint.
- **Pull-request CI** (`.github/workflows/ci-pr.yml`) modeled on the `wishing-well` workflow: a **merge-conflict** job that fails the PR when it cannot cleanly merge into its base, plus Biome, typecheck, and build jobs. Paired with branch protection on `main` (require branches up to date + required checks) so the origin blocks merging a conflicting or stale branch.

### Changed

- The install wizard moved from `bin/my-command.mjs` (hand-written JS) to `src/my-command.ts`; the published `bin` now points at the compiled `dist/my-command.js`. Runtime behavior is unchanged.

## 2026-07-15

### Fixed

- `task` now branches worktrees off the *latest* `main` instead of whatever `origin/main` the local checkout last saw. Step 1 fetches (`git fetch origin`) before creating the worktree and, after entering, verifies the base matches `origin/<default>` — resetting the fresh (commit-less) branch onto it when `EnterWorktree` planted it on a stale local HEAD. Previously a task could silently build on out-of-date code.
- `npx github:llevasseur/my-command` ran but did nothing (exited silently). The wizard's "invoked directly" guard compared `import.meta.url` against `process.argv[1]`, but `npx` runs the bin through a `node_modules/.bin` symlink — so `argv[1]` was the symlink path while `import.meta.url` was the resolved real path, and they never matched, so `main()` never ran. The guard now resolves `argv[1]` with `realpathSync` before comparing, so both `node bin/my-command.mjs` and the `npx` symlink invocation start the wizard.

### Added

- `trim` command — apply an evidence-backed safety rubric to the current conversation and, when safe, provide focused instructions for Claude Code's built-in `/compact`.
- README gains a **Use cases** section — a command/example table for `task`, `fb`, and `mc` that highlights how each parameter (`--here`, `--base`, `--draft`, `--add`, `--target`) changes what the command does.
- `docs/` [okq](https://github.com/mikevalstar/okq) spec bundle — process specs ([Adding a command](docs/specs/adding-a-command.md), [Install wizard](docs/specs/install-wizard.md)) plus one feature doc per command in `docs/features/`, indexed with `okq --bundle docs index`. The specs codify two invariants: a new command needs a feature doc and wizard inclusion (with overwrite), and a command's feature doc must be updated whenever its flags or params change. README now references the specs and documents `docs/` in the repository layout.

### Changed

- Personal install (the `npx` wizard) no longer silently skips commands that already exist. When there are conflicts it now shows an interactive checkbox — with a **Select all / Deselect all** toggle pinned at the top — so you pick exactly which existing commands to overwrite. Conflicts start unchecked (nothing is clobbered by default), and non-interactive shells keep the old safe behavior of leaving existing files untouched.
- Personal install now warns instead of doing nothing when you already have every command and confirm the overwrite prompt with none selected. Pressing Enter on an empty selection used to report a hollow `Copied 0 new, overwrote 0`; it now tells you to pick commands to overwrite (or press Esc to cancel). Cancelling with Esc, and runs that still install fresh commands, are unaffected.
- The overwrite prompt no longer closes when you confirm with nothing selected. Instead of exiting, it keeps you in the checkbox and shows a yellow "Select at least one command to overwrite, or press Esc to cancel" alert — so an accidental Enter can't drop you out of the wizard. Esc still closes it whenever you want, and cancelling that way now reports `Nothing changed` rather than a hollow `Copied 0`.
- `task` Step 3 now runs `/clean` and `/pr` in **fresh subagents** (via the `Agent` tool) instead of inline. Both stages derive their inputs entirely from git, so an isolated context loses nothing while shedding the large, stale file reads a long task accumulates by its final stages. Worktree teardown moves to the task agent itself, since `ExitWorktree` only works in the session that created the worktree.

## 2026-07-14

### Added

- `task` command gains an `--add` / `-a` flag — Step 0 discovers listed commands available on the user's device, loads their instructions and associated prompts into context, and updates the pipeline before the task begins; commands the agent cannot find are skipped.
- `sync` can update real-file personal installs from the marketplace, converting published `/my-command:*` references back to bare commands during installation.

## 2026-07-13

### Added

- Initial bundle of six workflow commands (`task`, `fb`, `pr`, `clean`, `mc`, `task-bootstrap`), published as a Claude Code plugin and single-plugin marketplace.
- Bare canonical source in `src/commands/`, with `scripts/build-plugin.sh` generating the namespaced `commands/` the plugin ships.
- `scripts/install-personal.sh` — symlink the bare commands into `~/.claude/commands` for git-synced personal use across devices.
- Zero-dependency `npx` install wizard (`npx github:llevasseur/my-command`) offering plugin install or a bare personal copy.
- `sync` command — update the locally-installed commands to the latest version from GitHub.
- `changelog` command — add a concise entry to a repo's `CHANGELOG.md`, matching that repo's existing format.

### Changed

- Dropped the pinned `version` in `plugin.json` so the git commit SHA drives versioning and every push counts as an update for auto-updating installs.

### Fixed

- Build transform no longer rewrites command names embedded in file paths (e.g. `~/.claude/commands/sync.md`); only bare slash-command invocations are namespaced.
