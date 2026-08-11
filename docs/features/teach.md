---
type: feature
title: teach
description: Learn the real name for something you can only describe, and leave with one Simplified Technical English sentence you can say back to any agent.
tags: [command, vocabulary, learning]
timestamp: 2026-08-02
updated: 2026-08-09
dirty: true
---

# teach

## Summary

Turns a handwave into one sentence. You arrive able to describe something but not
name it; you leave with the term and a sentence short enough to repeat from
memory, printed in the reply and copied to the clipboard. It teaches a human — it
does not implement, open a PR, or invoke another command on your behalf.

The unit of value is the sentence, not the explanation around it. A run that
produces something longer, hedged, or more precise than you can say back has
failed, however accurate it is.

## Flags / Parameters

- `--here` / `-h` — read the current repo so the sentence can name real
  components, files, and existing patterns. **Default is context-only**: no file
  reads, so `/teach` runs from any directory, including one with no repo.
- Everything else — your description of the thing you cannot name.

## Behavior

Places the description in a field, then — **before it names anything** — runs
[`/lookup`](lookup.md) against the hosted concept store, with `--field` set to the
field just placed. That gate replaces the unconditional re-derivation the command
used to open with, and its position is the point: after the naming step the term
has already been invented and the duplicate already exists. An **exact term hit**
prints the stored sentence verbatim, copies it, and ends the run; a **field hit**
carries the neighbours into the naming step as context rather than as an answer;
a **miss** is the only outcome that authorizes the rest of the run. An
unreachable store is a miss with a stated cause — which variable was unset, the
status code, or the network error — never a stop, on the same terms the save side
already sets.

It then names the concept from the first source that
covers that field: the corpus neighbours that gate returned, an installed skill (`animation-vocabulary` for web motion,
`domain-modeling` for ubiquitous language, `apple-design` and `emil-design-eng`
for design vocabulary), the repo itself under `--here`, or model knowledge. It
never invents a term — an invented one survives into every later prompt and the
agent builds against it.

It then asks **one question at a time**, each with a recommended answer, and only
where the answer changes which concept this is or how you would ask for it. Each
question strips a layer instead of adding detail; parameters and edge cases
belong to whoever builds the thing. It stops as soon as you can say the sentence
back — not at a fixed count, and not on your sign-off.

