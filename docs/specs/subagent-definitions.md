---
type: spec
title: Subagent definitions
description: The five agent definitions in agents/, one per shape of delegation, that every dispatch site names by subagent_type — so a delegate's role is stated once in a file rather than restated in each dispatch prompt.
tags: [process, commands, agents, install]
timestamp: 2026-08-22
---

# Subagent definitions

## Summary

MyCommand dispatches subagents from eight sites across seven commands, and until
now every one of them took the **default agent**. Nothing named a type, so the
role each delegate was supposed to play had to be restated in the dispatch prompt
— once per site, in each site's own words, drifting per site. Measured on the
device this was written on: of 35 spawn records in `logs/sessions`, 30 read
`- agent: general-purpose` and 5 read `- agent: Explore`; no custom agent type
existed anywhere, and `subagent_type` appeared in no command file or shared
snippet.

`agents/` now holds one definition per **shape of delegation**, each declaring a
model, a tool list, and the role in full. Each dispatch site names one with
`subagent_type`. The dispatch prompt then carries **this run's specifics alone**
— the branch, the path, the doc, the idea — rather than a restatement of what the
delegate is.

## What counts as a shape

A definition is written per shape of delegation, **not per command**. Two
commands that delegate the same kind of work share one definition; that sharing is
the point, because it is the restatement across those two sites that used to
drift. Five shapes cover the eight sites:

| Definition | Shape | Dispatched by |
|---|---|---|
| `mycommand-delegate` | Run one whole MyCommand workflow command end to end, on its own branch, in its own worktree | `/work`, `/manage`, `/improve` |
| `mycommand-finisher` | Finish a branch that already carries the work — `/clean` then `/pr`, one shared context, a worktree it does not own | `/task --sub` (and `/god` through it) |
| `mycommand-reviewer` | Review one PR independently and return findings only | `/review` |
| `mycommand-doc-auditor` | Audit one document against the code it describes, or evaluate one for density | `/docs`, `/truncate` |
| `mycommand-griller` | A long-lived read-only adversarial interlocutor, one question per round | `/dev` |

`/god` needs no dispatch site of its own: it always adds `--sub` to the `/task`
invocation it makes, so its finisher dispatch happens inside `/task`, which names
the type.

## What a definition declares

Frontmatter carries `name`, `description`, `tools`, and `model`. Three of those
are decisions rather than boilerplate:

- **`name` must equal the filename.** `subagent_type` resolves the frontmatter
  name, while the installer places the file; a mismatch makes the dispatch name
  one thing and the device carry another.
- **`tools` is a capability boundary, not a hint.** `mycommand-reviewer` ships
  **without `Edit` or `Write`** — "report findings, never apply them" is the rule
  it is under, and omitting the tools is what makes that rule structural instead
  of advisory. `mycommand-griller` and `mycommand-doc-auditor` are read-only for
  the same reason. `mycommand-delegate` takes `"*"`, because it runs a whole
  workflow command whose own file decides what it needs.
