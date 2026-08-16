# AGENTS.md — MyCommand repo rules

Project-specific rules for agents working in this repo. Device-wide rules live in
`~/.claude/CLAUDE.md`; keep this file repo-specific.

## What this repo is

A paired bundle of Claude Code slash commands and Codex skills. A workflow is
agent instructions, not code: Claude sources live in `src/commands/<name>.md`
and Codex translations in `skills/<name>/SKILL.md`. `commands/` is the generated
namespaced Claude plugin copy. The `npx` wizard is `src/my-command.ts`.

A rule that belongs to more than one command lives once in `src/shared/<name>.md`
(no frontmatter) and is pulled in with `<!-- include: shared/<name>.md -->` for a
one-line snippet, or `<!-- include-block: shared/<name>.md -->` at column 0 for a
multi-line one. `scripts/expand-includes.mjs` expands both **in place** in
`src/commands/`: inline on the directive's own line so it survives inside a nested
bullet, block between its markers on lines of its own. `build-plugin.sh`
runs the expansion before copying, so no installer changes; `check-commands.sh`
runs it with `--check` first, so a hand-edit between the markers fails CI.
**Edit `src/shared/`, never the text between a directive and its closing marker.**

## Repository map

Read this instead of guessing a path. Every path below is real; nothing else is.

- `src/commands/<name>.md` — the Claude command sources. **`src/commands/shared/` does not
  exist**; shared snippets live one level up in `src/shared/<name>.md`, a flat directory of
  snippet files with no frontmatter and no subdirectories.
- `commands/<name>.md` — generated, namespaced plugin copies. Never hand-edited.
- `skills/<name>/SKILL.md` — the Codex translation of each command, one directory per command.
- `src/my-command.ts` — the `npx` install wizard. `src/toolkit/cli.mjs` is the
  `my-command-tools` CLI, `src/toolkit/verbs/<verb>.mjs` its verbs, and
  `src/toolkit/bin/my-command-tools` the shim that lands on PATH.
- `src/hooks/` — the workflow gates the harness runs: `pre-tool-use.mjs`, `stop.mjs`,
  their shared `lib/`, the `settings-fragment.json` that registers them, and
  `install-hooks.mjs` which merges that fragment into the device `settings.json`.
  Two install surfaces arm them, and the gates do nothing until one of them runs:
  `install-personal.sh` symlinks the directory into the clone so `git pull` updates the
  gates, and the npx wizard's `installHooks()` copies it to the device — a symlink into
  npx's cache directory would dangle the moment the wizard exits. Both then run the same
  merge. `MY_COMMAND_HOOKS=0` silences all of them. See
  [`docs/specs/workflow-gates.md`](docs/specs/workflow-gates.md) — **a gate must fail
  open and must never refuse the same subject twice**, and both properties are gated by
  `check-commands.sh`.
- `agents/<name>.md` — the subagent definitions, one per **shape of delegation** rather than
  one per command, each declaring a model, a tool list, and the role in full. Every dispatch
  site names one with `subagent_type`, so a dispatch prompt carries that run's specifics and
  not a restatement of the role. A definition's frontmatter `name` must match its filename,
  and its `tools` list is a capability boundary — `mycommand-reviewer` ships without `Edit`
  or `Write` on purpose. Three surfaces place them: `install-personal.sh` symlinks them, the
  npx wizard's `installAgents()` copies them on both Claude choices, and
  `.claude-plugin/plugin.json` declares the directory. Codex gets none — it has no subagent
  mechanism. Invariant 20 gates all of it; see
  [`docs/specs/subagent-definitions.md`](docs/specs/subagent-definitions.md).
- `scripts/` — `build-plugin.sh` (regenerates `commands/`), `expand-includes.mjs` (expands
  `src/shared/` snippets in place; `--check` reports drift), `check-commands.sh` (the
  invariant gate), `install-codex-personal.sh`.
- `docs/` — an okq bundle: `docs/features/<name>.md` per command, plus `docs/specs/`.
- Tests sit beside their subject: `scripts/*.test.mjs`, `src/toolkit/**/*.test.mjs`, and
  `src/hooks/**/*.test.mjs`, all run by `pnpm test`. There is no top-level `test/`.

The shared snippets a new command usually needs: `shared/closing-turn-anchor.md` plus
`shared/closing-turn.md` (the outcome contract, required in every command by invariant 6),
`shared/batched-discovery.md` (the batched read-only discovery pass, required in every command
that sweeps files before acting — invariant 8), `shared/merge-command-forms.md` (the working
`gh pr merge` and `git -C <path>` forms, required in every command that merges — invariant 9),
`shared/rewrite-toward.md` (the density vocabulary rules — invariant 7), and
`shared/step-marker.md` (the `STEP <n>/<N>` marker a run writes as it enters each step,
required in every command by invariant 15 — see
[`docs/specs/run-markers.md`](docs/specs/run-markers.md)).

## Adding or changing a command — non-negotiable checklist

Follow **[`docs/specs/adding-a-command.md`](docs/specs/adding-a-command.md)** in full. The
steps that are easy to forget, and what happens if you do:

1. **Regenerate `commands/`** — run `./scripts/build-plugin.sh` after any `src/commands/`
   edit. Never hand-edit `commands/`; it is overwritten.
2. **Maintain the Codex skill** — every `src/commands/<name>.md` needs a
   Codex-native `skills/<name>/SKILL.md`. Translate workflow semantics; do not
   copy Claude-only tool names, invocation syntax, or paths.
3. **Write the feature doc** — `docs/features/<name>.md`. A command without one is
   incomplete.
4. **The wizard needs NO manual list edit.** `src/my-command.ts` enumerates both
   `src/commands/*.md` and `skills/*/SKILL.md`; just verify the workflow appears.
5. **README + CHANGELOG** — add the workflow to both README tables and a CHANGELOG entry.

## The gate that catches a missed step

Run before you commit, and expect it in PR CI:

```bash
pnpm run check:commands   # or ./scripts/check-commands.sh
```

It fails unless: `src/commands/` is in sync with `src/shared/`, `commands/` is
byte-in-sync with `src/commands/`, every command has a
feature doc, generated Claude command, and Codex-native skill, every command carries
the closing-turn anchor and its terminal step (and every skill mirrors both), every
file-sweeping command carries the batched-discovery step, every merging command carries the
merge command forms, every command carries the step marker rules and the closing turn still
states the return marker, and the wizard still globs both source directories. This is why the wizard "auto-updates" is safe to rely
on—if someone replaces a glob with a hardcoded list, the check fails. The `commands` job in
`.github/workflows/ci-pr.yml` blocks the PR on it.

Docs also validate: `okq --bundle docs validate` (and `okq --bundle docs index` to refresh
the generated `docs/**/index.md` after adding a feature doc).

## Verify before claiming done

- `./scripts/check-commands.sh` — command invariants.
- `pnpm run check` (Biome), `pnpm typecheck`, `pnpm build` — for any `src/my-command.ts`
  change.
- `okq --bundle docs validate` — for any `docs/` change.
