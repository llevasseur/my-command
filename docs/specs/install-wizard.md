---
type: spec
title: Install wizard
description: The npx wizard that installs the command suite as a Claude Code plugin or as bare personal commands, with per-command overwrite.
tags: [process, wizard, install]
timestamp: 2026-07-15
---

# Install wizard

## Summary

`npx github:llevasseur/my-command` runs `bin/my-command.mjs`, a zero-dependency
wizard that installs the command suite one of two ways: a Claude Code plugin or
bare personal commands copied into `~/.claude/commands`.

## Behavior

- **Data-driven command list.** The wizard enumerates `src/commands/*.md` at run
  time — there is no hardcoded command list. Dropping a bare source file is the
  only step needed to include a command in both install modes and the overwrite
  prompt.
- **Mode 1 — plugin.** `claude plugin marketplace add` + `plugin install`;
  commands run namespaced (`/my-command:<cmd>`) and auto-update on push.
- **Mode 2 — personal.** Copies each `src/commands/*.md` into `~/.claude/commands`
  as a bare `/<cmd>`.

## Overwrite behavior

Personal install splits commands into fresh (not yet present) and conflicts
(already in the destination):

- Fresh commands are always copied.
- Conflicts drive an interactive checkbox prompt (`checkboxPrompt`) to select
  which existing files to overwrite. `requireSelection` keeps the prompt open on
  an empty confirm **only when nothing is fresh** — an empty pick would otherwise
  be a pure no-op.
- A non-interactive shell never clobbers: existing files are left untouched and
  reported.

Every command — including any newly added one — must be reachable by this
overwrite prompt.

## Invariants

- **New command ⇒ wizard inclusion.** Because the list is data-driven, adding
  `src/commands/<name>.md` includes the command; verify the listing and that the
  overwrite prompt covers it.
- **New command ⇒ feature doc.** See [Adding a command](adding-a-command.md).
- The module stays importable: `checkboxPrompt` and `installPersonal` are
  exported, and `main()` runs only when the file is invoked directly.

## Acceptance criteria

- [ ] The dynamic listing includes every command in `src/commands/`.
- [ ] Personal install offers an overwrite choice for every pre-existing command.
- [ ] Plugin and personal modes both enumerate the full suite.
- [ ] Non-interactive install leaves existing commands untouched.

## Related

- Spec: [Adding a command](adding-a-command.md)
- ADR: [0002 Command docs as okq specs](../adrs/0002-command-docs-as-okq-specs.md)
- Command specs live in `features/` — list them with
  `okq --bundle docs find --type feature`.
