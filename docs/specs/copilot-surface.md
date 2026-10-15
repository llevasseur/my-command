---
type: spec
title: GitHub Copilot CLI install surface
description: How the workflows that need no claude-proxy install on GitHub Copilot CLI — skills patched from the Codex ones at install time, custom agents ported from the Claude definitions, the toolkit at ~/.copilot/my-command, and no gates.
tags: [process, wizard, install, copilot, skills]
timestamp: 2026-10-15
updated: 2026-10-15
---

# GitHub Copilot CLI install surface

## Summary

Wizard choice 5 installs a subset of the workflows on [GitHub Copilot CLI](https://docs.github.com/en/copilot/how-tos/copilot-cli):
skills in `$COPILOT_HOME/skills/<name>/SKILL.md`, custom agents in
`$COPILOT_HOME/agents/<name>.agent.md`, and the toolkit in `$COPILOT_HOME/my-command`.
`COPILOT_HOME` defaults to `~/.copilot`. Nothing on this surface is hand-maintained: every file
is built from `skills/` and `agents/` by `src/copilot/patch.mjs` when the wizard runs. The
decision and the alternatives it beat are in [ADR 0036](../adrs/0036-copilot-skills-are-patched-from-the-codex-skills-at-install-time.md).

## Scope

**Installed:** `changelog`, `clean`, `cp`, `diagram`, `docs`, `fb`, `god`, `manage`, `mc`,
`merge-deps`, `pr`, `review`, `standup`, `task`, `task-bootstrap`, `ticket`, `truncate`, `verify`.
`COPILOT_SKILLS` in `src/copilot/patch.mjs` is the list.

**Excluded, because they need the Claude proxy, a hosted store, or a Claude transcript:**
`ideate`, `improve`, `judge`, `work`, `revive`, `learn`, `lookup`, `teach`, `warm`, `trim`.

**Not yet ported, though they need none of those:** `sync`, which would have to learn this
surface's install layout. `dev`, which dispatches `mycommand-griller`. `wayfinder`, whose 655
lines are more patch surface than a first version should carry. `ab` and `health`.

Two features inside in-scope workflows are dropped for the same reason. `/task` loses `--jev`,
which is a claude-proxy client. `/manage` loses the `work` and `work:god` delegates and the
`work on` form, which read the hosted ideas ledger.

## The build

`buildCopilot(pkgRoot)` returns every file as a map from a path under `$COPILOT_HOME` to its
content. Each skill goes through three layers, in order:

1. **Its own patches.** A `find` patch replaces one exact string. A `from`/`to` patch replaces
   the span from the first string through the end of the second. A patch whose anchor is
   missing throws `CopilotPatchError`.
2. **Shared substitutions.** `$name` becomes `/name` for an installed skill, and a `$name` naming
   a skill that is not on this host throws. `.codex/worktrees` becomes `.copilot/worktrees`.
   `worktree begin` gains `--host copilot`. `~/.codex` becomes `~/.copilot`. `Codex` becomes
   `Copilot CLI`. `SendMessage` becomes `` `write_agent` ``.
3. **The host notes.** `src/copilot/host-notes.md` is appended to every skill. It maps the
   skills' host-neutral terms to Copilot CLI tools, as the table below lists.

A skill's `forbid` list names text that must be gone after patching, such as `--jev` in `/task`
or `` `work` `` in `/manage`. A `forbid` hit also throws. Reference files under
`skills/<name>/references/` take layer 2 only.

| Workflow term | Copilot CLI |
|---|---|
| Arguments | The text typed after `/<name>` in the same prompt. Copilot substitutes nothing into a skill. |
| Invoke another workflow | Follow that skill's `SKILL.md` from `~/.copilot/skills` inline |
| Spawn a subagent | `task` naming a custom agent |
| Message a live agent | `write_agent`, then `read_agent` |
| A wave of units | One `task` call per unit, all in one turn, in background mode where offered |
| Block on a long command | Foreground `bash` with the longest timeout, then `read_bash` on that same shell |
| Ask the user | `ask_user` |
| Todo list, and `/manage`'s dependency graph | The session's todo tool. The graph is a markdown wave plan there: one `Wave <n>` heading per wave, one checkbox per unit. |
| Scratch directory | `${TMPDIR:-/tmp}/my-command/` |

**Agents.** Each Claude definition's `tools:` line maps to Copilot's aliases: `Bash` to
`execute`, `Read` to `read`, `Edit` and `Write` to `edit`, `Glob` and `Grep` to `search`,
`WebFetch` to `web`, `TodoWrite` to `todo`, and `"*"` stays `["*"]`. A tool with no alias
throws. `Skill` is dropped, and the finisher reads each skill's file instead. `model:` is
removed, so every agent inherits the session's model. The Claude tier names (`sonnet`,
`inherit`) mean nothing to Copilot's model picker, and Copilot falls back to the session model
for a name it cannot honour anyway. The body loses `ExitWorktree` and `SendMessage`, and
`$CLAUDE_JOB_DIR/tmp` becomes `${TMPDIR:-/tmp}/my-command`.

