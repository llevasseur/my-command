# AGENTS.md — MyCommand repo rules

Project-specific rules for agents working in this repo. Device-wide rules live in
`~/.claude/CLAUDE.md`; keep this file repo-specific.

## What this repo is

A bundle of Claude Code slash commands. **A command is agent instructions, not code** —
each is a Markdown file in `src/commands/<name>.md`. The bare source in `src/commands/` is
canonical; `commands/` is a generated namespaced copy the plugin ships. The `npx` install
wizard is `src/my-command.ts` (compiled to `dist/`).

## Adding or changing a command — non-negotiable checklist

Follow **[`docs/specs/adding-a-command.md`](docs/specs/adding-a-command.md)** in full. The
steps that are easy to forget, and what happens if you do:

1. **Regenerate `commands/`** — run `./scripts/build-plugin.sh` after any `src/commands/`
   edit. Never hand-edit `commands/`; it is overwritten.
2. **Write the feature doc** — `docs/features/<name>.md`. A command without one is
   incomplete.
3. **The wizard needs NO manual edit.** `src/my-command.ts` enumerates `src/commands/*.md`
   at runtime (`readdirSync(SRC_DIR)`), so a new command auto-appears in both install modes
   and the overwrite prompt. Do not go looking for a command list to append to — there
   isn't one. Just verify it appears.
4. **README + CHANGELOG** — add the command to both README tables and a CHANGELOG entry.

## The gate that catches a missed step

Run before you commit, and expect it in PR CI:

```bash
pnpm run check:commands   # or ./scripts/check-commands.sh
```

It fails unless: `commands/` is byte-in-sync with `src/commands/`, every command has a
`docs/features/<name>.md` and a generated `commands/<name>.md`, and the wizard still globs
`src/commands/`. This is why the wizard "auto-updates" is safe to rely on — if someone ever
replaces the glob with a hardcoded list, the check fails. The `commands` job in
`.github/workflows/ci-pr.yml` blocks the PR on it.

Docs also validate: `okq --bundle docs validate` (and `okq --bundle docs index` to refresh
the generated `docs/**/index.md` after adding a feature doc).

## Verify before claiming done

- `./scripts/check-commands.sh` — command invariants.
- `pnpm run check` (Biome), `pnpm typecheck`, `pnpm build` — for any `src/my-command.ts`
  change.
- `okq --bundle docs validate` — for any `docs/` change.
