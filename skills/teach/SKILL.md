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

## How this workflow writes

Every word the run emits is ASD-STE100 Simplified Technical English
(https://asd-ste100.org) — the step 1 field clause, each step 3 question, the
step 4 sentence, the step 7 `notes` and `tips`, and the closing turn. A workflow
that hands over plain vocabulary in dense prose contradicts its own deliverable.

- **One word, one meaning, one part of speech.** A word doing two jobs in one
  sentence is two sentences.
- **One term per concept**, reused — never a synonym for variety.
- **Active voice; imperative for an instruction.** The passive drops the actor,
  and the actor is usually the claim.
- **Simple tenses only.** No perfect and no progressive forms.
- **No gerund or participle standing in for a noun.** "It springs back", not
  "the springing back".
- **One instruction per sentence**, and 20 words for an instruction, 25 for a
  description.
- **Six sentences per paragraph at most**, and one topic in each.
- **Keep the articles.** "Press the button", not "press button".
- **No idiom, no metaphor, no slang.** Write the literal thing.
- **A vertical list for a set of conditions**, never one sentence stacking three
  clauses with "and" and "or".

**The taught term is the only hard word allowed anywhere in the run.** Never
define jargon with harder jargon, and never reach for a longer word where the
closed-dictionary one carries the same meaning.

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

One sentence to the STE rules above, plus three that belong to the sentence
alone:

- **Simple present tense**, not any other simple tense.
- **25 words maximum**, counted before you print it.
- **The taught term is the only hard word in it.** It is the payload; every word
  around it is ordinary English.

The `truncate` and `docs` workflows draw their vocabulary rules from the same
standard and deliberately drop three of them — the word caps, the tense
restriction, and the closed dictionary — because those serve a human reader with
a limited vocabulary in the subject. That reader is exactly who this workflow
writes for, so here they apply. The two are not in conflict; they have different
readers.

## 5. Point at public skills

**Always run the skill-discovery workflow when it is available. The run does not
reach the closing turn without it.** Look for public skills that already encode
this field, so the user can inherit someone else's tuning instead of relearning
the field one term at a time. List what it finds, or say plainly that nothing
public covers it. **Never install anything.**

**Step 2 already having named the term is not a reason to skip this**, and
neither is a field that feels too narrow, too obvious, or too well understood to
search. The two steps answer different questions: step 2 asks what this concept
is called, this step asks who has already written the whole field down. A run
that fell through to your own knowledge is the run that most needs the search,
because falling through is what "nothing installed covers this field" means. The
only skip is the discovery workflow not being available, and then say so in the
reply.

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
  term, what the questions settled, what the concept is *not*. Written to the
  voice rules below.
- `tips` (array of strings) — short practical pointers the run produced: how to
  use the term, what it is confused with, what to say instead.
- `sources` (array of strings) — what you consulted: URLs, specification names,
  skill names, repository paths under `--here`. An entry that starts with `http`
  or `https` is rendered as a link.
- `surfacedSkills` (array of strings) — the skills step 5 **discovered**, as
  against the `skills` this run applied. Never the skill-discovery workflow.

### How the Research reads

The reading side renders `notes` under the heading **Research**, and its reader is
a person months from now deciding whether they already know this. Write it the way
the practitioner who owns the field writes a note to themselves. Every rule below
is a positive instruction, and the test for all of them is that nobody reading it
can tell whether the practitioner or the run wrote it.

- **Report the finding, never the run that found it.** "Material Design calls the
  dimmed layer behind a modal a scrim." Not "I searched for the term and
  discovered that…". Cut every trace of the process: no `I`, no `we`, no "let's",
  no step numbers, no tool or workflow names, no account of what you tried first.
- **Every sentence states a claim a reader could check**, and what backs it is
  already in `sources`. A sentence that states no claim gets deleted, not
  shortened.
- **Name what the concept is not.** The near-miss term the questions ruled out is
  the half of the research the reader cannot rebuild alone — name that term and
  say what made it lose.
- **Never restate the term or the sentence.** Both sit above this field on the
  same page, so a note that opens by defining the term has spent its first line on
  nothing.
- **Commit to one answer.** No "it is worth noting", no "while X, Y is also true",
  no paragraph that presents two views and picks neither. Where two terms are
  genuinely live, say which one to use and in which case.
- **Write it flat.** No headings, no `Overview` / `Summary` / `Conclusion` label,
  no bold word opening every line, and no closing sentence that restates the
  paragraph that just ended.
- **Drop the flourish.** No "not just X — it is Y", no three-item rhetorical
  build, no rhetorical question, no exclamation, and no word that exists to sound
  authoritative rather than to carry meaning.
- **Three to six sentences.** Longer means the run is explaining the field instead
  of recording what it found. Nothing found means omit the field.

`tips` carry the same voice, one pointer per line, each a thing to do or a thing
to say instead.

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
session state that a compaction carries forward and this prompt is not. Resolve it in the same tool-call turn as the run's last piece of real work,
so the list is already clean when that turn returns and the only thing left
to do is speak. Never leave marking it as a call of its own after the work
ends: a run whose last scheduled action is a bookkeeping tool call ends on
that call — the mark lands every time, and the message meant to follow it
never arrives. A
compaction boundary is a checkpoint, not an ending — a recap prompt, a
background-task notification, or a session-continuation preamble each mean the
run is still owed its turn, so answer in text alone, say where the run stands,
and restore the todo item if it did not survive. Each side of a boundary
records its own standing, because a run split across two transcripts is two
runs to the record. Every message from the
user opens a task in the same transcript, and only a reply carrying text
and no tool call closes it, so answer a mid-run question, correction, or
recap in text before returning to tool calls. A reply to another session is
not that turn either: SendMessage is a tool call, so send the reply, let it
return, then close in text alone.

## Notes

- **The sentence is the product.** Reaching it in fewer questions is good.
  Reaching something longer, hedged, or more precise than the user can repeat
  from memory is a failed run.
- A sentence the user cannot say back is no shorter than the handwave they
  arrived with, and the run bought them nothing.
- Never ask for detail an implementer would need. The user is learning what to
  ask for, not writing a specification.
