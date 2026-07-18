---
type: spec
title: Adding a command
description: The checklist an agent follows to add a MyCommand slash command so the suite, the install wizard, and the docs stay in sync.
tags: [process, commands, wizard]
timestamp: 2026-07-15
---

# Adding a command

## Summary

Every MyCommand command is a Markdown instruction file an agent follows when the
command is invoked — not code. This spec is the authoritative checklist for
adding a new command so the bare source, the generated plugin, the install
wizard, and the docs never drift apart. Agents adding a command (for example via
`/task`) should read this first.

## A command is agent instructions

`src/commands/<name>.md` is a prompt: frontmatter (`description`, optional
`argument-hint`, `allowed-tools`) plus an imperative body. Match the shape of the
existing commands:

- a `## Flags` section when the command parses leading flags off `$ARGUMENTS`,
- numbered `## Steps` for the procedure,
- a `## Notes` section for guardrails (what never to do).

Bare is canonical: sibling commands are referenced bare (`/clean`, `/pr`); the
build step namespaces them for the published plugin.

## Checklist

1. **Author the bare source** — create `src/commands/<name>.md`.
2. **Regenerate the plugin** — run `./scripts/build-plugin.sh`; it writes
   `commands/<name>.md` with `/my-command:` prefixes. Never hand-edit `commands/`.
3. **Write a feature doc** — add `docs/features/<name>.md`
   (`okq --bundle docs new feature "<name>"`). Fill Summary, Flags / Parameters,
   Behavior, Related. **A command without a feature doc is incomplete.**
4. **Confirm wizard inclusion** — the wizard (`bin/my-command.mjs`) lists
   `src/commands/*.md`, so a new bare source is picked up automatically for both
   install modes and the overwrite prompt. Verify it appears. See the
   [Install wizard](install-wizard.md) spec.
5. **README + CHANGELOG** — add the command to both README tables (What's inside,
   Use cases) and add a CHANGELOG `### Added` entry.
6. **Verify** — `build-plugin.sh` runs clean, `okq --bundle docs validate` passes,
   and the wizard listing includes the command.

## Keeping docs in sync

**Whenever a command's flags or parameters change, update its feature doc in the
same change.** The feature doc's Flags / Parameters section is the contract for
that command; a drifted doc is worse than none. If a flag is added or renamed,
also update the command's README Use cases row.

## Acceptance criteria

- [ ] New command has a bare source, a generated namespaced copy, and a feature doc.
- [ ] Wizard listing and overwrite prompt include the command.
- [ ] README and CHANGELOG mention the command.
- [ ] Any flag/param change is reflected in the matching feature doc.

## Related

- Spec: [Install wizard](install-wizard.md)
- ADR: [0002 Command docs as okq specs](../adrs/0002-command-docs-as-okq-specs.md)
- All command specs live in `features/` — list them with
  `okq --bundle docs find --type feature`.
