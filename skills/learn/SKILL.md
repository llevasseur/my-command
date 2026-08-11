---
name: learn
description: Lease a skill for one task and give it back, counting the install on the concept record the teach workflow already writes.
---

# Lease a skill, then give it back

The teach workflow points at a public skill and stops — it surfaces the names and
is forbidden from installing any of them. So the last mile is done by hand every
time: find the skill again, install it, use it, and then either remember to
remove it or let it accumulate. This workflow is that last mile, and it takes the
install as a **lease**: the skill arrives for one task and goes back on the way
out.

The arguments are **the task you are about to do**, and that text is also the
query the concept lookup runs on. Parse leading flags off the front; the rest is
the task.

**This workflow installs a skill and removes it again. It writes no code, opens
no pull request, and creates no store of its own.**

## Flags

- `--field` / `-f <field>` — the field the concept belongs to. It scopes the
  lookup's neighbours, and scopes the skill search when the corpus surfaces
  nothing.
- `--concept` / `-c <term>` — look this term up instead of deriving the query
  from the task text. Use it when the task is phrased as work and the concept has
  a name.
- `--skill` / `-s <pkg@skill>` — lease this named package and skip discovery. The
  concept lookup still runs, because the count is written against the concept.
- `--keep` / `-k` — do not return the skill at the end. The lease still records
  what it installed, and the run still says what it kept.
- `--dry-run` / `-n` — report the concept, the skill it would lease, and the
  lease itself. Install nothing, write nothing, remove nothing.
- Anything else is the task.

## A lease is three rules, and they are the whole design

1. **The install is temporary by default.** The run records the skill, the
   concept it came from, and the task it was installed for, then removes it at
   the exit. The removal rides the same closing-turn anchor described below, so a
   run that gives up, is refused, or hits a failing gate returns the skill
   instead of leaving it behind.
2. **The removal is conditional on this lease having done the installing.** A
   skill the user already had is **never** removed, whatever else happens. That
   is why the lease records whether the install was real or a no-op, and why the
   probe runs **before** the install rather than after it.
3. **There is no download counter, and building one is the mistake to avoid.** An
   install is counted by writing the concept record the teach workflow writes
   anyway, so "how often did we download this" is a group-by on the read side
   rather than a number this workflow maintains.

### What this workflow deliberately does not add

**No second store.** The dashboard repo already indexes `field` and `skill` as
columns and already carries a `concept_skill` table built so a listing can group
without unpacking every document, and nothing reads them yet. A counter of this
workflow's own would be a second answer to a question the existing substrate
already answers, and the two would disagree the first time one of them missed a
write. So the keep-or-discard question is a **reading** question, answered on the
dashboard by grouping records that already exist.

**No lease file.** The lease lives in the session's todo list, beside the
closing-turn item and for the same reason: the todo list is live session state
that a compaction carries forward, and this prompt is not. A scratch file would
be a second place to look that only the todo list would ever remind the run to
read — the same duplicate-store mistake, one scale down.

## 1. Look the concept up

**Compose the lookup workflow (`$lookup`) on the query**, with the field set when
one was given. The task text is the query unless a concept term was named. This
is first because the concept is what the install is counted against, and because
the corpus is where the candidate skills come from.

The three outcomes decide what the rest of the run can do:

- **A term hit** — the concept is stored. Its `skills` and `surfacedSkills` are
  the first place the next step looks, and its record is what the count is
  written on.
- **A field hit** — no stored concept for this term. The neighbours name the
  field for the search; there is no record to count against.
- **A miss** — the corpus holds nothing. Say so, and name the teach workflow as
  the way to create the record a future lease would count on.

**A field hit or a miss does not stop the lease.** The skill is still found,
still leased, and still returned; only the count is skipped, and the run says in
one line that it was skipped because no concept record exists. Reporting a lease
as counted when nothing was written is the failure to avoid — an uncounted
install is invisible to the group-by, and a false count is worse than an
invisible one.

**Never re-word a stored sentence, and never name a term the lookup did not
return.** This workflow does not teach. A run that invents a term to have
something to count against has manufactured the record it was supposed to read.