- **`model` is a tier, not a model name.** Two tiers exist — **strong** and
  **cheap** — and which one a definition takes follows from the shape of its work.
  The tier is the decision; the model name is what a runtime resolves it to. See
  [Which tier a definition takes](#which-tier-a-definition-takes) below.

## Which tier a definition takes

Three rules decide it, and they are about the work rather than the command:

- **Work that produces a commit takes the strong tier.** The code is the
  deliverable, and everything downstream is built on it.
- **Work that judges someone else's output takes the strong tier.** A review, a
  grill, and a claim-survival check are each worth exactly what the judgement
  behind them is worth.
- **Work that reshapes text under a rule takes the cheap tier.** The rule is
  already written; applying it is inventory rather than judgement.

Applied to the five shapes: `mycommand-delegate` writes the implementation and
`mycommand-reviewer` and `mycommand-griller` judge, so all three take strong.
`mycommand-doc-auditor` inventories claims against source, and `mycommand-finisher`
reshapes comments under `/clean`'s already-written rule and writes a description
from what is on the branch — its commit is that reshaping, not the work — so both
take cheap.

## The tier table

Claude Code's agent frontmatter `model:` holds **exactly one value**, and Codex
reads `agents/` not at all — it has no subagent mechanism to read them with. A
per-runtime file or a generated pair would therefore emit a Codex definition that
no runtime loads: a second thing to keep in sync with zero consumers. So the tier
is the single source of truth, stated once per definition in this table, and each
runtime resolves it:

| Definition | Tier | `model:` | Claude Code | Codex |
|---|---|---|---|---|
| `mycommand-delegate` | strong | `inherit` | opus | `gpt-5.6-sol` |
| `mycommand-reviewer` | strong | `inherit` | opus | `gpt-5.6-sol` |
| `mycommand-griller` | strong | `inherit` | opus | `gpt-5.6-sol` |
| `mycommand-finisher` | cheap | `sonnet` | sonnet | `gpt-5.6-luna` |
| `mycommand-doc-auditor` | cheap | `sonnet` | sonnet | `gpt-5.6-luna` |

The `model:` column is what the frontmatter carries, and **invariant 24 asserts
the two match** — so the table is load-bearing rather than a description of the
files beside it. `inherit` is how the strong tier is spelled on Claude Code: the
parent session already runs opus, so inheriting it costs no declaration and keeps
following the session if that changes.

The Codex column is a mapping, not an install target. `gpt-5.6-sol` and
`gpt-5.6-luna` are the slugs the Codex CLI actually selects (`~/.codex/config.toml`
`model =`); sol is the frontier model and luna the lighter one. Nothing writes
them anywhere today, because Codex has no subagent surface — the column is what a
Codex-side dispatch would resolve the tier to, and what to write if it grows one.

## Overriding a tier at the dispatch site

A definition is written per **shape of delegation**, so one file can serve two
sites whose work sits in different tiers. The `Agent` tool's `model` parameter
takes precedence over frontmatter, which is where that difference belongs — never
a second near-duplicate definition.

`mycommand-doc-auditor` is the case. `/docs` inventories each doc's claims against
the code, which is the cheap tier the definition declares, so its dispatch names
no model. `/truncate` rewrites each doc for density under a bar that every claim
survives, and deciding whether a claim survived a rewrite is judgement — so it
overrides up to the strong tier at `src/commands/truncate.md`. Both sites read the
same file; only the one that departs from the tier says so.

## Where they are installed

A definition that never reaches the device makes a correctly named dispatch behave
exactly like an unnamed one — it falls back to the default agent and says nothing
about it. So all three Claude surfaces place them, each the way it already places
commands:

- **`scripts/install-personal.sh`** symlinks `agents/*.md` into
  `${CLAUDE_AGENTS_DIR:-~/.claude/agents}`, so `git pull` updates them like the
  commands beside them. An existing **real file** of the same name is skipped and
  reported rather than overwritten.
- **The npx wizard** (`src/my-command.ts`, `installAgents()`) **copies** them, on
  both the plugin and personal choices. Copies for the same reason `installHooks()`
  copies: npx runs from an ephemeral cache a symlink would dangle into. An
  existing symlink at the destination is left alone, so a wizard run on a dev
  install does not clobber the checkout link.
- **The plugin install** places nothing itself; `.claude-plugin/plugin.json`
  declares `"agents": "./agents/"` and Claude Code reads them from the plugin.

Codex is deliberately untouched. It has no subagent mechanism, so
`install-codex-personal.sh` and `skills/*/SKILL.md` carry none of this — the same
call `src/my-command.ts` already makes for hooks, and the same conclusion the
support-patterns research reached: subagents are a conditional capability rather
than a universal one.

## The gate

`scripts/check-commands.sh` invariant 20 holds the three parts together, because
any one of them alone is silent when it breaks. It asserts that every
`agents/*.md` declares all four frontmatter fields and a `name` matching its
filename; that every definition is named by at least one command; that each of the
eight dispatching commands still contains a `subagent_type`; that every
`subagent_type` a command names has a file; and that both Claude install surfaces
plus the plugin manifest still place them.

`scripts/check-doc-snippets.mjs` sweeps `agents/` alongside `src/commands` and
`src/shared`, so any fenced shell a definition grows is held to the same shape the
workflow gates accept.
