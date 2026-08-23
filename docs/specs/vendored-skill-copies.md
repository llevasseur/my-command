---
type: spec
title: Vendored skill copies
description: Other repositories vendor their own copy of skills/<name>/SKILL.md, so a run there loads the copy rather than this repo's canonical file — how the copy wins, how to tell whether it is stale, and how to resync it.
tags: [process, skills, codex, drift]
timestamp: 2026-08-23
updated: 2026-08-23
dirty: true
---

# Vendored skill copies

## Summary

`skills/<name>/SKILL.md` in this repository is the single source of truth for a
workflow's Codex/agent form. Other repositories **vendor** it: they check in
`<repo>/.agents/skills/<name>/SKILL.md` as a tracked file of their own, and their
`.claude/skills/<name>` is a symlink into `../../.agents/skills/<name>`. A run
inside one of those repositories therefore loads the **vendored** copy, never the
canonical one — and the vendored copy goes stale silently, because nothing points
back here.

Two repositories on this device were found holding a `wayfinder` copy months
behind canonical. Their `SKILL.md` predated `--unattended`, the merge-through
runner routing, and the read-the-default-branch rule entirely. A wayfinder
campaign run in either would have got none of those behaviours, and nothing
anywhere would have reported a problem: the campaign just behaves like an older
version of the workflow.

## Why the copy wins

Claude Code and Codex both resolve a skill by path, not by provenance. Where
`.claude/skills/<name>` is a symlink into `.agents/skills/<name>`, both surfaces
land on the vendored file. There is no lookup that falls through to this
repository, no version stamp inside `SKILL.md`, and no import mechanism — the
copy is a fork the moment it is made.

**This repository's CI cannot see it.** `check-commands.sh` holds
`src/commands/`, `commands/`, `skills/`, and `docs/` in sync *within this
checkout*. A copy living in a different repository is outside every path it
reads, so no invariant here will ever fail because a vendored copy drifted.
Detecting that drift is a manual step, run from the recipe below.

## Check for drift before overwriting

`diff` against canonical. Empty output means the copy is in sync.

```bash
MYCOMMAND="$HOME/Documents/ghub/my-command"   # this repository's checkout

diff -u "<repo>/.agents/skills/wayfinder/SKILL.md" \
        "$MYCOMMAND/skills/wayfinder/SKILL.md"
```

Every skill a given repository vendors, in one pass:

```bash
for d in "<repo>"/.agents/skills/*/; do
  name=$(basename "$d")
  diff -q "$d/SKILL.md" "$MYCOMMAND/skills/$name/SKILL.md" 2>/dev/null \
    || echo "DRIFT: $name"
done
```

To find which repositories vendor anything at all, from wherever you keep
checkouts:

```bash
find "$HOME/Documents/ghub" -maxdepth 5 -path '*/.agents/skills/*/SKILL.md' \
  -not -path "$MYCOMMAND/*"
```

## Resync recipe

Canonical overwrites the copy. There is no merge: this repository is the source
of truth, so a vendored edit is discarded by design — read the `diff` first if
you need to know what you are dropping.

```bash
cp "$MYCOMMAND/skills/wayfinder/SKILL.md" \
   "<repo>/.agents/skills/wayfinder/SKILL.md"
```

Every skill the repository already vendors — it adds nothing new, so a repo that
vendors three skills still vendors three:

```bash
for d in "<repo>"/.agents/skills/*/; do
  name=$(basename "$d")
  [ -f "$MYCOMMAND/skills/$name/SKILL.md" ] \
    && cp "$MYCOMMAND/skills/$name/SKILL.md" "$d/SKILL.md"
done
```

Then, in that repository: confirm the symlink still resolves
(`ls -l <repo>/.claude/skills/<name>`) and commit the refreshed file, since the
vendored copy is a tracked file there.

Deliberately **not** a script here and **not** a `package.json` entry. The paths
belong to the consuming repositories, which this one has no register of; a script
would have to be told them on every run, which is what the recipe already does.

## When to resync

**After any change to `skills/<name>/SKILL.md` that a vendoring repository
depends on.** Resyncing is not part of this repository's checklist for changing a
skill — it happens in the consuming repository, on its own branch — but it is the
step that has to be remembered at the moment the skill changes, because nothing
later will remind anyone.

## Not to be confused with the generated `commands/`

`commands/<name>.md` is generated from `src/commands/<name>.md` by
`scripts/build-plugin.sh` and is never hand-edited; `check-commands.sh` fails if
it is out of sync. A diff between the two is expected namespace prefixing
(`/task` → `/my-command:task`), not staleness. That is already stated in
`AGENTS.md` and in [Adding a command](adding-a-command.md) — it is named here
only so the two kinds of copy are not confused for one another. In-repo generated
copies are gated; cross-repo vendored copies are not.

## Related

- Spec: [Adding a command](adding-a-command.md)
- Spec: [Install wizard](install-wizard.md) — how `~/.agents/skills` is populated
  for the device-wide install, which is a separate path from a repository's own
  vendored `.agents/skills/`.
