---
type: spec
title: Commands as skills
description: Whether /task, /work and /wayfinder should become Claude skills with supporting files instead of commands — their size, how often each branch runs, what a move costs each install surface, and the recommendation to keep them as commands and move rare branches into reference files.
tags: [process, commands, skills, install]
timestamp: 2026-10-05
updated: 2026-10-05
---

# Commands as skills

## Summary

**Recommendation: keep `/task`, `/work` and `/wayfinder` as commands.** Do not convert them.
A skill's one structural gain over a command is a directory that holds supporting files the
model reads only when it needs them. Commands get the same gain from
[reference files](#reference-files-give-commands-the-same-gain), and that costs one install path
instead of a rebuilt install pipeline. The next step is to move the rarely used branches named
below into reference files, one command per change.

This is an evaluation. Nothing here converts a command.

## What a skill would buy

A Claude Code command loads its whole body when it runs. A skill loads in three tiers: its
`description` is always in context, its `SKILL.md` body loads when it runs, and files beside it
load only when the body tells the model to read them. For these three commands only that third
tier matters. Their bodies already load only when invoked, so the saving is whatever text a
typical run does not need.

A skill also costs something that a command does not. The `description` sits in every session's
context, and the model may invoke the skill on its own when a request matches it. `/task` and
`/work` commit and push, and `/wayfinder --unattended` merges. A skill that runs itself has to be
held back with frontmatter that stops model invocation. That frontmatter may also stop the
`Skill` tool calls that `/god`, `/fb`, `/wayfinder` and `/manage` use to nest `/task`, so a
conversion has to show that the nesting still works before it ships.

## Size

Word counts of `src/commands/<name>.md` as built, include blocks expanded. About 1,400 to 1,600
words of each command are the shared closing-turn block, the step marker and the batched
discovery pass, which a skill would carry too.

| Command | Lines | Words | Codex `SKILL.md` words | Largest sections (words) |
|---|---|---|---|---|
| `/task` | 365 | 9,692 | 3,224 | Step 4 close 1,471; Step 1 1,056; Step 3 921; batched discovery 909; `--jev` pass 655 + complexity triage 297 |
| `/work` | 355 | 10,017 | 4,078 | close 1,589; ideas hooks 688; Notes 678; Flags 673; claim 567; Step 5 583 |
| `/wayfinder` | 439 | 10,002 | 6,646 | close 1,391; Notes 1,024; kickoff prompt 748; execute 711; start 628; merge forms 529 |

For scale, the first reference-file move took 187 words out of `/teach`, 367 out of
`/wayfinder` and 154 out of `/fb`.

## How often each branch runs

Source: the Claude Code transcripts on one device (`~/.claude/projects`, 15 project directories),
counted from `<command-args>` and from `Skill` tool calls that name the command, on 2026-10-05.
Subagent runs count when their transcripts are on disk. One device is a sample rather than a
census, so read the ratios as an order of magnitude.

| Command | Runs | Branch | Runs carrying it |
|---|---|---|---|
| `/task` | 190 | `--here` | 76 |
| | | `--worktree` | 49 |
| | | `--add` (Step 0) | 41 |
| | | `--sub` | 40 |
| | | `--base` | 39 |
| | | `--draft` | 35 |
| | | `--no-implement` | 5 |
| | | `--no-verify` | 4 |
| | | `--jev` (the record-only pass and the Step 2.5 complexity triage) | 0 |
| `/wayfinder` | 15 | `--unattended` | 14 |
| | | `--integration` | 1 |
| `/work` | 0 | — | — |
| `/fb` (for comparison) | 105 | `--target` / `-t` | 8 |

Three readings follow from the counts:

- **`/task`'s `--jev` text is the largest unused branch.** About 950 words load on every run, and
  no run on this device carried the flag. It is the best next candidate for a reference file.
- **`/wayfinder`'s unattended path is the common path.** 14 of 15 runs carried `--unattended`, so
  the merge-command forms and the generated kickoff closing must stay in the body. Only the
  *reasons* behind the flag were rare enough to move.
- **`/work` has no recorded runs here.** Its stop paths (an unresolved slug, an unknown area:
  about 450 words) are candidates by shape. Count them on a device that runs `/work` before
  moving anything.

## What a conversion would cost each install surface

| Surface | Today | As a skill | Cost |
|---|---|---|---|
| Source layout | `src/commands/<name>.md`, includes expanded in place | `src/skills/<name>/SKILL.md` plus supporting files | `expand-includes.mjs`, `build-plugin.sh` and most of `check-commands.sh`'s invariants glob `src/commands/*.md`. Each needs a second source directory or a rewrite. |
| `install-personal.sh` | Symlinks each file into `~/.claude/commands/` | Symlinks each directory into `~/.claude/skills/` | Small: one more loop. |
| npx wizard, personal choice | Copies each file into `~/.claude/commands/` | Copies each directory into `~/.claude/skills/` | Small, but `installPersonal()` and its overwrite prompt are per file. |
| npx wizard and marketplace, plugin choice | `commands/` at the plugin root, namespaced by `build-plugin.sh` | A plugin skills directory | **Large.** The repo root `skills/` already holds the Codex translations, which is the path a plugin reads skills from. A conversion has to move the Codex tree or point the manifest elsewhere, and check whether the plugin loads those translations as Claude skills today. |
| Codex (`install-codex-personal.sh`, wizard choice 3) | Already a skill directory | Unchanged | None. Supporting files already work there. |
| opencode commands (wizard choice 4) | A stub command that names the skill | Unchanged | None. |
| Tooling that cites the command file | The judge's `clean.md` and `task.md` line citations, the clean prefilter, `src/manifest.json`'s prose facts, `docs/features/<name>.md` | New paths | Medium. Each citation set has had to be re-derived after earlier prose cuts to `task.md`, and a move re-derives all of them at once. |
| Callers | `/god`, `/fb`, `/wayfinder`, `/manage`, `/dev`, `/work` invoke `/task` by name | Same name, if the skill keeps it | Low, unless the model-invocation guard blocks the `Skill` calls. |

## Reference files give commands the same gain

`/teach`, `/wayfinder` and `/fb` moved their rare branches into reference files the command reads
on demand. Each command keeps one line that says when to read its file:

- **Claude, every surface.** The file is in `src/references/<command>.md` and lands at
  `~/.claude/my-command/references/<command>.md`. `install-personal.sh` symlinks the directory,
  and the npx wizard copies it on both Claude choices next to the toolkit. That is the same
  device root the commands already use to find `my-command-tools`, so a plugin install and a bare
  install resolve one path. The files cannot sit in `~/.claude/commands/<command>/`, because
  Claude Code would register each one as a namespaced command of its own.
- **Codex and opencode.** The file sits in the skill's own `references/` directory, and
  `SKILL.md` points at it relatively. `install-codex-personal.sh` links the whole skill
  directory, and the wizard copies the directory, including `references/` for opencode.
- **Gated.** `build-plugin.sh` refuses to build a command whose pointer names a missing file.
  `scripts/reference-pointers.test.mjs` checks that every pointer resolves, that no reference
  file is orphaned, and that the built pointer passes `scripts/lint-commands.mjs`.

The limit is the same one the toolkit has. A plugin installed with `claude plugin install` and no
wizard run gets no `~/.claude/my-command/`, so its pointers name a file that is not there. The
commands already need the toolkit from the same root, so this adds no new failure, but a pointer
must only ever guard text a run can do without.

## Recommendation

1. **Keep all three as commands.** The plugin-surface collision with the Codex `skills/` tree,
   and the risk of a command that commits or merges invoking itself, cost more than the
   one-directory gain.
2. **Move `/task`'s `--jev` record-only pass and Step 2.5 complexity triage into
   `src/references/task.md`**, keeping the two `acts: false` site names and the
   "nothing acts on an answer" rule in the body. This is about 950 words off every run.
3. **Count `/work` on a device that runs it** before moving its stop paths.
4. **Leave `/wayfinder`'s unattended merge path in the body.** It is the common case.
5. **Revisit only if** Claude Code lets a command own a supporting-file directory, or if the
   plugin can declare a skills path apart from the repo root `skills/`.

## Related

- [Install wizard](install-wizard.md)
- [Adding a command](adding-a-command.md)
- [Vendored skill copies](vendored-skill-copies.md)
