---
type: research
title: Claude and Codex support patterns
description: Research notes for adding Codex Skills support to the MyCommand install wizard.
tags: [research, claude, codex, skills]
timestamp: 2026-07-19
---

# Claude and Codex support patterns

**Date:** 2026-07-19
**Relevance:** Decide how the MyCommand wizard should install the existing Claude command bundle for Codex without duplicating the canonical workflows.
**Depth:** surface

## Summary

The common interoperability pattern is one focused Markdown workflow packaged as an
Agent Skill, with small installation adapters for each agent. Claude Code accepts a
`SKILL.md` inside `~/.claude/skills/<name>/`, while current Codex documentation uses
`SKILL.md` directories and user-scoped `~/.agents/skills/`; older Codex tooling also
documents `$CODEX_HOME/skills` and its `~/.codex/skills` fallback. Codex requires
`name` and `description` metadata, so MyCommand should generate a Codex-facing copy
from each canonical command rather than copy a flat Claude command file unchanged.
The wizard should keep Claude's existing plugin and personal-command modes intact and
add an explicit Codex Skills mode with a safe overwrite prompt.

## Key findings

- Claude Code skills are directories whose required file is `SKILL.md`; personal
  skills live under `~/.claude/skills/<skill-name>/SKILL.md`. Existing
  `.claude/commands/` files continue to work, but a same-named skill takes
  precedence. [1]
- Codex skills are also directories containing `SKILL.md`, with required `name` and
  `description` metadata. Codex supports explicit `$` skill invocation and implicit
  matching from the description. [2]
- Current Codex user-scoped discovery is `~/.agents/skills`; repository skills use
  `.agents/skills`. The Codex documentation also says to prefer plugins for reusable
  distribution, but direct skill folders are appropriate for local authoring and
  personal setup. [2]
- The OpenAI Codex skill-creator sample still describes `$CODEX_HOME/skills` and
  `~/.codex/skills` as a default personal location, so a destination override is
  useful for older installations and for tests. [3]
- A representative multi-agent skills repository exposes separate install adapters
  while copying the same skill folders to `~/.claude/skills/` or `~/.codex/skills/`.
  That supports a shared-workflow-plus-adapter design rather than maintaining two
  independent copies of every workflow. [4]

## Implementation implications

1. Keep `src/commands/*.md` as the canonical source for Claude and the generated
   plugin copy.
2. Add a wizard mode that writes each command to
   `<codex-skills-dir>/<command>/SKILL.md`.
3. Generate Codex frontmatter with `name` and the existing `description`, omitting
   Claude-only `argument-hint` and `allowed-tools` keys. Keep the Markdown body
   shared so workflow changes do not drift between agents.
4. Default to `~/.agents/skills` for current Codex, while honoring
   `CODEX_SKILLS_DIR` and `CODEX_HOME` for alternate/legacy locations.
5. Treat an existing `SKILL.md` as a conflict and reuse the existing checkbox
   overwrite behavior; non-interactive installs must remain non-destructive.

## Open questions / gaps

- Codex's current documentation recommends plugins for broad distribution. This
  repository's requested scope is the local install wizard, so a Codex plugin is
  out of scope for this change.
- The existing command bodies contain Claude-oriented slash-command wording and
  tool names. The wizard can make them discoverable as Codex skills, but a future
  compatibility pass may want agent-neutral wording or Codex-specific adaptations.

## Sources

1. [Extend Claude with skills](https://code.claude.com/docs/en/slash-commands) — Claude Code documentation, accessed 2026-07-19.
2. [Build skills](https://developers.openai.com/codex/skills) — OpenAI Codex documentation, accessed 2026-07-19.
3. [Codex skill-creator sample](https://github.com/openai/codex/blob/main/codex-rs/skills/src/assets/samples/skill-creator/SKILL.md) — OpenAI Codex repository, accessed 2026-07-19.
4. [alirezarezvani/claude-skills](https://github.com/alirezarezvani/claude-skills) — representative multi-agent skills repository, accessed 2026-07-19.
