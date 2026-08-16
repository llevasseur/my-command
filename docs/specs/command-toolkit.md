---
type: spec
title: Command toolkit
description: The device-wide `my-command-tools` CLI that commands call for the deterministic git/gh plumbing of a workflow run, and how it ships with every install mode.
tags: [process, toolkit, install, cli]
timestamp: 2026-07-25
updated: 2026-08-02
---

# Command toolkit

## Summary

Workflow commands such as `/task`, `/pr`, `/fb`, `/god`, and `/revive` repeatedly
derive the same git state. The zero-dependency Node CLI `my-command-tools` owns
that deterministic work: state, repository gates, explicit-path commits, PRs,
and worktrees. Every verb returns **JSON on stdout**.

Judgment stays with the agent. The toolkit never decides whether a comment is
noise, what a PR description should say, or whether a failure is worth fixing.

## Verbs

| Verb | Answers |
|------|---------|
| `state` | branch, base, commits, tracked vs untracked changes, `hasWork` |
| `scope` | what a branch changed: the ref to diff, its commits, its files, and with `--diff` the hunks themselves |
| `verify` | which of the repo's gates ran and passed; bounded output only on failure |
| `commit` | stage an explicit path list and commit, with guards |
| `pr` | push, then create or update the branch's PR |
| `prs view\|list\|checks` | read-only pull-request lookups; never writes |
| `worktree begin\|end\|reap\|list` | the isolated-workspace lifecycle, and which worktrees have outlived their branch |
| `identity` | which GitHub account this checkout's remote wants, and `--select` to switch to it |
| `stash write\|restore\|list` | `/cp`'s five-deep clipboard ring under `~/.claude`, and the clipboard sink |
| `doctor` | where the toolkit resolved from, what's on PATH, and which clone it tracks |

`state` collapses the rev-parse / status / log / diff opening volley into one call
and settles `/task`'s no-change gate with a single `hasWork` boolean.

`scope`, `prs`, `identity`, and `doctor.checkout` exist for a second reason beyond
call count: a probe with a name is never composed as the shell shape that gets
refused. `scope` replaces `$(git merge-base origin/main HEAD)`, `prs` replaces
`gh pr list … | jq …`, `identity` replaces
`GH_TOKEN="$(gh auth token --user <login>)" …`, and `doctor.checkout` replaces the
nest of three command substitutions `/sync` used to derive its clone path with. See
[Workflow gates](workflow-gates.md).

`stash` is the same move made for a shape no flag could fix. `/cp` step 3 prescribed
its five-deep ring rotation as a `for i in 3 2 1` loop composing `$((i + 1))` paths.
Every path in it was under `~/.claude`, so the snippet carried no git operation and no
repo-relative write — and it was refused every run regardless, because a
worktree-isolated session cannot resolve a loop-computed path by reading it and `/cp`
is usually invoked from inside a worktree. **The fix is the name, not the paths**: an
inline snippet is a different string every time and can never be allowlisted, while
`Bash(my-command-tools:*)` already is, so the rotation became a verb that a gate reads
in one token. It takes the entry as `--content-file <path>` for the reason
`commit --message-file` does, keeps the ring under `$CLAUDE_CONFIG_DIR` (or
`~/.claude`) and nowhere else, and owns the platform detection — the stash is written
everywhere, only the clipboard sink varies. A slot holding nothing is reported rather
than copied, since clearing the clipboard is worse than leaving it.

The same reasoning gives `commit` and `pr` their file forms. `--message-file <path>`
and `--body-file <path>` are what the usage strings advertise, because the multi-line
alternative is a heredoc and a heredoc composing a file is refused wholesale inside a
worktree — the shape those two verbs are called from most. The file pairs with the
tool that refusal already names: write the prose to a path, pass the path. `--message -`
and `--body -` still read stdin for a real pipeline; they are simply no longer the
advertised route, since every recorded use of them spent a refused call first.

`scope --diff` returns that branch's diff **content** in the same call, split into
`diff.committed` and `diff.workingTree` and annotated per line — `<sign><line number>\t<text>`,
the number being the line's own file. That closes the loop the verb previously left open:
`scope` handed back `files`, and the caller then went and diffed, once per path. There is
nothing left to fetch, so the per-path loop has no remaining excuse. Output is capped by
`--diff-limit` (200,000 characters by default) and a file past the cap is named in
`diff.omitted` rather than cut in half, since a truncated hunk reads as a complete one.

There is deliberately no comment-scoping verb. `/clean` needs the surrounding
branch diff to judge comments; pre-filtering would remove that context.

`worktree begin` creates a branch by default (`/task`) or, with `--existing`,
checks one out (`/fb --target`, `/review`, `/revive`, `/merge-deps`). It refuses
an existing branch without that flag and refuses `--base` with it, preventing a
fresh branch from abandoning existing commits.

`worktree list` reports each worktree as `root`, `path`, `branch`, `head`, and
`reclaimable` — the last being `true` when that branch is already an ancestor of
`origin/<default-branch>`, so removing the worktree loses nothing. Nothing previously
answered that question, and the manual alternative is a `git merge-base --is-ancestor`
per worktree. The comparison ref is reported once as `comparedWith`, and `reclaimable`
is `null` rather than `false` wherever it could not be judged — a detached worktree,
which has no branch whose merge could be read, a branch ref git can no longer resolve,
and every entry when `origin/<default>` is absent locally. Only git's exit 1 counts as a
real "not merged"; any other exit is a failure to judge. That distinction is the point
of the tri-state: `false` everywhere
would read as "all live work" when the truth is "fetch first". The default branch is
always `false`, never `true`, even though it is trivially its own ancestor — reporting
it reclaimable would contradict the guard that refuses to target it.