**Gate.** `scripts/check-commands.sh` invariant 28 runs `node scripts/build-copilot.mjs --check`
and confirms that the wizard still offers choice 5 and installs the toolkit for it. So a Codex
skill edit that moves an anchor fails CI, not the user's install. Fix it in
`src/copilot/patch.mjs`. `node scripts/build-copilot.mjs --out <dir>` writes the tree for
reading.

## Toolkit

- `paths.mjs` and the `bin/my-command-tools` shim look in `$COPILOT_HOME/my-command/toolkit`
  last, after the Claude and Codex installs.
- `doctor` recognises that root as a device install. `hooks-status` reports
  `surface: 'copilot'` with `armed: null`, so the arming gate passes on a device whose toolkit
  is only the Copilot copy.
- `worktree begin --host <claude|codex|copilot>` puts the checkout under
  `<.claude|.codex|.copilot>/worktrees/`. `MY_COMMAND_HOST` is the fallback, and Claude is the
  default. The host is stated, never inferred from the install root. The PATH link points at
  whichever install ran last, so the root a verb loaded from says nothing about the session
  calling it.

## No gates

Copilot CLI has a hook engine (`preToolUse`, `agentStop`, and others, configured as JSON under
`~/.copilot/hooks/`). The gates in `src/hooks/` speak Claude Code's hook protocol and parse a
Claude transcript, so this surface installs none, as on Codex. The host notes tell a run that a
rule a gate would enforce still holds as a rule.

## Unconfirmed in Copilot's docs

These were checked against the docs on 2026-10-15. The build relies on none of them without a
fallback.

- **How `/name args` reaches a skill.** Neither page fetched shows an `$ARGUMENTS`
  substitution, and the CLI reference was not read to its end. The host notes say the args
  arrive as the rest of the prompt.
- **`write_agent` to a completed agent.** Issues show it waking an idle agent. Completed is
  undocumented. Fallback: start a fresh agent of the same type each round, and hand it the
  previous round's reply plus a first round's brief.
- **`task` background mode.** It appears only in a bug report. Fallback: issue the wave's
  `task` calls together and wait for all of them.
- **The `task` parameter names and the todo tool's name.** The skills name the tool and the
  agent, not the parameters.
- **Precedence between `~/.copilot/skills` and `~/.agents/skills`** when both hold a skill of
  the same name. On a device with the Codex skills installed by choice 3, both do.

## Acceptance

- [ ] `node scripts/build-copilot.mjs --check` passes, and a moved anchor fails it.
- [ ] Choice 5 writes every `COPILOT_SKILLS` entry and every `COPILOT_AGENTS` entry under
      `$COPILOT_HOME`, and no excluded skill.
- [ ] No installed skill mentions Codex, `.codex/worktrees`, or `SendMessage`. `/task` has no
      `--jev` and `/manage` has no `work` delegate.
- [ ] `worktree begin --host copilot` creates the checkout under `.copilot/worktrees/`.
- [ ] `doctor` run from the Copilot install reports `hooks.surface: 'copilot'` and
      `armed: null`.
