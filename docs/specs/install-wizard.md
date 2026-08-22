---
type: spec
title: Install wizard
description: The npx wizard that installs the command suite as a Claude Code plugin, bare personal commands, or Codex Skills, with per-item overwrite.
tags: [process, wizard, install, codex]
timestamp: 2026-07-28
updated: 2026-08-09
---

# Install wizard

## Summary

`npx github:llevasseur/my-command` runs `dist/my-command.js` (compiled from
`src/my-command.ts` by the `prepare` script), a zero-dependency wizard that
installs the suite as a Claude Code plugin, bare Claude commands, or Codex-native
skills. Every mode also installs the shared [command toolkit](command-toolkit.md)
in that product's device config root and links it onto PATH when possible.

## Behavior

- **Data-driven workflow lists.** The wizard enumerates `src/commands/*.md` for
  Claude and `skills/*/SKILL.md` for Codex—there are no hardcoded lists.
- **Mode 1 — plugin.** `claude plugin marketplace add` + `plugin install`;
  commands run namespaced (`/my-command:<cmd>`) and auto-update on push.
- **Mode 2 — personal.** Copies each `src/commands/*.md` into `~/.claude/commands`
  as a bare `/<cmd>`.
- **Mode 3 — Codex Skills.** Copies each complete Codex-native
  `skills/<cmd>/` directory to `<dest>/<cmd>/`, including `SKILL.md` and any
  supporting scripts, references, assets, or tool metadata. The
  default user destination is `~/.agents/skills`; `CODEX_SKILLS_DIR` overrides it,
  and `CODEX_HOME` selects `<CODEX_HOME>/skills` for legacy Codex setups.
- **Claude modes also install the skills for opencode.** `installOpencodeSkills()` copies
  each `skills/<name>/SKILL.md` to `~/.agents/skills/<name>/SKILL.md`. opencode discovers
  skills from `~/.agents/skills` and `~/.claude/skills` for **every** model it drives, not
  only the Anthropic ones, so that copy is what carries these workflows to a GPT or Gemini
  session — and installing Claude commands says nothing about which model the user then
  points at them. The destination is fixed rather than env-overridable: opencode reads that
  path and nowhere else, so `CODEX_SKILLS_DIR` and `CODEX_HOME` move the Codex install
  without moving this one. It **copies** for the reason `installHooks()` does, and skips a
  skill directory that is already a symlink into a checkout (what
  `scripts/install-codex-personal.sh` leaves behind) rather than writing through it. Mode 3
  runs the step only when its own destination is somewhere else — on the default
  `~/.agents/skills` it has just written that directory through the overwrite prompt, and a
  second unconditional copy would undo the answer the user gave. A failure is reported, not
  fatal.
- **All modes install the toolkit.** `installToolkit()` copies `src/toolkit/` to
  the product's device root—`${CLAUDE_CONFIG_DIR:-$HOME/.claude}/my-command` for
  Claude or `${CODEX_HOME:-$HOME/.codex}/my-command` for Codex—places the executable
  shim at `<root>/bin/my-command-tools`, and writes a `VERSION` stamp. Plugin mode
  gets it too: a plugin command normally resolves via `$CLAUDE_PLUGIN_ROOT`, but the
  device copy keeps the tooling reachable from bare Claude commands, Codex skills,
  and manual shell use.
