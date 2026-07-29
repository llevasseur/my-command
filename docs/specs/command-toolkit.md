---
type: spec
title: Command toolkit
description: The device-wide `my-command-tools` CLI that commands call for the deterministic git/gh plumbing of a workflow run, and how it ships with every install mode.
tags: [process, toolkit, install, cli]
timestamp: 2026-07-25
---

# Command toolkit

## Summary

A command is agent instructions, not code — but every workflow command (`/task`,
`/pr`, `/fb`, `/god`, `/revive`) opens by re-deriving the same git state
with a volley of one-off shell calls, and re-derives it slightly differently each
run. `my-command-tools` is a zero-dependency Node CLI that owns that deterministic
half: it answers "where am I and what did this run produce", runs the repo's own
gates, stages and commits an explicit path list, pushes and opens the PR, and
manages the worktree lifecycle. Every verb returns **JSON on stdout**, so a command
parses one structured answer instead of interpreting prose.

Judgment stays with the agent. The toolkit never decides whether a comment is
noise, what a PR description should say, or whether a failure is worth fixing.

## Verbs

| Verb | Answers |
|------|---------|
| `state` | branch, base, commits, tracked vs untracked changes, `hasWork` |
| `verify` | which of the repo's gates ran and passed; bounded output only on failure |
| `commit` | stage an explicit path list and commit, with guards |
| `pr` | push, then create or update the branch's PR |
| `worktree begin\|end\|list` | the isolated-workspace lifecycle |
| `doctor` | where the toolkit resolved from, and what's on PATH |

`state` collapses the rev-parse / status / log / diff opening volley into one call
and settles `/task`'s no-change gate with a single `hasWork` boolean.

There is deliberately no comment-scoping verb. `/clean` runs entirely as an agent
pass and reads the branch diff itself: which comments are worth touching is a
judgment about the surrounding code, and a pre-filtered list of comment lines
narrows what the agent looks at right where the wider context is what the call
depends on. `/clean`'s scope stays in its prompt.

`worktree begin` covers both ways a run acquires a workspace, and they are not
interchangeable. Without `--existing` it creates a branch — the `/task` default.
With `--existing` it checks an existing branch out, which is what `/fb --target`,
`/review`, `/revive`, and `/merge-deps` need: they apply work *onto* a branch that
already has commits on it. Creating where you meant to check out silently abandons
that work, so the verb refuses an existing branch unless `--existing` says so, and
refuses `--base` alongside it (a branch that exists already has a base).

## Guards

These are the reason the plumbing is worth centralizing — each one encodes a
failure a workflow run has actually hit:

- `commit` refuses the default branch, and refuses `.` / `-A` / `--all`-style
  whole-tree staging. Paths are always explicit, so carryover files from a dirty
  checkout or a shared worktree stay put.
- `worktree end` refuses to remove a worktree whose HEAD isn't on `origin`, unless
  `--force`. Unpushed work is not discarded by accident.
- `worktree begin` refuses an existing branch unless `--existing` is given, so a run
  that meant to check out someone's pushed work can never start a fresh branch over
  the top of it.
- `pr` only ever moves a PR *toward* draft — it never silently flips an existing
  draft to ready and puts it in front of reviewers early.
- `verify` returns no log at all for a passing gate and a bounded tail for a
  failing one, so callers stop hand-rolling `2>&1 | tail -12` and stop re-running a
  whole build because they guessed the window too small.

## Device-wide resolution

A command or skill must reach the toolkit no matter how MyCommand was installed. Four
roots are tried in order, first hit wins:

1. `$MY_COMMAND_TOOLKIT` — explicit override (development, testing).
2. `$CLAUDE_PLUGIN_ROOT/src/toolkit` — set by Claude Code when a plugin command
   runs, so a plugin install needs no separate step.
3. `${CLAUDE_CONFIG_DIR:-$HOME/.claude}/my-command/toolkit` — the device install
   the npx wizard writes, which is what personal-copy commands use.
4. `${CODEX_HOME:-$HOME/.codex}/my-command/toolkit` — the device install written
   with Codex Skills, which is what native `$skill` workflows use.

The order lives in exactly three places, each cross-referenced by comment:
`src/toolkit/bin/my-command-tools` (the shim), `src/toolkit/lib/paths.mjs` (what
`doctor` reports), and `installToolkit()` in `src/my-command.ts` (what writes root
3 and 4). Changing one means changing all three.

## Reachable by name

Resolution answers "where is the toolkit"; it does not answer "can a command call
it". A command spells the call as a bare `my-command-tools` and declares it as
`allowed-tools: Bash(my-command-tools:*)`, so the shim has to be **on PATH** —
a fixed device path alone is invisible to a command. Absolute-path invocation is not
the workaround: it fails to match that permission rule, trading a missing command for
a prompt on every call.

