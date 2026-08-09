---
name: lookup
description: Read the hosted concept store before a term is named, so a concept the corpus already holds is never named a second time.
---

# Look it up before you name it

The corpus holds every term the teach workflow has ever settled, and nothing read
it back. So a concept settled in March is settled again in August under a second
wording, and the two sentences disagree. This workflow is the **gate** that stops
that. It reads the store, and its answer decides whether a teach run may start.

The arguments are the term or the description to look up. Parse leading flags off
the front; the rest is the query.

**This workflow is read-only and writes nothing to the store, ever.** Every
request is a `GET`. It never saves, never re-teaches, and never edits a stored
record.

## Flags

- `--field` / `-f <field>` — the field the concept belongs to. It selects the
  neighbours in outcome 2. Without it, neighbours come from the search alone.
- `--limit` / `-l <n>` — how many neighbours to list. Default 10.
- Anything else is part of the query.

## The three outcomes are the whole design

A lookup is not a search. It ends in exactly one of three outcomes, and the
outcome — not the number of rows — is what the caller acts on:

1. **An exact term hit.** The stored Simplified Technical English sentence comes
   back **word for word**, and the run **stops**. That sentence is the entire
   deliverable the teach workflow exists to produce, so deriving it again gives a
   second wording for one concept — what the one-term-per-concept rule forbids.
2. **A field hit with no term hit.** The neighbours come back **as context for
   the naming step, never as the answer**. A stored concept in the same field is
   what an installed skill for that field is trying to approximate.
3. **A miss.** Say so and exit. **A miss is the only outcome that allows a teach
   run at all.**

Only an exact term match is outcome 1 — the query equal to a stored `term`,
compared trimmed and without case. A result that merely mentions the query is a
**neighbour** and belongs to outcome 2. There is no fourth outcome, and a near
miss is never promoted to outcome 1 to save a run.

## 1. Read the store

Both halves of the address come from the environment, exactly as the teach
workflow reads them for the save side. Reading `CONCEPTS_URL` is safe. **Never
print `CONCEPTS_TOKEN`** — that puts the token in the transcript. Check only that
it is set, or let the snippet report an unset one.

- **`CONCEPTS_URL`** — the base URL of the Worker.
- **`CONCEPTS_TOKEN`** — the bearer token, sent as an
  `Authorization: Bearer <token>` header.

**Never hardcode either value, never write either one into a file, and never put
the token on a command line.** The snippet reads both from the process
environment, so the token stays out of the command, the transcript, and the shell
history.

Read the store in a fixed order. The first probe that answers decides the
outcome:

1. `GET /api/concepts/concept?term=<query>` — the exact term. A `200` is outcome
   1 and the run stops. A `404` says only that no concept sits under that exact
   term.
2. `GET /api/concepts/search?q=<query>` — full-text search. A result whose `term`
   equals the query becomes outcome 1; every other result is a neighbour.
3. `GET /api/concepts?field=<field>` — the field listing, run only when a field
   was given. Its rows join the neighbours from step 2.

Neighbours at the end of that order is outcome 2. Nothing is outcome 3.

```bash
node -e '
const [term, field, limitArg] = process.argv.slice(1);
const base = process.env.CONCEPTS_URL;
const token = process.env.CONCEPTS_TOKEN;
if (!base || !token) {
  console.log("miss: " + (base ? "CONCEPTS_TOKEN" : "CONCEPTS_URL") + " is not set, so the corpus was not read");
  process.exit(0);
}
const root = base.replace(/\/+$/, "");
const limit = Number(limitArg) || 10;
const why = (e) => e.message + (e.cause && e.cause.message ? " (" + e.cause.message + ")" : "");
const get = async (path) => {
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const res = await fetch(root + path, { headers: { authorization: "Bearer " + token } });
      if (res.status === 404) return { missing: true };
      if (!res.ok) {
        if (res.status >= 500 && attempt === 1) continue;
        return { error: res.status + " " + (await res.text()).trim().slice(0, 120) };
      }
      return { body: await res.json() };
    } catch (err) {
      if (attempt === 1) continue;
      return { error: why(err) };
    }
  }
};
const unreachable = (e) => console.log("miss: the store answered " + e + ", so the corpus was not read");
const same = (a, b) => String(a ?? "").trim().toLowerCase() === String(b ?? "").trim().toLowerCase();
const hit = (c, versions) => {
  console.log("term hit: " + c.term + " [" + (c.field ?? "no field") + "]" + (versions > 1 ? " (" + versions + " versions, newest shown)" : ""));
  console.log("sentence: " + c.sentence);
};
const q = encodeURIComponent(term);
(async () => {
  const exact = await get("/api/concepts/concept?term=" + q);
  if (exact.error) return unreachable(exact.error);
  if (exact.body && exact.body.concept) {
    return hit(exact.body.concept, (exact.body.versions || []).length);
  }
  const neighbours = new Map();
  const found = await get("/api/concepts/search?q=" + q + "&limit=" + limit);
  if (found.error) return unreachable(found.error);
  for (const c of (found.body && found.body.results) || []) {
    if (same(c.term, term)) return hit(c, 1);
    neighbours.set(c.term, c);
  }
  if (field) {
    const near = await get("/api/concepts?field=" + encodeURIComponent(field) + "&limit=" + limit);
    if (near.error) return unreachable(near.error);
    for (const c of (near.body && near.body.concepts) || []) neighbours.set(c.term, c);
  }
  const rows = [...neighbours.values()].slice(0, limit);
  if (rows.length === 0) return console.log("miss: the corpus holds no concept for " + JSON.stringify(term));
  console.log("field hit: " + rows.length + " neighbour(s), no term hit");
  for (const c of rows) console.log("- " + c.term + " [" + (c.field ?? "no field") + "] " + c.sentence);
})();
' "<the term or description>" "<the field, or an empty string>" "<the limit>"
```

