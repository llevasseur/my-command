---
name: teach
description: Learn the real name for something you can only describe, then leave with one Simplified Technical English sentence you can say back to any agent.
---

# Teach me the word for this

The user can describe something but cannot name it, so every prompt they write
about it lands next to the thing they meant. This workflow ends with **one
sentence the user can say back** — the concept reduced to its root, in words
plain enough that nobody has to look anything up. That sentence is the whole
deliverable.

The arguments are the user's description, however vague. Parse leading flags off
the front; the rest is the description.

**Teach, never build.** No implementation, and never invoke another workflow on
the user's behalf. The user leaves with vocabulary.

## Flags

- `--here` / `-h` — read the current repository so the sentence can name real
  components, files, and existing patterns. **The default reads nothing**, so
  this workflow runs from any directory, including one with no repository.

## 1. Place the field

Decide which field the description belongs to — domain modeling, UI motion,
visual design, a business term, a workflow, something else. Say which field you
picked in one clause, so a wrong guess is correctable before the questions start.

## 2. Name it, glossaries first

Take the first source that covers the field:

1. **An installed skill for that field.** A reverse-lookup glossary of motion and
   UI terms answers "the bouncy thing when a popover opens" directly. A domain
   modeling skill owns ubiquitous language. Design skills carry interaction
   vocabulary.
2. **The repository**, under `--here` only — a codebase's own name for a thing
   beats the general one, and its agent instructions or docs may already fix the
   vocabulary.
3. **Your own knowledge**, when no skill covers the field.

Ambiguity between two terms is not a failure: carry both into step 3 and let the
first question settle it. **Never invent a term to sound authoritative** — an
invented term is worse than the user's own words, because it survives into every
later prompt and the agent builds against it. If nothing is recognizable, say so
and treat the user's description as the vocabulary.

**Keep track of what you load and what you read.** The skills you actually load
here are the run's *applied* skills, recorded in step 7 as `skills`. What you
consulted to reach them — the page you read, the specification you cited, the
repository path under `--here` — is the run's `sources`.

## 3. Ask toward the root

**One question per turn, never more**, each with your recommended answer.

Ask only when the answer changes **which concept this is** or **how the user
would ask for it**. Every other question is noise.

Each question strips a layer rather than adding detail. The run moves from the
handwave toward the root, so a question that adds a parameter, an edge case, or
an implementation choice is the wrong question — those belong to whoever builds
it.

**Stop as soon as the user can say the sentence back.** Not at a fixed count, and
not when the user signs off: the moment the remaining ambiguity no longer changes
the sentence, stop asking and write it.

## 4. Write the sentence