So every install that places the shim also links it onto PATH, at
`<user bin dir>/my-command-tools` → `<device root>/bin/my-command-tools`:

- The link targets the **fixed shim path**, never one install's payload, so it keeps
  working when a later install replaces the toolkit underneath it.
- The directory is the first of `~/.local/bin`, `~/bin` **already on the user's
  PATH**. Both are user-owned, so linking needs no elevation.
- **No shell profile is ever edited.** Linking into a directory the user already has
  on PATH takes effect in the next shell with nothing to undo, where rewriting
  dotfiles guesses at the shell and leaves a mess behind. When neither candidate is on
  PATH, the installer prints the `export PATH=…` line instead of writing it.
- A real file already under that name belongs to something else and is left alone; a
  symlink is repointed, so a re-run is idempotent.

The failure this closes was silent: with the shim installed but unlinked, a command
found no `my-command-tools`, reported it as "not installed", and fell back to
hand-rolled `git`/`gh` — losing every guard above while still looking like it worked.
`doctor`'s `onPath` is what makes that state visible, reporting whether a bare call
resolves, whether it resolves to *this* install's shim, and the exact link command
when it doesn't.

## Shipping constraint

**The toolkit ships as raw `.mjs` under `src/toolkit/`, never as build output.**
A plugin install is a git clone with no build step, and `dist/` is gitignored — so
anything requiring compilation simply does not exist in plugin mode. Raw `.mjs` is
the only payload that reaches all four install paths:

| Install path | How the toolkit arrives |
|---|---|
| `claude plugin install` | in the clone; found via `$CLAUDE_PLUGIN_ROOT` |
| `npx github:llevasseur/my-command` | `installToolkit()` copies it to the selected Claude or Codex device root |
| `scripts/install-personal.sh` | symlinks the checkout, so `git pull` updates it |
| `scripts/install-marketplace-personal.sh` | same wizard path |
| `npm i -g @llevasseur/my-command` | the `my-command-tools` bin runs `src/toolkit/cli.mjs` from the installed package |

The npm bin points at `cli.mjs` directly rather than at the shim: an npm-installed
package is self-contained, so it should run *its own* toolkit, where the shim would
hand off to whichever copy the device roots resolve to.

Type safety is not given up for this: `tsconfig.toolkit.json` typechecks the `.mjs`
with `allowJs` + `checkJs` + `noEmit`, run as `pnpm run check:toolkit`.

## Invariants

- **New verb ⇒ registered.** Every `src/toolkit/verbs/*.mjs` appears in `cli.mjs`'s
  `VERBS` registry, or it can never be invoked. Enforced by `check-commands.sh`.
- **The shim stays executable.** `src/toolkit/bin/my-command-tools` is what lands on
  PATH; a lost mode bit fails only at call time. Enforced by `check-commands.sh`.
- **All install modes place the toolkit.** `src/my-command.ts` calls
  `installToolkit()` for the Claude plugin, personal-command, and Codex Skills
  paths, so no workflow ships without its tooling. Enforced by
  `check-commands.sh`.
- **Placing it implies linking it.** `installToolkit()` calls `linkOnPath()`, so the
  shim it just placed is callable by name. Dropping the call reinstates the silent
  fallback above. Enforced by `check-commands.sh`.
- **Zero dependencies, Node 22+.** Stdlib only — the toolkit runs from a bare clone
  with nothing installed. Tests use the built-in `node --test` runner.
- **JSON out, exit code carries the verdict.** 0 success, 1 a failed gate or refused
  guard, 2 a usage error. A `pass: false` result exits 1. Usage errors are a distinct
  `UsageError` class precisely so that 2 is reachable — a missing required flag is the
  caller's mistake, not a verdict about the repo.

## Acceptance criteria

- [ ] `my-command-tools doctor` resolves from all four roots, reporting which won.
- [ ] `doctor` reports `onPath.reachable`, and on a device with no link reports
      `reachable: false` with the exact `ln -s` fix rather than looking healthy.
- [ ] Every verb returns parseable JSON on stdout and nothing else, on both its success
      and its failure path. (`--help` output is prose, by design.)
- [ ] `commit` refuses the default branch and refuses whole-tree staging.
- [ ] `worktree begin --existing` checks a branch out at its own tip; without the flag an
      existing branch is refused.
- [ ] `worktree end` refuses a worktree with unpushed commits absent `--force`.
- [ ] `pnpm run check:toolkit` and `pnpm test` pass in CI.
- [ ] A fresh `npx` install lands a runnable shim on the device root **and** leaves a
      bare `my-command-tools` call working in a new shell.

## Related

- Spec: [Install wizard](install-wizard.md) — the wizard that installs it
- Spec: [Adding a command](adding-a-command.md)
