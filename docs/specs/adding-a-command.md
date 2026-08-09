---
type: spec
title: Adding a command
description: The checklist an agent follows to add a MyCommand slash command so the suite, the install wizard, and the docs stay in sync.
tags: [process, commands, wizard]
timestamp: 2026-07-15
updated: 2026-08-09
dirty: true
---

# Adding a command

## Summary

MyCommand commands are Markdown agent instructions, not code. This checklist
keeps bare source, generated plugin, install wizard, and docs aligned.

## A command is agent instructions

`src/commands/<name>.md` is a prompt: frontmatter (`description`, plus
`argument-hint` and `allowed-tools` where they apply) and an imperative body.
Match the shape of the existing commands:

- a `## Flags` section when the command takes leading flags. The input arrives in
  one of two holders. Most commands now read the `<command-args>` block; `clean`,
  `cp`, `mc`, `merge-deps`, and `sync` still read `$ARGUMENTS`. Either way the
  convention is the same — parse leading flags off the front, the remainder is
  free text. Prefer `<command-args>` for a new command. A command that takes no
  input (`trim`) omits both and has no `argument-hint`.
- the procedure as steps — one `## Step N — <title>` heading per step for a
  multi-phase command, or a single numbered `## Steps` list for a short one,
- a closing guardrail section: `## Notes`, or `## Finish` / `## Rules` where the
  command ends on an action.
- the closing turn, as **two** directives rather than one sentence. A run's
  outcome is recorded only from a message carrying text and zero tool calls, so
  every ending — shipped, blocked, or nothing-to-do — owes one final text-only
  turn sent after the last tool call returns.
  - `<!-- include: shared/closing-turn-anchor.md -->`, as its own paragraph
    before the first `## ` heading. It puts the closing turn in the todo list up
    front, which is the only part of the contract that survives a compaction —
    the prompt does not.
  - a terminal `## Close the run in a text-only turn` section (or
    `## Step N — Close the run in a text-only turn` in a numbered pipeline)
    holding `<!-- include-block: shared/closing-turn.md -->`. It has to be a step
    of the command, not a note about it: the rule regressed twice while it lived
    as a tail sentence.

  `check-commands.sh` fails any command missing either directive or the heading,
  and the matching Codex skill MUST state both rules in its own words.
- the step marker, as `<!-- include-block: shared/step-marker.md -->` in its own
  paragraph before the first `## ` heading. It tells the run to open each step
  with `STEP <n>/<N>`, so a recorded run states the step it entered instead of
  leaving that to be inferred from its prose. Every command carries it, including
  one with no `## Step …` headings, so a command that later gains steps is marked
  without an edit. `check-commands.sh` fails a command missing it. See
  [Run markers](run-markers.md).

Bare is canonical: sibling commands are referenced bare (`/clean`, `/pr`); the
build step namespaces them for the published plugin.

## A rule shared by several commands lives in `src/shared/`

Each installed command file is loaded standalone, so there is no runtime include —
shared text must be physically present in every copy. `src/shared/<name>.md` holds
the canonical text (no frontmatter), and a command pulls it in with one of two
directives, chosen by whether the body is one line or many.

**Inline**, for a one-line snippet — the body lands on the directive's own line, so
it keeps whatever bullet prefix and list indentation it was written under:

```markdown
- <!-- include: shared/text-only-turn.md -->
```

**Block**, for a multi-line snippet — the body lands between the markers on its own
lines:

```markdown
<!-- include-block: shared/rewrite-toward.md -->
<!-- /include-block -->
```

A block directive MUST start at column 0, and the expander refuses an indented one:
a multi-line body inserted under a bullet would break out of the list. An inline
directive MUST resolve to a single line, for the same reason — the expander refuses
a multi-line snippet there and names the block form. Re-running either replaces the
body it already owns rather than nesting a copy.

