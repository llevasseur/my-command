---
type: feature
title: learn
description: Leases a skill for one task and gives it back, counting the install on the concept record teach already writes rather than on a counter of its own.
tags: [command, skills, concepts]
timestamp: 2026-08-09
dirty: true
---

# learn

## Summary

Installs a public skill for one task, uses it, and removes it again. `/teach`
surfaces the skills a concept belongs to and is forbidden from installing any of
them, so the last mile — install, use, remove — was done by hand every time or
not at all. `/learn` is that last mile, and it takes the install as a **lease**
rather than as an installation: the skill arrives for one task and goes back on
the way out.

It writes no code, opens no PR, and maintains no store of its own.

## Flags / Parameters

- `--field` / `-f <field>` — the field the concept belongs to. Scopes
  [`/lookup`](lookup.md)'s neighbours, and scopes the skill search when the
  corpus surfaces nothing.
- `--concept` / `-c <term>` — look this term up instead of deriving the query
  from the task text. For a task phrased as work ("make the list bounce") whose
  concept has a name ("rubber-banding").
- `--skill` / `-s <pkg@skill>` — lease this named package and skip discovery. The
  lookup still runs, because the count is written against the concept.
- `--keep` / `-k` — do not return the skill at the end. The lease is still
  recorded and the run still names what it kept; only the removal is skipped.
- `--dry-run` / `-n` — report the concept, the skill it would lease, and the
  lease itself. Installs nothing, writes nothing, removes nothing.
- Everything else — the task you are about to do. It is also the lookup query.

## Behavior

### A lease is three rules

1. **The install is temporary by default.** The run records the skill, the
   concept it came from, and the task it was installed for, then removes it at
   the exit. The removal **rides the closing-turn anchor** every command in this
   suite already carries, which is what makes it happen on the exits nobody plans
   for: a run that gives up, is refused, or hits a failing gate returns the skill
   instead of leaving it behind. `/improve` settled that release path for an idea
   claim, and this reuses it rather than inventing a second one.
2. **The removal is conditional on this lease having done the installing.** A
   skill the user already had is **never** removed — not on a failing task, not
   on a refusal, not for tidiness. That is why the lease records whether the
   install was real or a no-op, and why the probe runs *before* the install
   rather than after it.
3. **An install is counted on the concept record, not on a counter.** See below.

### Counting without a counter

`/teach` already writes `skills` and `surfacedSkills` per concept, and
claude-proxy already indexes `field` and `skill` as columns with a
`concept_skill` table built precisely so a listing can group without unpacking
every document — and no view reads them yet. So the install is counted by
**writing the concept record `/teach` writes anyway**: one `POST` adds the leased
skill to the record's `skills` and carries every other field forward unchanged.
The store is append-only, so it lands as a new version of the same concept, and
"how often did we download this" becomes exactly the group-by that substrate was
built for.

**A download counter of this command's own is the thing it declines to add.** It
would be a second answer to a question the existing columns already answer, and
the two would disagree the first time either missed a write. The keep-or-discard
threshold is therefore a **reading** question, answered by a person on
claude-proxy's concepts page — this command maintains no number and issues no
verdict.

Two consequences follow, and both are deliberate: a **repeat** lease still writes
a row, because the row counts an install rather than a distinct skill; and a
**no-op** install still writes one, because the question is how often the skill
was reached for.

The `POST` re-reads the stored record inside the same call and writes it back
with the skill appended, rather than the run retyping the fields. Reads resolve
the newest version, so a version written without `notes`, `tips`, `sources`, or
`surfacedSkills` would lose them for every later reader; carrying them forward
inside the call makes that mechanical rather than remembered. `find-skills` is
never recorded, on `/teach`'s existing rule.

### The lookup is the first step

`/learn` opens by running [`/lookup`](lookup.md) on the query, and its outcome
decides what the rest of the run can do:

- **A term hit** — the stored record's `surfacedSkills` and `skills` are the
  first place the skill search looks, and that record is what the count is
  written on. `surfacedSkills` is the list `/teach` fills with the skills a run
  *discovered* rather than applied — names that used to be dropped on the floor.
  A lease is the reader that list never had.
- **A field hit** — the neighbours name the field for the search. No record
  exists for the term, so nothing is counted.
- **A miss** — the corpus holds nothing, and `/teach <the description>` is the
  way to create the record a future lease would count on.

**Neither a field hit nor a miss stops the lease.** The skill is still found,
leased, and returned; only the count is skipped, and the run says in one line
why. An uncounted install is invisible to the group-by, and a false count is
worse than an invisible one. A device with `CONCEPTS_URL` or `CONCEPTS_TOKEN`
unset still leases; it reads nothing and counts nothing, and states the cause.

### Where the lease is kept

In the **harness todo list**, as its own item immediately before the closing-turn
item — `return <skill> — leased for <task id>, concept <term>`, or
`keep <skill> — already installed before this run, never remove`. The todo list
is the only run state a compaction carries forward, which is the same reason the
closing-turn anchor lives there. A scratch file was declined: it would be a
second place to look that only the todo list would ever remind the run to read,
which is the duplicate-store mistake one scale down.

**The task is identified by the branch** when the run is in a repository, read
from `my-command-tools state` and tolerant of running outside one, falling back
to the first few words of the task text. That is the same holder string
`/improve` picks for an idea claim, and for the same reason: it is the one
identifier a later reader can check for themselves.

### Install and removal

The probe is `npx skills list -g --json`, run **before** the install — it is what
tells a real install from a no-op, and therefore what makes the removal safe. The
install is `npx skills add <owner/repo@skill> -g -y` and the return is
`npx skills remove <skill> -g -y`. A failed install is a stated skip with no
lease recorded; a failed removal is reported with the manual command, never
forced by deleting a skill directory by hand.

### Composing it into a task

`/learn` opens no PR, which is what makes it composable:
`/task -a learn <how the skill relates> <the task>` wraps the lease around the
implementation, so the skill is present while the work happens and goes back when
that run ends.

## Related

- Command source: `src/commands/learn.md`
- Opens with [lookup](lookup.md), whose outcome selects the concept and the
  candidate skills
- Reads the `surfacedSkills` [teach](teach.md) records and writes the count back
  to the same hosted concept store (`CONCEPTS_URL` / `CONCEPTS_TOKEN`)
- Composes into [task](task.md) with `--add`, as [diagram](diagram.md) does
- Reuses the closing-turn release path [improve](improve.md) settled for an idea
  claim
- Spec: [Adding a command](../specs/adding-a-command.md)
