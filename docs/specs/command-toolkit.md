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
`/clean`, `/pr`, `/fb`, `/god`, `/revive`) opens by re-deriving the same git state
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
| `clean-scope` | the comment lines this branch added or modified |
| `doctor` | where the toolkit resolved from, and what's on PATH |

`state` collapses the rev-parse / status / log / diff opening volley into one call
and settles `/task`'s no-change gate with a single `hasWork` boolean. `clean-scope`
is deliberately half a command: extracting *which* comments are in scope is
mechanical, judging them is not.

## Guards

These are the reason the plumbing is worth centralizing — each one encodes a
failure a workflow run has actually hit:

- `commit` refuses the default branch, and refuses `.` / `-A` / `--all`-style
  whole-tree staging. Paths are always explicit, so carryover files from a dirty
  checkout or a shared worktree stay put.
- `worktree end` refuses to remove a worktree whose HEAD isn't on `origin`, unless
  `--force`. Unpushed work is not discarded by accident.
- `pr` only ever moves a PR *toward* draft — it never silently flips an existing
  draft to ready and puts it in front of reviewers early.
- `clean-scope` skips generated and vendored paths, and never offers a lint
  directive (`biome-ignore`, `@ts-expect-error`, `noqa`, a shebang) as a comment to
  clean. Those are load-bearing.
- `verify` returns no log at all for a passing gate and a bounded tail for a
  failing one, so callers stop hand-rolling `2>&1 | tail -12` and stop re-running a
  whole build because they guessed the window too small.

## Device-wide resolution

A command must reach the toolkit no matter how MyCommand was installed. Three
roots are tried in order, first hit wins:

1. `$MY_COMMAND_TOOLKIT` — explicit override (development, testing).
2. `$CLAUDE_PLUGIN_ROOT/src/toolkit` — set by Claude Code when a plugin command
   runs, so a plugin install needs no separate step.
3. `${CLAUDE_CONFIG_DIR:-$HOME/.claude}/my-command/toolkit` — the device install
   the npx wizard writes, which is what personal-copy commands use.

The order lives in exactly three places, each cross-referenced by comment:
`src/toolkit/bin/my-command-tools` (the shim), `src/toolkit/lib/paths.mjs` (what
`doctor` reports), and `installToolkit()` in `src/my-command.ts` (what writes root
3). Changing one means changing all three.

## Shipping constraint

**The toolkit ships as raw `.mjs` under `src/toolkit/`, never as build output.**
A plugin install is a git clone with no build step, and `dist/` is gitignored — so
anything requiring compilation simply does not exist in plugin mode. Raw `.mjs` is
the only payload that reaches all four install paths:

| Install path | How the toolkit arrives |
|---|---|
| `claude plugin install` | in the clone; found via `$CLAUDE_PLUGIN_ROOT` |
| `npx github:llevasseur/my-command` | `installToolkit()` copies it to the device root |
| `scripts/install-personal.sh` | symlinks the checkout, so `git pull` updates it |
| `scripts/install-marketplace-personal.sh` | same wizard path |

Type safety is not given up for this: `tsconfig.toolkit.json` typechecks the `.mjs`
with `allowJs` + `checkJs` + `noEmit`, run as `pnpm run check:toolkit`.

## Invariants

- **New verb ⇒ registered.** Every `src/toolkit/verbs/*.mjs` appears in `cli.mjs`'s
  `VERBS` registry, or it can never be invoked. Enforced by `check-commands.sh`.
- **The shim stays executable.** `src/toolkit/bin/my-command-tools` is what lands on
  PATH; a lost mode bit fails only at call time. Enforced by `check-commands.sh`.
- **Both install modes place the toolkit.** `src/my-command.ts` calls
  `installToolkit()` for the plugin path *and* the personal path, so no install
  leaves commands without their tooling. Enforced by `check-commands.sh`.
- **Zero dependencies, Node 22+.** Stdlib only — the toolkit runs from a bare clone
  with nothing installed. Tests use the built-in `node --test` runner.
- **JSON out, exit code carries the verdict.** 0 success, 1 a failed gate or refused
  guard, 2 a usage error. A `pass: false` result exits 1.

## Acceptance criteria

- [ ] `my-command-tools doctor` resolves from all three roots, reporting which won.
- [ ] Every verb returns parseable JSON on stdout and nothing else.
- [ ] `commit` refuses the default branch and refuses whole-tree staging.
- [ ] `worktree end` refuses a worktree with unpushed commits absent `--force`.
- [ ] `pnpm run check:toolkit` and `pnpm test` pass in CI.
- [ ] A fresh `npx` install lands a runnable shim on the device root.

## Related

- Spec: [Install wizard](install-wizard.md) — the wizard that installs it
- Spec: [Adding a command](adding-a-command.md)
