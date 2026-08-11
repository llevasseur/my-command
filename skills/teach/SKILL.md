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

## 1.5 Check the corpus before you name anything

**Run the lookup workflow on the description, with the field step 1 just placed
it in.** The corpus already holds every term this workflow has ever settled, and
until this step existed nothing read it back — so a run derived a term whether or
not one was already stored. This step **replaces that unconditional
re-derivation**, and it belongs here, before the naming step: after step 2 the
term is already invented and the duplicate already exists.

The gate has three outcomes, and each decides what the rest of the run does:

- **An exact term hit** — the concept is already taught. Print the stored
  sentence **word for word**, copy it as step 6 does, say when it was saved, and
  **stop the run there**. Never derive it again, never improve it, and never save
  a second version. Two wordings for one concept is what the one-term-per-concept
  rule forbids, and deriving a stored sentence again is how it happens.
- **A field hit with no term hit** — carry the neighbours into step 2 as a
  **naming source, not as an answer**. None of them is the term.
- **A miss** — the corpus holds nothing for this. A miss is the only outcome that
  allows the rest of this run.

**An unreachable store is a miss with a stated cause, not a stop.** An unset
variable, an error status, or a network failure each cost the check and nothing
else, on the same terms step 7 sets for the save side. The run carries on to step
2 and states in one line why the corpus was not read — an unread corpus is where
a duplicate term comes from, so the cause is the reader's only warning.

The lookup workflow writes nothing, so nothing here changes what step 7 saves.

## 2. Name it, glossaries first

Take the first source that covers the field:

0. **The neighbours step 1.5 returned**, when it reported a field hit. A stored
   concept in the same field is what an installed skill for that field is trying
   to approximate, so read them first — for the vocabulary the corpus already
   uses, never as a term to adopt whole.
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

Ask whether to save the concept. On yes, POST one JSON object to the hosted
concept store — a Cloudflare Worker, not a file on this machine. A concept
taught on one device is then readable from every other one.

The write goes through one toolkit verb, `my-command-tools concepts save`. Never
hand-roll a `node -e` block or a `curl` against the store: the verb is what the
`my-command-tools` allowlist covers, so it runs without an approval round-trip.

Both halves of the address come from the environment, and the verb reads them
itself. `IDEAS_URL` and `IDEAS_TOKEN` are read first; `CONCEPTS_URL` and
`CONCEPTS_TOKEN` are the documented fallbacks, because ideas and concepts are one
dataset behind one Worker.

- **`CONCEPTS_URL`** — the base URL of the Worker. The write path is
  `POST <CONCEPTS_URL>/api/concepts`.
- **`CONCEPTS_TOKEN`** — the bearer token, sent as an
  `Authorization: Bearer <token>` header.

**Never hardcode either value, never write either one into a file, and never put
the token on a command line or in a URL.** The verb reads both from the process
environment inside its own process, so the token stays out of the command, the
transcript, and the shell history. Do not echo it, and do not print it back in
the reply.

**The write is idempotent, and the retry belongs inside the call.** A row id is
derived from the record itself, so the store returns **201** when the concept is
new and **200** when the identical record is replayed. The verb retries
once on a network error or a `5xx`, reusing the same record. **Never re-run the
whole command to retry a failed save.** Every run stamps a fresh `savedAt`, which
changes the record, which changes the derived id — so a second run writes a
*second version* of the concept instead of replaying the first. Idempotency
protects a repeated request, not a repeated run.

**An unreachable store is not fatal.** The `improve` workflow cannot run without
the proxy because the suggestions are its input; this one's input is the user.
Step 6 already printed the sentence and copied it, and that stands whatever this
step does. So when `CONCEPTS_URL` or `CONCEPTS_TOKEN` is unset, or the POST
fails, keep the sentence, keep the clipboard, skip only the save, and never stop
the run over it.

**Say why the save failed, in one short line.** The old behaviour skipped the
save silently, which turned a broken store into quiet loss. One line, in the
reply, naming the cause:

- A variable is unset → name which one, and say the concept was not saved.
- The store answered with an error → give the status code and the short reason it
  returned.
- The request never reached the store → give the network error.

Never expand this into a paragraph, and never ask the user to fix it mid-run.

### The record

One JSON object per request — the whole record is the POST body. Five fields are
**required** and always written:

- `term` (string) — the term step 2 landed on.
- `sentence` (string) — the step 4 sentence, exactly as printed and copied.
- `field` (string) — the field step 1 placed it in.
- `skills` (array of strings) — the skills this run **applied**, the ones step 2
  loaded. Never the skill-discovery workflow.
- `savedAt` (string) — ISO timestamp of the POST.

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
valid — a stored concept is never rewritten or migrated.

The record travels as **JSON on standard input**, so no field ever reaches a
command line and no shell quoting or JSON escaping can corrupt a sentence
containing quotes, backslashes, or newlines. Lists are real JSON arrays, one
entry per element:

```bash
my-command-tools concepts save <<'CONCEPTEOF'
{
  "term": "<term>",
  "sentence": "<sentence>",
  "field": "<field>",
  "skills": ["<an applied skill>"],
  "notes": "<notes as Markdown>",
  "tips": ["<a tip>"],
  "sources": ["<a source>"],
  "surfacedSkills": ["<a surfaced skill>"]
}
CONCEPTEOF
```

The verb stamps `savedAt` itself and enforces the omit rule: an empty string and
an empty list both fall through and the key is never written, so an optional
field the run did not produce can be passed empty or left out of the object
entirely. It drops the skill-discovery workflow from both skill lists.

The verb always exits `0` and always prints one line, because the save is the
optional half of this step. Read that line and repeat its cause in the reply.

The store is append-only. Re-teaching a term adds a version rather than replacing
one, reads resolve the newest version, and a concurrent run can never overwrite
another's record.

**Why the hosted store and not a local file.** A file on one laptop strands the
corpus on that laptop, gives an agent nothing to query, and cannot be reached at
all from a cloud box that keeps no copy of the user's files. The Worker answers
all three. claude-proxy's ADR 0005 records the decision, the database choice, and
the nightly git backup that pays for it.

**This is step 2 of a three-step rollout, and the order is a correctness
requirement.** The service shipped first. This workflow posts to it now.
claude-proxy retires its local `concepts.jsonl` and schema **only after every
device runs this version** — see "Rolling this out to every device" below.
Deleting the file earlier would silently drop concepts written by a device still
on the old workflow. Do not write the file here as well: there is no dual-write,
and two stores that each look complete is the failure this ordering avoids.

## Rolling this out to every device

**The user does this by hand on each machine. Nothing here is automated, and no
workflow does it for them.** claude-proxy cannot retire its local
`concepts.jsonl` until every machine the user teaches from has finished both
steps.

On each device, in order:

1. **Set both variables in the shell profile** (`~/.zshrc` or the equivalent),
   then open a new shell:

   ```sh
   export CONCEPTS_URL="https://<the-worker>.workers.dev"
   export CONCEPTS_TOKEN="<the token from the Worker's secret store>"
   ```

   Read the token out of the Worker's secret store or a password manager. Never
   commit it, and never paste it into a repository file, a note, or a prompt.

2. **Pull this version of the workflow** — the sync workflow in a session on that
   device, or `git pull` in the clone the skills are symlinked from. A device
   still on the old version keeps writing to its own local file, and those
   concepts never reach the store.

Confirm a device is done by teaching one throwaway concept and checking that the
reply says `saved: 201`. When every device reports that, step 3 of the rollout is
safe to start in claude-proxy.

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
- **A term the corpus already holds ends the run at step 1.5.** The stored
  sentence is the deliverable, so returning it word for word is a complete run
  rather than a short one.
- Never ask for detail an implementer would need. The user is learning what to
  ask for, not writing a specification.