## 2. Choose the skill to lease

Take the first source that produces a candidate:

0. **The named skill**, when one was given. It skips this step outright.
1. **The stored record's `surfacedSkills`.** These are the skills the teach
   workflow **discovered** and pointedly did not install — the list that exists
   because those names used to be dropped on the floor. A lease is the reader
   that list never had, so read it before searching for anything.
2. **The stored record's `skills`.** The skills a teach run applied to name the
   concept. A skill good enough to name the thing is usually good enough to work
   on it.
3. **A skill search**, when the record surfaced nothing or the run had no term
   hit. Search the field with the skills CLI, or with an installed
   skill-discovery skill where the session offers one.

Verify before leasing: prefer a skill with a real install count and a reputable
source, and treat anything obscure with skepticism. **Nothing found is a complete
answer.** Say plainly that no public skill covers this field, install nothing,
and go to the closing turn — a lease of a skill nobody vouches for costs more
than doing the task unaided. A skill-discovery skill is the finder and is never
itself the leased skill, and it never goes into a record.

## 3. Take the lease

**Probe first, then install.** The probe is what makes the removal safe, so it is
never skipped and never inferred from the install's own output:

```bash
npx -y skills list -g --json
```

Read the `name` field of every entry. Then:

- **The skill is already there** — the install is a **no-op**. Use it as it
  stands and record the lease as `keep`. **This skill is never removed**, by this
  run or any later step, whatever the keep flag says.
- **The skill is not there** — install it globally and record the lease as
  `return`:

  ```bash
  npx -y skills add <owner/repo@skill> -g -y
  ```

Then write the lease into the session's todo list, as its own item, immediately
before the closing-turn item:

- `return <skill> — leased for <task id>, concept <term>` when this run installed
  it.
- `keep <skill> — already installed before this run, never remove` when it did
  not.

**The task id is the branch when there is one.** Read it from the repository's
current checkout, tolerating a run outside a repository, and fall back to the
first few words of the task text. The branch is the one identifier a later reader
can check for themselves.

**A failed install is a stated skip, not a stop.** Say the package and what the
CLI returned, record no lease, and carry on to the task unaided. There is nothing
to remove and nothing to count.

**A dry run stops here.** Report the concept, the chosen skill, whether the
install would be real or a no-op, and the lease that would be recorded.

## 4. Count the install on the record the teach workflow already writes

**Only on a term hit.** The count is one `POST` to the same hosted concept store,
adding the leased skill to the record's `skills` and carrying every other field
forward unchanged. The store is append-only, so this lands as a **new version of
the same concept** — which is the count. Grouping those rows by skill on the read
side is "how often did we download this", and it needs nothing this workflow
maintains.

The count goes through one toolkit verb, `my-command-tools concepts count`.
Never hand-roll a `node -e` block or a `curl` against the store: the verb is what
the `my-command-tools` allowlist covers, so it runs without an approval
round-trip.

Both halves of the address come from the environment, and the verb reads them
itself. `IDEAS_URL` and `IDEAS_TOKEN` are read first; `CONCEPTS_URL` and
`CONCEPTS_TOKEN` are the documented fallbacks, because ideas and concepts are one
dataset behind one Worker. Reading `CONCEPTS_URL` is safe. **Never print
`CONCEPTS_TOKEN`.** Never hardcode either value, never write either one into a
file, and never put the token on a command line or in a URL — the verb reads both
from the process environment inside its own process.

**The verb re-reads the stored record and writes it back, rather than the run
retyping it.** A hand-composed record is where a paraphrased sentence or a
dropped `notes` field comes from, and because reads resolve the newest version, a
version written without them loses them for every later reader. Carrying them
forward inside the same call makes that mechanical rather than remembered.

```bash
my-command-tools concepts count "<the stored term, exactly as the lookup returned it>" "<the leased skill name>"
```

It carries `notes`, `tips`, `sources`, and `surfacedSkills` forward unchanged,
stamps a fresh `savedAt`, and never records the skill-discovery workflow as an
applied skill. The verb always exits `0` and always prints one line. Read that
line and repeat its cause in the reply.

