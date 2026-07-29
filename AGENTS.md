# AGENTS.md — MyCommand repo rules

Project-specific rules for agents working in this repo. Device-wide rules live in
`~/.claude/CLAUDE.md`; keep this file repo-specific.

## What this repo is

A paired bundle of Claude Code slash commands and Codex skills. A workflow is
agent instructions, not code: Claude sources live in `src/commands/<name>.md`
and Codex translations in `skills/<name>/SKILL.md`. `commands/` is the generated
namespaced Claude plugin copy. The `npx` wizard is `src/my-command.ts`.

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

It fails unless: `commands/` is byte-in-sync with `src/commands/`, every command has a
feature doc, generated Claude command, and Codex-native skill, and the wizard still
globs both source directories. This is why the wizard "auto-updates" is safe to rely
on—if someone replaces a glob with a hardcoded list, the check fails. The `commands` job in
`.github/workflows/ci-pr.yml` blocks the PR on it.

Docs also validate: `okq --bundle docs validate` (and `okq --bundle docs index` to refresh
the generated `docs/**/index.md` after adding a feature doc).

## Verify before claiming done

- `./scripts/check-commands.sh` — command invariants.
- `pnpm run check` (Biome), `pnpm typecheck`, `pnpm build` — for any `src/my-command.ts`
  change.
- `okq --bundle docs validate` — for any `docs/` change.
