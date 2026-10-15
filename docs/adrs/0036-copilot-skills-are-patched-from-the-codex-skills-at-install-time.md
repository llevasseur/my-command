---
type: adr
title: Copilot CLI skills are patched from the Codex skills at install time
description: The GitHub Copilot CLI surface is built from the Codex skills and Claude agent definitions by checked exact-string patches when the wizard runs, rather than kept as a fourth hand-written copy, and it covers only the workflows that need no claude-proxy.
tags: [process, install, copilot, skills, decisions]
timestamp: 2026-10-15
decided-by: /task
ratified: false
needs-human: true
---

# Copilot CLI skills are patched from the Codex skills at install time

## Status

Accepted. **Written by `/task`, not ratified by a human**, under
[ADR 0005](0005-agent-authored-decisions-are-marked-in-frontmatter.md). `needs-human` is set
because several Copilot CLI behaviours the surface depends on are unconfirmed in Copilot's docs.
[The spec](../specs/copilot-surface.md) lists them, with the fallback each one takes.

## Context

Each workflow already exists twice: the Claude command in `src/commands/` and the Codex skill in
`skills/`. The Codex skills are written host-neutrally. They say "spawn the verification agent"
and "ask one focused question", not a tool name. Copilot CLI reads the same `SKILL.md` format
from `~/.copilot/skills`, and it has subagents (`task`, `write_agent`, `read_agent`) and custom
agents with a `tools:` list.

The differences are small but spread out:

- The invocation sigil is `/name`, not `$name`.
- Worktrees go under `.copilot/worktrees/`.
- Agents take Copilot's tool aliases.
- `/task --jev` and `/manage`'s `work` delegates depend on the Claude proxy and the hosted
  ideas ledger.

## Decision

1. **Build, don't copy.** `src/copilot/patch.mjs` builds every Copilot skill from its Codex skill
   and every Copilot agent from its Claude definition when the wizard runs. A skill gets its own
   exact-string patches, then shared substitutions, then the appended host notes.
2. **Every patch is checked.** A patch whose anchor is gone throws, and so does text a skill's
   `forbid` list says must be gone. `check-commands.sh` invariant 28 runs the build in CI. So a
   Codex edit that moves an anchor fails the PR that made it, not a user's install.
3. **Proxy-free workflows only.** The workflows that need the Claude proxy, a hosted store, or a
   Claude transcript are not installed. A reference to one from an installed skill fails the
   build unless a patch removes it.
4. **Install into `~/.copilot/skills`, not `~/.agents/skills`.** Copilot reads both, but the
   second holds the unpatched Codex bodies that Codex and opencode load.
5. **No gates, and no host inferred from the install root.** The worktree verb takes
   `--host copilot`, and the patched skills pass it.

## Why not a fourth hand-maintained copy

A copy per skill would be 18 more files to keep in step by hand. The drift it invites is the
silent kind [the vendored-copy spec](../specs/vendored-skill-copies.md) already describes. Most
Copilot differences are mechanical. The two substantial ones, `/task --jev` and `/manage`'s
ideas delegates, are paragraph cuts with checked anchors. The patch file stays readable because
the host notes carry the tool mapping once, instead of once per skill.

## Why not patch the Claude commands

The Claude commands name Claude tools throughout (`Agent`, `SendMessage`, `Monitor`,
`AskUserQuestion`, `EnterWorktree`) and carry Claude-only gate wording. The Codex skills already
did that translation once. Patching from them leaves less to rewrite.

## Consequences

- A Codex skill edit can break the Copilot build. The CI error names the patch to update.
- The Copilot surface trails Codex only by what a patch deliberately changes.
- `/manage` on Copilot keeps its dependency graph as a markdown wave plan in the todo tool,
  because Copilot's todo list has no dependency links.
- `/verify`'s live-agent loop falls back to a fresh verifier per round where `write_agent`
  cannot reach a completed agent.