One sentence, in ASD-STE100 Simplified Technical English (https://asd-ste100.org):

- **One word, one meaning, one part of speech.**
- **One term per concept**, reused — never a synonym for variety.
- **Active voice.** The passive drops the actor, and the actor is usually the claim.
- **Simple present tense.** No perfect or progressive forms.
- **No gerund as a noun.** "It springs back", not "the springing back".
- **25 words maximum.**
- **The term being taught is the only hard word in the sentence.** It is the
  payload; every word around it is ordinary English. Never define jargon with
  harder jargon.

The `truncate` and `docs` workflows draw their vocabulary rules from the same
standard and deliberately drop the last four — the length cap, the tense
restriction, and the closed dictionary — because those serve a human reader with
a limited vocabulary in the subject. That reader is exactly who this workflow
writes for, so here they apply. The two are not in conflict; they have different
readers.

## 5. Point at public skills

Use the skill-discovery workflow to find public skills that already encode this
field, so the user can inherit someone else's tuning instead of relearning the
field one term at a time. List what it finds, or say plainly that nothing public
covers it. **Never install anything.**

**Keep the names it surfaces.** Step 7 records them as `surfacedSkills` — the
skills this run *discovered*, as against the `skills` it applied. A `shadcn/ui`
concept that turns up `radix-primitives` and `tailwind-tokens` surfaced both and
applied neither. A later turn that uncovers more skills adds to the same list.

**The skill-discovery workflow itself is never one of them, and never belongs in
`skills`.** It is a meta-skill about finding skills, not a skill this concept
applied — recording it says the concept is about skill discovery, which no
concept taught here is.

## 6. Print it and copy it

Print the sentence in the reply **and** put it on the clipboard, in one shell
call, heredoc-quoted so nothing expands:

```bash
pbcopy <<'TEACHEOF'
<the sentence>
TEACHEOF
```

Use `wl-copy`, `xclip -selection clipboard`, or `clip.exe` where `pbcopy` does
not exist. With no clipboard sink, print the sentence and say the copy was
skipped.

**The clipboard gets the bare sentence** — no workflow name, no quotes, no
surrounding prose. The user pastes it into a prompt they are already writing.

## 7. Offer to save

Ask whether to save the concept. On yes, append one JSON object to
`concepts.jsonl` in claude-proxy's log directory.

Resolve the path the way the `improve` workflow does: read `CLAUDE_PROXY_STORE`
from the environment, then take its parent as the log directory, because the
store is `<logDir>/sessions`. **Never hardcode a path, and never search the
filesystem for a claude-proxy checkout.**

**Unlike `improve`, an unresolvable store is not fatal here.** That workflow
cannot run without the proxy because the suggestions are its input; this one's
input is the user. So when `CLAUDE_PROXY_STORE` is unset or its path is missing,
keep the sentence, keep the clipboard, skip only the save, and say what failed
and that the concept was not recorded. Never stop the run over it.

### The record

One JSON object per line. Five fields are **required** and always written:

- `term` (string) — the term step 2 landed on.
- `sentence` (string) — the step 4 sentence, exactly as printed and copied.
- `field` (string) — the field step 1 placed it in.
- `skills` (array of strings) — the skills this run **applied**, the ones step 2
  loaded. Never the skill-discovery workflow.
- `savedAt` (string) — ISO timestamp of the append.

Four more are **optional**, and the reading side renders each one it finds:

- `notes` (string, Markdown) — the research the run did: which source named the
  term, what the questions settled, what the concept is *not*.
- `tips` (array of strings) — short practical pointers the run produced: how to
  use the term, what it is confused with, what to say instead.
- `sources` (array of strings) — what you consulted: URLs, specification names,
  skill names, repository paths under `--here`. An entry that starts with `http`
  or `https` is rendered as a link.
- `surfacedSkills` (array of strings) — the skills step 5 **discovered**, as
  against the `skills` this run applied. Never the skill-discovery workflow.

**Omit an optional field entirely when there is nothing to record.** Never write
an empty string or an empty array for one: the reading side distinguishes absent
from empty, and an absent field is what makes it show its "nothing more to show"
fallback. Records written before these fields existed carry none of them and stay
valid — nothing in `concepts.jsonl` is ever rewritten or migrated.

Append with Node and pass every value as an argument, so no shell quoting or JSON
escaping can corrupt a sentence containing quotes, backslashes, or newlines.
Lists are **newline-separated**, one entry per line, because a tip or a note
reliably contains a comma and never contains a newline:

```bash
node -e '
const fs = require("fs");
const [f, term, sentence, field, skills, notes, tips, sources, surfaced] = process.argv.slice(1);
const list = (v) => (v ? v.split("\n").map((s) => s.trim()).filter(Boolean) : []);
const rec = { term, sentence, field, skills: list(skills), savedAt: new Date().toISOString() };
const put = (k, v) => { if (typeof v === "string" ? v.trim() : v.length) rec[k] = v; };
put("notes", notes ?? "");
put("tips", list(tips));
put("sources", list(sources));
put("surfacedSkills", list(surfaced));
fs.appendFileSync(f, JSON.stringify(rec) + "\n");
' "<logDir>/concepts.jsonl" "<term>" "<sentence>" "<field>" "<applied skills, one per line>" \
  "<notes as Markdown>" "<tips, one per line>" "<sources, one per line>" "<surfaced skills, one per line>"
```

`put` is what enforces the omit rule: an empty string and an empty list both fall
through and the key is never written. Pass an empty string for anything the run
did not produce; do not drop the argument, or the values after it shift.

The file is append-only, one object per line, so a concurrent run cannot truncate
another's record.

**Why a file and not the database.** claude-proxy's SQLite database is a
disposable materialized view over its logs, and deleting and re-ingesting it is a
supported recovery. Nothing authored may live only there. The precedent for
authored data that stays queryable is the command-run table, whose source of
truth is a `.jsonl` file and whose table is rebuilt from it under a watermark.
`concepts.jsonl` follows that precedent; a table ingested from it is a separate
change in the claude-proxy repository, and this file is the contract between them.

## Closing turn

Two or three lines: the term, the field, and whether the concept was saved. Never
reprint the sentence — it is already in the reply and on the clipboard.

Close the run in a text-only turn: one final message carrying text and zero tool
calls, sent after the last tool call returns rather than alongside it. A run's
outcome is recorded only from a message with no tool call in it, so ending on one
— or bundling the report into one — records no outcome at all. Every ending owes
that turn, including one that stops early, is blocked or refused, or hands work
back to an invoking workflow.

Anchor that turn before the first tool call: put "close the run in a text-only
turn" in the todo list as its own final item, because the todo list is live
session state that a compaction carries forward and this prompt is not. A
compaction boundary is a checkpoint, not an ending — a recap prompt, a
background-task notification, or a session-continuation preamble each mean the
run is still owed its turn, so answer in text alone, say where the run stands,
and restore the todo item if it did not survive.

## Notes

- **The sentence is the product.** Reaching it in fewer questions is good.
  Reaching something longer, hedged, or more precise than the user can repeat
  from memory is a failed run.
- A sentence the user cannot say back is no shorter than the handwave they
  arrived with, and the run bought them nothing.
- Never ask for detail an implementer would need. The user is learning what to
  ask for, not writing a specification.
