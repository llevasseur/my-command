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

The common interoperability pattern is one focused workflow with native
instructions for each agent surface. Claude Code accepts a
`SKILL.md` inside `~/.claude/skills/<name>/`, while current Codex documentation uses
`SKILL.md` directories and user-scoped `~/.agents/skills/`; older Codex tooling also
documents `$CODEX_HOME/skills` and its `~/.codex/skills` fallback. Codex requires
`name` and `description` metadata, but the differences go beyond frontmatter:
invocation syntax, worktree paths, subagent tools, transcript sources, and device
capabilities differ. MyCommand therefore needs checked-in Codex-native skills
rather than a mechanical copy of Claude command prose.
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

1. Keep `src/commands/*.md` as the Claude source and generated Claude plugin copy.
2. Keep Codex translations under `skills/<name>/`, including optional scripts,
   references, assets, and tool metadata.
3. Make CI enforce a one-to-one command/skill set so semantic translations cannot
   silently drift or disappear.
4. Default to `~/.agents/skills` for current Codex, while honoring
   `CODEX_SKILLS_DIR` and `CODEX_HOME` for alternate/legacy locations.
5. Treat an existing `SKILL.md` as a conflict and reuse the existing checkbox
   overwrite behavior; non-interactive installs must remain non-destructive.

## Open questions / gaps

- Codex's current documentation recommends plugins for broad distribution. This
  repository's requested scope is the local install wizard, so a Codex plugin is
  out of scope for this change.
- Codex device tools vary by surface and installation. Skill instructions should
  use tools available in the active session and treat Browser, Chrome, Computer
  Use, and subagents as conditional capabilities rather than universal commands.

## Sources

1. [Extend Claude with skills](https://code.claude.com/docs/en/slash-commands) — Claude Code documentation, accessed 2026-07-19.
2. [Build skills](https://developers.openai.com/codex/skills) — OpenAI Codex documentation, accessed 2026-07-19.
3. [Codex skill-creator sample](https://github.com/openai/codex/blob/main/codex-rs/skills/src/assets/samples/skill-creator/SKILL.md) — OpenAI Codex repository, accessed 2026-07-19.
4. [alirezarezvani/claude-skills](https://github.com/alirezarezvani/claude-skills) — representative multi-agent skills repository, accessed 2026-07-19.