- **A repeat lease is still a count.** The skill already sitting in the record's
  `skills` is not a reason to skip the write: the row counts an install, not a
  distinct skill.
- **A no-op install is still a count.** The question is how often this skill was
  reached for, and a run that reached for one it already had reached for it.
- **An unreachable store costs the count and nothing else.** Name the cause in
  one short line — which variable was unset, the status code and reason, or the
  network error — and carry on.

## 5. Do the task with the skill loaded

Use the leased skill, then do the task the arguments described. The skill is the
point of the run: a lease taken and never consulted has paid the install cost for
nothing.

**This workflow still writes no code of its own and opens no pull request.** For
work that ends in a pull request, compose it into the task workflow so the lease
wraps the implementation and the skill goes back when that run ends.

## Closing turn

**Return every skill this run leased, in the same tool-call turn as the run's
last piece of real work.** One call per leased skill:

```bash
npx -y skills remove <skill> -g -y
```

- **Return only what this lease installed.** A lease recorded as `keep` is a
  skill the user already had, and removing it takes away something this run was
  never given. This is the one rule with no exception in it — not a failing task,
  not a refusal, not tidiness.
- **The keep flag skips the removal and says so.** The lease becomes a permanent
  install, and the run names it in the report so the decision is visible rather
  than silent.
- **It belongs here because every exit routes here.** A run that gives up, is
  refused, hits a failing gate, or is abandoned as wrong all arrive here, each
  one holding a skill it is done with. Hooking the return to the closing turn is
  what makes a temporary install trustworthy enough to be the default.
- **A failed removal is reported, never retried into a delete.** Say the package
  and what the CLI returned, and name the manual removal command. Never delete a
  skill directory by hand to force it.

Then report, in two or three lines: the concept and the outcome the lookup
reached, the skill leased and whether it was returned or kept, and whether the
install was counted or why it was not.

Close the run in a text-only turn: one final message carrying text and zero tool
calls, sent after the last tool call returns rather than alongside it. A run's
outcome is recorded only from a message with no tool call in it, so ending on a
tool call — or bundling the report into one — records no outcome at all. Every
ending owes that turn, including one that stops early, is blocked or refused, or
found no skill to lease.

Anchor that turn before the first tool call: put "close the run in a text-only
turn" in the todo list as its own final item, because the todo list is live
session state that a compaction carries forward and this prompt is not. Resolve
it in the same tool-call turn as the run's last piece of real work — here, the
removal — so the list is already clean when that turn returns and the only thing
left to do is speak. Never leave marking it as a call of its own after the work
ends: a run whose last scheduled action is a bookkeeping tool call ends on that
call, the mark lands every time, and the message meant to follow it never
arrives. A compaction boundary is a checkpoint, not an ending — a recap prompt, a
background-task notification, or a session-continuation preamble each mean the
run is still owed its turn, so answer in text alone, say where the run stands,
and restore the todo items if they did not survive. **Restoring the lease item
matters as much as restoring the anchor**, because the lease is the only record
that a skill is still out on loan. Each side of a boundary records its own
standing, because a run split across two transcripts is two runs to the record.
Every message from the user opens a task in the same transcript, and only a reply
carrying text and no tool call closes it, so answer a mid-run question,
correction, or recap in text before returning to tool calls. A reply to another
session is not that turn either: sending a message is a tool call, so send the
reply, let it return, then close in text alone.

## Notes

- **The lease is the product, not the skill.** A run that installs something and
  leaves it behind has done the thing this workflow exists to replace, however
  useful the skill turned out to be.
- **A device with `CONCEPTS_URL` or `CONCEPTS_TOKEN` unset still leases.** It
  reads no concept and counts nothing, and says so in one line each time. That is
  the intended behaviour.
- **A skill-discovery skill is the finder, never the leased skill**, and never
  lands in a record. Recording it would say the concept is about skill discovery,
  which no concept taught here is.
- **The count is not a verdict.** A skill leased twenty times is worth a
  permanent install and a skill leased once is not, but this workflow never
  decides that — the number is read by a person on the dashboard, which is the
  whole reason it maintains no threshold of its own.