[ASD-STE100](https://asd-ste100.org) Simplified Technical English governs
**everything the run emits**, not only the sentence: the field clause, each
question, the notes and tips it saves, and the closing report. One word one
meaning, one term per concept, active voice, simple tenses, no
gerunds-as-nouns, one instruction per sentence at 20 words (25 for a
description), six sentences per paragraph, articles kept, and no idiom or
metaphor. A command that hands over plain vocabulary in dense prose contradicts
its own deliverable. Three rules apply to the sentence alone — simple *present*
tense, a counted 25-word cap, and the taught term as the only hard word in it.
Finally it points at public skills via `find-skills` — you
inherit someone's tuning rather than relearning the field one term at a time —
and offers to save the concept.

That search is not optional and not conditional on how the term got named. A run
that fell through to model knowledge is the one that most needs it, because
falling through is what "nothing installed covers this field" means; the only
skip is `find-skills` not being installed, and the run says so when it skips.

### The STE overlap with `/truncate`

`/truncate` and `/docs` take their **Rewrite toward** rules from the same
standard, and deliberately exclude STE's length cap, simple-tense restriction,
and closed dictionary — those serve a reader with a limited vocabulary in the
subject, which is not the reader a command file has. `/teach` writes for exactly
that reader, so it adopts the excluded parts. The two are not in conflict and
`/teach` deliberately does not load `src/shared/rewrite-toward.md`, whose
exclusion clause is right for a command file and wrong here.

### Saving a concept

On yes, one JSON object is POSTed to the hosted concept store — a Cloudflare
Worker over D1, not a file on the machine. The write path is
`POST <base>/api/concepts` with an `Authorization: Bearer <token>` header; both
values come from the environment and neither is ever hardcoded or written to a
file. `IDEAS_URL` and `IDEAS_TOKEN` are read first, with `CONCEPTS_URL` and
`CONCEPTS_TOKEN` as the documented fallbacks, since ideas and concepts are one
dataset behind one Worker.

The POST is made by one toolkit verb, `my-command-tools concepts save`, shared
with `/lookup` and `/learn` rather than inlined per command —
`Bash(my-command-tools:*)` is allowlisted in `src/hooks/settings-fragment.json`,
so it runs without an approval round-trip. **The record travels as JSON on
standard input**, so no field of it ever reaches a command line: a sentence
containing quotes or backslashes cannot corrupt the record, and neither a value
nor the token appears in the transcript or the shell history. The verb reads both
environment variables from `process.env` inside its own process, prints one line
(`saved:` or `not saved: <cause>`), and always exits `0`.

The write is idempotent: a row id is a ULID derived from the record, so the store
returns **201** for a new concept and **200** for a replay. The retry sits
*inside* the call — one repeat on a network error or a `5xx`, reusing the same
record — rather than being a re-run of the command. That distinction matters:
each run stamps a fresh `savedAt`, which changes the record and therefore the
derived id, so re-running a failed save writes a second version instead of
replaying the first. Idempotency protects a repeated request, not a repeated run.
The store is
append-only — re-teaching a term adds a version, reads resolve the newest, and
concurrent runs cannot overwrite each other.

Five fields are always written: `term`, `sentence`, `field`, `skills` (the skills
the run **applied**), and `savedAt`. Four are optional and written only when the
run produced them:

- `notes` — Markdown of the research behind the term, rendered under the heading
  **Research** on the detail page. Its voice is specified, because that heading is
  read months later by someone deciding whether they already know the concept: the
  finding and never the run that found it (no `I`/`we`, no process narration, no
  tool names), one checkable claim per sentence with its backing in `sources`, the
  near-miss term the grill ruled out and why it lost, one committed answer instead
  of a both-sides paragraph, flat prose with no headings or `Summary` labels, no
  rhetorical flourish, and three to six sentences. The test is that a reader cannot
  tell whether the practitioner or the run wrote it. `tips` carry the same voice.
- `tips` — short practical pointers.
- `sources` — URLs, specs, skill names, repo paths; an `http`/`https` entry is
  rendered as a link.
- `surfacedSkills` — the skills the run **discovered** rather than applied. A
  `shadcn/ui` concept that turns up `radix-primitives` and `tailwind-tokens`
  surfaced both and applied neither; those names used to be dropped on the floor.

**`find-skills` is never recorded in either list.** It is a meta-skill about
finding skills, not a skill the concept applied; recording it says the concept is
about skill discovery. claude-proxy filters it out on the read side too, so this
is belt and braces.

**An optional field with nothing in it is omitted, never written as `""` or
`[]`.** claude-proxy's detail page distinguishes absent from empty, and absence is
what makes it show its "nothing more to show" fallback. Records written before
these fields existed carry none of them and stay valid; a stored concept is never
rewritten or migrated. The verb enforces the omit rule on the record it is
handed, and lists arrive as JSON arrays on stdin rather than as a delimited
string, so no separator has to be reserved out of a tip.

**An unreachable store is not fatal, and no longer silent.** `/improve`
hard-stops without the proxy because the suggestions are its input; `/teach`'s
input is you, and the sentence is already printed and copied before the save is
attempted. With `CONCEPTS_URL` or `CONCEPTS_TOKEN` unset, or the POST failing,
the sentence and the clipboard still land and only the save is skipped. What
changed is that the run now states the cause in one short line — which variable
was unset, the status code and reason the store returned, or the network error.
Previously an unreachable store was a silent no-op, which turned a broken store
into quiet loss.

**Why the hosted store and not a local file.** A file in one checkout stranded the
corpus on one device, gave agents nothing to query, and could not be reached from
a cloud box with no filesystem worth reading. claude-proxy's
[ADR 0005](https://github.com/llevasseur/claude-proxy/blob/main/docs/adrs/0005-host-the-concept-store.md)
records the decision, why D1 (its FTS5 `bm25()` is the ranking the tooling
already uses, and the tests run the production SQL through `node:sqlite`), and
the nightly git backup that pays for making a database the source of truth.

**The reading side lives in the claude-proxy repo**, which serves the corpus over
REST and MCP so an agent on any machine can query it. Its record contract is
`packages/core/src/concepts.ts`. The record shape is the contract between the two
repos, so a field added on one side does not block the other — an older record
missing the optional fields still reads, and a newer record carrying them still
writes.

### Rolling this out to every device

This is **step 2 of a three-step rollout** and the ordering is a correctness
requirement, not a convenience. The Worker shipped first; `/teach` posts to it
now; claude-proxy retires `logs/concepts.jsonl` and its schema **only once every
device runs this version of `/teach`**. Retiring the file earlier would silently
drop concepts written by a device still on the old command.

Nothing automates the rollout. On each machine you teach from, by hand:

1. Export both variables in the shell profile and open a new shell:

   ```sh
   export CONCEPTS_URL="https://<your-worker>.workers.dev"
   export CONCEPTS_TOKEN="<the token from the Worker's secret store>"
   ```

   Read the token from the Worker's secret store or your password manager. Never
   commit it and never paste it into a repo file or a prompt. **Neither installer
   writes these lines for you**: `scripts/install-personal.sh` and the `npx`
   wizard each report only whether the pair is set and print the two exports to
   paste, because a token written into a settings file or a dotfile by a tool
   lands somewhere you never chose and cannot easily audit.

2. Pull this version of the command — run [`/sync`](sync.md) on that device, or
   `git pull` in the clone the commands are symlinked from. A device still on the
   old `/teach` keeps writing its own local file, and those concepts never reach
   the store.

Confirm a device by teaching one throwaway concept and checking the reply says
`saved: 201`. When every device reports that, step 3 is safe to start in
claude-proxy.

## Related

- Command source: `src/commands/teach.md`
- Gated by [lookup](lookup.md), which reads the same store before the naming step
- Saves to the hosted concept store (`CONCEPTS_URL` / `CONCEPTS_TOKEN`) through
  the shared `my-command-tools concepts` verb
  (`src/toolkit/verbs/concepts.mjs`), whose environment contract the three store
  commands carry from `src/shared/concepts-store.md` — not to
  the `CLAUDE_PROXY_STORE` log directory [improve](improve.md) and
  [revive](revive.md) read
- Rolled out to each device with [sync](sync.md)
- Shares a source standard with [truncate](truncate.md)
- Spec: [Adding a command](../specs/adding-a-command.md)
