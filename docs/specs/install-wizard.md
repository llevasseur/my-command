---
type: spec
title: Install wizard
description: The npx wizard that installs the command suite as a Claude Code plugin, bare personal commands, or Codex Skills, with per-item overwrite.
tags: [process, wizard, install, codex]
timestamp: 2026-07-15
---

# Install wizard

## Summary

`npx github:llevasseur/my-command` runs the compiled zero-dependency wizard that
installs the command suite one of three ways: a Claude Code plugin, bare personal
commands copied into `~/.claude/commands`, or Codex Skills written as
`<skill>/SKILL.md` folders.

## Behavior

- **Data-driven command list.** The wizard enumerates `src/commands/*.md` at run
  time — there is no hardcoded command list. Dropping a bare source file is the
  only step needed to include a command in all install modes and the overwrite
  prompt.
- **Mode 1 — plugin.** `claude plugin marketplace add` + `plugin install`;
  commands run namespaced (`/my-command:<cmd>`) and auto-update on push.
- **Mode 2 — personal.** Copies each `src/commands/*.md` into `~/.claude/commands`
  as a bare `/<cmd>`.
- **Mode 3 — Codex Skills.** Converts each canonical command into a Codex-compatible
  `<dest>/<cmd>/SKILL.md`, preserving its description and Markdown workflow while
  adding the required `name` metadata and omitting Claude-only frontmatter. The
  default user destination is `~/.agents/skills`; `CODEX_SKILLS_DIR` overrides it,
  and `CODEX_HOME` selects `<CODEX_HOME>/skills` for legacy Codex setups.

## Overwrite behavior

Personal and Codex installs split items into fresh (not yet present) and conflicts
(already in the destination):

- Fresh commands are always copied.
- Conflicts drive an interactive checkbox prompt (`checkboxPrompt`) to select
  which existing files to overwrite. `requireSelection` keeps the prompt open on
  an empty confirm **only when nothing is fresh** — an empty pick would otherwise
  be a pure no-op.
- A non-interactive shell never clobbers: existing files are left untouched and
  reported.

Every command or skill — including any newly added one — must be reachable by its
overwrite prompt.

## Invariants

- **New command ⇒ wizard inclusion.** Because the list is data-driven, adding
  `src/commands/<name>.md` includes the command in all three modes; verify the
  listing and that the relevant overwrite prompts cover it.
- **New command ⇒ feature doc.** See [Adding a command](adding-a-command.md).
- The module stays importable: `checkboxPrompt`, `installPersonal`, and
  `installCodexSkills` are
  exported, and `main()` runs only when the file is invoked directly.

## Acceptance criteria

- [ ] The dynamic listing includes every command in `src/commands/`.
- [ ] Personal install offers an overwrite choice for every pre-existing command.
- [ ] Codex install writes every selected command as `<name>/SKILL.md` with
      `name` and `description` metadata.
- [ ] Plugin and personal modes both enumerate the full suite.
- [ ] Codex mode enumerates the full suite and respects `CODEX_SKILLS_DIR`.
- [ ] Non-interactive install leaves existing commands untouched.

## Related

- Spec: [Adding a command](adding-a-command.md)
- ADR: [0002 Command docs as okq specs](../adrs/0002-command-docs-as-okq-specs.md)
- Command specs live in `features/` — list them with
  `okq --bundle docs find --type feature`.