The verb stays **offline**: it reads the remote-tracking ref already on disk rather than
fetching, so `list` remains a cheap local lookup and its answer is as fresh as the last
fetch (`begin` fetches). There is deliberately **no size field**. `du` overstates a
worktree severalfold on APFS because pnpm clones package files from its store rather
than copying them — a measured install producing a 197 MB tree cost 0 MB of real disk —
so apparent size measures the store, not what removing the worktree would return. The
reclaim signal is the merged branch.

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
- `commit` retries **once** on an unapproved signing prompt. The failed attempt wrote
  nothing, so re-issuing the same commit is the entire fix — and it is a fix nobody has
  to recall. Never a rewrite, never `--no-gpg-sign`, never a config change.
- `pr` resolves a `must be a collaborator` rejection itself: the same write under a
  token belonging to the repository owner, then over REST, whose endpoints accept the
  credential GraphQL refused. It reports the `identity` that worked. A wrong-identity
  condition with one known answer is not a caller's problem.
- `identity` answers the same question for the `gh` calls that are not `pr` — a
  `gh pr edit` appending to a description, a `gh api` write. It reads the owner off the
  remote rather than guessing a login, and `--select` runs the one plain
  `gh auth switch --user <owner>`. This device is logged in as two accounts, so the
  pick is per repository and it is not a judgment call.
- `prs` has no write path at all, so a read-only lookup can never be the thing that
  changes a PR.

## Device-wide resolution

A command or skill must reach the toolkit no matter how MyCommand was installed.
Roots are tried in order, first hit wins:

1. `$MY_COMMAND_TOOLKIT` — explicit override (development, testing).
2. `$CLAUDE_PLUGIN_ROOT/src/toolkit` — set by Claude Code when a plugin command
   runs, so a plugin install needs no separate step.
3. `<shim dir>/../toolkit` — the payload beside the shim itself. Shim-only: it is
   what lets an install under a relocated `CLAUDE_CONFIG_DIR`/`CODEX_HOME` run
   *its own* toolkit rather than falling through to another root's copy.
4. `${CLAUDE_CONFIG_DIR:-$HOME/.claude}/my-command/toolkit` — the device install
   the npx wizard writes, which is what personal-copy commands use.
5. `${CODEX_HOME:-$HOME/.codex}/my-command/toolkit` — the device install written
   with Codex Skills, which is what native `$skill` workflows use.

Root 3 is resolvable only from the shim's own location, so `paths.mjs` — and
therefore `doctor` — knows the four location-independent roots. The order lives in
exactly three places, each cross-referenced by comment:
`src/toolkit/bin/my-command-tools` (the shim), `src/toolkit/lib/paths.mjs` (what
`doctor` reports), and `installToolkit()` in `src/my-command.ts` (what writes roots
4 and 5). Changing one means changing all three.

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

Without the link, commands silently fell back to unguarded hand-written
`git`/`gh`. `doctor.onPath` reports whether the bare call resolves to this
install's shim and gives the exact link command when it does not.

## Shipping constraint

**The toolkit ships as raw `.mjs` under `src/toolkit/`, never as build output.**
A plugin install is a git clone with no build step, and `dist/` is gitignored — so
anything requiring compilation simply does not exist in plugin mode. Raw `.mjs` is
the only payload that reaches every supported install path:

| Install path | How the toolkit arrives |
|---|---|
| `claude plugin install` | in the clone; found via `$CLAUDE_PLUGIN_ROOT` |
| `npx github:llevasseur/my-command` | `installToolkit()` copies it to the selected Claude or Codex device root |
| `scripts/install-personal.sh` | symlinks the checkout, so `git pull` updates it |
| `scripts/install-codex-personal.sh` | symlinks the checkout into the Codex device root, so `git pull` updates it |
| `scripts/install-marketplace-personal.sh` | updates command files only; the initial wizard install supplies the toolkit |
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

- [ ] `my-command-tools doctor` resolves from all four location-independent roots, reporting which won.
- [ ] `doctor` reports `onPath.reachable`, and on a device with no link reports
      `reachable: false` with the exact `ln -s` fix rather than looking healthy.
- [ ] Every verb returns parseable JSON on stdout and nothing else, on both its success
      and its failure path. (`--help` output is prose, by design.)
- [ ] `commit` refuses the default branch and refuses whole-tree staging.
- [ ] `worktree begin --existing` checks a branch out at its own tip; without the flag an
      existing branch is refused.
- [ ] `worktree end` refuses a worktree with unpushed commits absent `--force`.
- [ ] `worktree list` marks a branch already merged into `origin/<default>` as
      `reclaimable: true`, live work as `false`, and the default branch as `false`;
      with no `origin/<default>` on disk it reports `comparedWith: null` and
      `reclaimable: null` rather than claiming nothing is reclaimable, and a branch
      ref git cannot resolve reads `null` rather than `false`.
- [ ] `pnpm run check:toolkit` and `pnpm test` pass in CI.
- [ ] A fresh `npx` install lands a runnable shim on the device root **and** leaves a
      bare `my-command-tools` call working in a new shell.

## Related

- Spec: [Install wizard](install-wizard.md) — the wizard that installs it
- Spec: [Adding a command](adding-a-command.md)