- **Claude modes also arm the workflow gates.** `installHooks()` copies `src/hooks/` to
  `<root>/hooks` and then calls the shipped `install-hooks.mjs` to merge the registration
  into `<config dir>/settings.json`. Both halves are required — the harness runs only what
  `settings.json` registers, so scripts alone are files nobody executes. It **copies** where
  `scripts/install-personal.sh` symlinks, because npx runs from an ephemeral cache directory
  that is cleaned up when the wizard exits; the same link would dangle and every gate would
  silently disappear. `hooks.test.mjs` is skipped (tests belong to CI, the same rule
  `installToolkit()` applies), the `.mjs` hook scripts keep their executable bit, a hooks
  directory that is already a symlink into a checkout is registered but never written
  through, and the directory is never removed — it can hold a hook the user registered
  independently. A failure is reported, not fatal: the commands work without the gates.
  See [workflow gates](workflow-gates.md#install-and-off-switch).
- **Codex mode deliberately installs no gates.** Codex has a hook engine, but it is opt-in
  behind a `[features]` flag in `~/.codex/config.toml`, configured as TOML rather than
  `settings.json`, and its `PreToolUse` fires for the shell tool alone — never for the
  Read/Edit/Write calls two of these gates judge. The scripts also speak Claude Code's hook
  protocol and parse a Claude transcript. Installing them here would either write Claude
  settings from a Codex install or leave a directory nothing executes.
- **And put it on PATH.** `linkOnPath()` links that shim into the first of
  `~/.local/bin`, `~/bin` already on PATH, because commands call it by bare name —
  see [command toolkit](command-toolkit.md#reachable-by-name). It never edits a shell
  profile: with neither candidate on PATH it prints the `ln -s` and `export PATH=…`
  lines and says plainly that commands cannot reach the CLI yet. Re-running is
  idempotent, and a non-symlink already under that name is left untouched.

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

- **New command ⇒ wizard inclusion.** Add both `src/commands/<name>.md` and
  `skills/<name>/SKILL.md`; the data-driven lists include each native form.
- **New command ⇒ feature doc.** See [Adding a command](adding-a-command.md).
- The module stays importable: `checkboxPrompt`, `installPersonal`,
  `installCodexSkills`, `installOpencodeSkills`, `installToolkit`, `installHooks`, and
  `linkOnPath` are exported, and `main()` runs only when the file is invoked directly.
- **No Claude install without the opencode copy.** Both Claude modes call
  `installOpencodeSkills()` unconditionally; dropping it from either leaves the workflows
  reachable by Anthropic models alone, and an opencode session finds nothing to report as
  missing. Enforced by `check-commands.sh` (invariant 25), which also holds the copy — not a
  symlink — and the fixed destination in place.
- **No Claude install without the gates.** Both Claude modes call `installHooks()`;
  dropping it from either ships the commands with the gates inert on that surface, which
  is the failure the gates' own spec records. Enforced by `check-commands.sh` (invariant
  12), which also holds the copy — not a symlink — and the reported off switch and
  uninstall path in place.
- **No install without tooling.** All modes call `installToolkit()`; dropping the
  call from either would ship commands whose toolkit calls fail at run time.
  Enforced by `check-commands.sh`.
- **No tooling without PATH.** `installToolkit()` calls `linkOnPath()`; a shim that is
  installed but unlinked reads to a command as "not installed". Enforced by
  `check-commands.sh`.

## Acceptance criteria

- [ ] The dynamic listing includes every command in `src/commands/`.
- [ ] Personal install offers an overwrite choice for every pre-existing command.
- [ ] Codex install preserves every selected native skill directory.
- [ ] Plugin and personal modes both enumerate the full suite.
- [ ] Codex mode enumerates the full suite and respects `CODEX_SKILLS_DIR`.
- [ ] Non-interactive install leaves existing commands untouched.
- [ ] All modes leave a runnable `my-command-tools` at the appropriate device root.
- [ ] All modes leave it callable as a bare `my-command-tools` in a new shell, or say
      why not and how to fix it.
- [ ] A second run reports the existing PATH link rather than duplicating or breaking it.
- [ ] Both Claude modes leave every shipped skill at `~/.agents/skills/<name>/SKILL.md`,
      so an opencode session on any model lists the same workflows.
- [ ] The opencode step leaves a skill directory symlinked into a checkout untouched.
- [ ] Codex mode on the default destination runs the opencode step no second time, so a
      skill the user declined to overwrite stays as it was.
- [ ] Both Claude modes leave `my-command-tools doctor` reporting `hooks.armed: true`.
- [ ] The hook scripts land executable, without the tests, and a second run does not
      stack a duplicate registration or a duplicate allowlist entry.
- [ ] A hooks failure is reported and the command install still succeeds.
- [ ] Codex mode writes no `hooks` directory and touches no Claude `settings.json`.

## Related

- Spec: [Adding a command](adding-a-command.md)
- Spec: [Command toolkit](command-toolkit.md)
- Feature: [sync](../features/sync.md) — updates an already-installed device.
- `scripts/install-codex-personal.sh` provides the git-synced Codex device install.
- ADR: [0002 Command docs as okq specs](../adrs/0002-command-docs-as-okq-specs.md)
- Command specs live in `features/` — list them with
  `okq --bundle docs find --type feature`.