The snippet always exits `0` and always prints one first line naming the outcome.
That line is the outcome, and nothing later in the run overrides it.

## 2. An unreachable store is a miss with a stated cause

**A store the run could not read is a miss, not a stop.** The teach workflow
already applies that reasoning to the save side; it applies here too. The run
keeps going, and the failure costs the check rather than the work.

**State the cause in one short line**, so a reader can tell a corpus that holds
nothing from a corpus that was never read. That difference matters more here than
on the save side: an unread corpus allows a teach run that may duplicate a stored
term, and only the stated cause says so.

- A variable is unset → name which one, and say the corpus was not read.
- The store answered with an error → give the status code and the short reason.
- The request never reached the store → give the network error.

Never expand this into a paragraph, and never ask the user to fix it mid-run.

## 3. Report the outcome

Print the outcome in the shape it earned. **Never re-word a stored sentence** — it
is the deliverable of the run that produced it, and a paraphrase here is the
second wording this workflow exists to prevent.

- **Term hit** — the stored sentence on its own line, exactly as the store
  returned it, then the term, the field, and a note that older versions exist
  when the store reported more than one. Put the bare sentence on the clipboard
  as well, with `pbcopy`, `wl-copy`, `xclip -selection clipboard`, or `clip.exe`,
  and say the copy was skipped where no clipboard sink exists. Then **stop**: no
  teach run, no second wording, no improvement of a sentence that is already the
  answer.
- **Field hit** — the neighbours as a short list, one `term — sentence` per line,
  under one line saying plainly that none of them is the term and that they are
  context for naming it. Never present the closest neighbour as the answer.
- **Miss** — one line saying the corpus holds nothing for this, plus the cause
  when the store could not be read, and the teach workflow as the next step.

**Teach nothing here.** This workflow reads. It does not name, question, or write
a sentence. A miss hands the work to the teach workflow and ends.

## Closing turn

Lead with the outcome — term hit, field hit, or miss — in one line.

Close the run in a text-only turn: one final message carrying text and zero tool
calls, sent after the last tool call returns rather than alongside it. A run's
outcome is recorded only from a message with no tool call in it, so ending on one
— or bundling the report into one — records no outcome at all. Every ending owes
that turn, including one that stops early, is blocked or refused, or hands work
back to an invoking workflow.

Anchor that turn before the first tool call: put "close the run in a text-only
turn" in the todo list as its own final item, because the todo list is live
session state that a compaction carries forward and this prompt is not. Resolve
it in the same tool-call turn as the run's last piece of real work, so the list
is already clean when that turn returns and the only thing left to do is speak.
Never leave marking it as a call of its own after the work ends: a run whose last
scheduled action is a bookkeeping tool call ends on that call — the mark lands
every time, and the message meant to follow it never arrives. A compaction
boundary is a checkpoint, not an ending — a recap prompt, a background-task
notification, or a session-continuation preamble each mean the run is still owed
its turn, so answer in text alone, say where the run stands, and restore the todo
item if it did not survive. Each side of a boundary records its own standing,
because a run split across two transcripts is two runs to the record. Every
message from the user opens a task in the same transcript, and only a reply
carrying text and no tool call closes it, so answer a mid-run question,
correction, or recap in text before returning to tool calls. A reply to another
session is not that turn either: SendMessage is a tool call, so send the reply,
let it return, then close in text alone.

## Notes

- **The outcome is the product, not the rows.** A run that lists five plausible
  concepts without saying which of the three outcomes it reached has answered a
  search, not a gate.
- **A device with the variables unset still answers.** It answers miss, and names
  the variable that was unset. That is the intended behaviour.
- The store is append-only and reads resolve the newest version of a term, so a
  term hit is the current wording rather than the first one.