`scripts/expand-includes.mjs` rewrites both **in place** in `src/commands/`.
`build-plugin.sh` expands before copying, so no installer changes;
`check-commands.sh` runs `expand-includes.mjs --check` **before** the build, so a
hand-edit between the markers fails CI instead of being silently repaired.
`scripts/expand-includes.test.mjs` covers the parsing, and `pnpm test` runs it.

Edit `src/shared/`; never the text between the markers. Codex skills do **not** use
the mechanism: they are translations, not copies.

## Checklist

1. **Author the bare source** — create `src/commands/<name>.md`.
2. **Regenerate the plugin** — run `./scripts/build-plugin.sh`; it writes
   `commands/<name>.md` with `/my-command:` prefixes. Never hand-edit `commands/`.
3. **Author the Codex skill** — create `skills/<name>/SKILL.md`. Translate the
   workflow into Codex-native `$skill` composition, `.codex/worktrees`, safe git
   worktree handling, and Codex tools available in the session. Do not merely
   replace frontmatter on the Claude command.
4. **Write a feature doc** — add `docs/features/<name>.md`
   (`okq --bundle docs new feature "<name>"`). Fill Summary, Flags / Parameters,
   Behavior, Related. **A command without a feature doc is incomplete.**
5. **Confirm wizard inclusion** — the wizard (`src/my-command.ts`) enumerates
   Claude sources with `readdirSync(SRC_DIR)` and Codex skills with
   `readdirSync(SKILLS_DIR)`, so both forms are picked up automatically.
   **There is nothing to hand-edit in the wizard** — only verify the command
   appears (`scripts/check-commands.sh` asserts the wizard still globs the
   directory). See the [Install wizard](install-wizard.md) spec.
6. **README + CHANGELOG** — add the command to both README tables (What's inside,
   Use cases) and add a CHANGELOG `### Added` entry.
7. **Verify** — run `pnpm run check:commands` (or `./scripts/check-commands.sh`):
   it fails unless the shared includes are unedited (`expand-includes --check`,
   run before the build), `commands/` is byte-identical to a fresh build, Claude
   commands / Codex skills / feature docs are one-to-one, the wizard still globs
   both source directories and still installs the toolkit on PATH
   ([Command toolkit](command-toolkit.md)), every command carries both
   closing-turn directives plus the heading and every skill mirrors them, every
   command carries `shared/step-marker.md` and the closing turn still states the
   return marker, and the two density paths keep `shared/rewrite-toward.md`. Also
   confirm `okq --bundle docs validate` passes. This check runs in PR CI, so a
   missed step blocks the merge rather than shipping silently.

## Keeping docs in sync

**Whenever a command's flags or parameters change, update its feature doc in the
same change.** The feature doc's Flags / Parameters section is the contract for
that command; a drifted doc is worse than none. If a flag is added or renamed,
also update the command's README Use cases row.

For a stale, missing, or obsolete command doc, [docs](../features/docs.md)
reconciles the bundle against source.

**Any doc you write or change gets `dirty: true` in its frontmatter.** The flag
means the claims are correct but the prose hasn't been evaluated for density
since it changed. [docs](../features/docs.md) consumes the resulting queue in
its final phase; standalone [truncate](../features/truncate.md) does the same
without reconciliation (`okq --bundle docs find --where dirty=true`). A
hand-edit has to set the flag or it silently misses both workflows. Do not bump
`updated` for a truncation: no claim changed. See
[ADR 0004](../adrs/0004-docs-completes-density-pass.md).

## Acceptance criteria

- [ ] New command has a bare source, generated namespaced copy, Codex-native
      skill, and feature doc.
- [ ] Wizard listing and overwrite prompt include the command.
- [ ] README and CHANGELOG mention the command.
- [ ] Any flag/param change is reflected in the matching feature doc.
- [ ] Every doc written or changed carries `dirty: true`.

## Related

- Spec: [Install wizard](install-wizard.md)
- Spec: [Command toolkit](command-toolkit.md)
- ADR: [0002 Command docs as okq specs](../adrs/0002-command-docs-as-okq-specs.md)
- All command specs live in `features/` — list them with
  `okq --bundle docs find --type feature`.
