---
description: Lease a skill for one task and give it back, counting the install on the concept record /teach already writes
argument-hint: "[--field|-f <field>] [--concept|-c <term>] [--skill|-s <pkg@skill>] [--keep|-k] [--dry-run|-n] <the task you are about to do>"
allowed-tools: Bash, Read, Skill
---

`/teach` points at a public skill and stops — Step 5 surfaces the names and is forbidden from installing any of them. So the last mile is done by hand every time: find the skill again, install it, use it, and then either remember to remove it or let it accumulate. This command is that last mile, and it takes the install as a **lease**: the skill arrives for one task and goes back on the way out.

Input is the text in the `<command-args>` block above. Parse leading flags off the front; everything else is **the task you are about to do**, and it is also the query the concept lookup runs on.

**This command installs a skill and removes it again. It writes no code, opens no PR, and creates no store of its own.**

<!-- include: shared/closing-turn-anchor.md -->**Before the first tool call, anchor the closing turn.** Put "close the run in a text-only turn" in the harness todo/task list as its own final item — worded on its own, never folded into the work it follows. The todo list is live session state that a compaction carries forward; this prompt is not, so once this run is summarized that item is the only surviving record that an outcome is still owed. **Resolve it in the same tool-call turn as the run's last piece of real work** — the teardown, the final `verify`, the closing `gh` call — so the anchor is already marked completed when that turn returns and the only thing left for the run to do is speak. **Never leave marking it as a call of its own after the work ends.** A run whose last scheduled action is a bookkeeping tool call ends on that call: the mark lands, the message that was meant to follow it does not, and the run records no outcome — the exact failure this anchor exists to prevent, arriving through the anchor itself. Compose the closing message against a task list that is already clean, and if the anchor somehow survives the work, close it alongside whatever you are already calling rather than scheduling a turn for it — a still-open anchor is never a reason to end the run on a tool call.<!-- /include -->

## Flags

- `--field` / `-f <field>` — the field the concept belongs to (`UI motion`, `domain modeling`, a business area). Passed to `/lookup` to scope the neighbours, and used to scope the skill search when the corpus surfaces nothing.
- `--concept` / `-c <term>` — look this term up instead of deriving the query from the task text. Use it when the task is phrased as work ("make the list bounce") and the concept has a name ("rubber-banding").
- `--skill` / `-s <pkg@skill>` — lease this named package, and skip the discovery step. The concept lookup still runs, because the count is written against the concept.
- `--keep` / `-k` — do not return the skill at the end. The lease still records what it installed and the run still says what it kept, but the removal is skipped.
- `--dry-run` / `-n` — report the concept, the skill it would lease, and the lease itself. Install nothing, write nothing, remove nothing.
- Anything not a recognized flag is the task.

## A lease is three rules, and they are the whole design

1. **The install is temporary by default.** The run records the skill, the concept it came from, and the task it was installed for, then removes it at the exit. The removal **rides the closing-turn anchor above**, which is what makes it happen on the exits nobody plans for — a run that gives up, is refused, or hits a failing gate returns the skill instead of leaving it behind. `/improve` settled that release path for an idea claim; this reuses it rather than inventing a second one.
2. **The removal is conditional on this lease having done the installing.** A skill the user already had is **never** removed, whatever else happens. That is why the lease records whether the install was real or a no-op, and why the probe in Step 3 runs **before** the install rather than after it.
3. **There is no download counter, and building one is the mistake to avoid.** An install is counted by writing the concept record `/teach` writes anyway, so "how often did we download this" is a group-by on the read side rather than a number this command maintains. See Step 4.

### What this command deliberately does not add

**No second store.** claude-proxy already indexes `field` and `skill` as columns and already carries a `concept_skill` table built precisely so a listing can group without unpacking every document — and nothing reads them yet. A counter of this command's own would be a second answer to a question the existing substrate already answers, and the two would disagree the first time one of them missed a write. So the keep-or-discard question — is this skill worth a permanent install — is a **reading** question, answered on claude-proxy's concepts page by grouping the records that already exist.

**No lease file.** The lease lives in the harness todo/task list, beside the closing-turn anchor and for the same reason: the todo list is live session state that a compaction carries forward, and this prompt is not. A scratch file would be a second place to look that only the todo list would ever remind the run to read — the same duplicate-store mistake, one scale down.

## Step 1 — Look the concept up

**Run `/lookup` on the query, with `--field` set when `--field` was given.** The task text is the query unless `--concept` named one. This is the first step because the concept is what the install is counted against, and because the corpus is where the candidate skills come from.

The three outcomes decide what the rest of the run can do:

- **A term hit** — the concept is stored. Its `skills` and `surfacedSkills` are the first place Step 2 looks, and its record is what Step 4 counts the install on. This is the whole path working.
- **A field hit** — no stored concept for this term. The neighbours name the field for Step 2's search; there is no record to count against.
- **A miss** — the corpus holds nothing. Say so, and name `/teach <the description>` as the way to create the record a future lease would count on.

**A field hit or a miss does not stop the lease.** The skill is still found, still leased, and still returned; only the count is skipped, and the run says in one line that it was skipped because no concept record exists. Reporting a lease as counted when nothing was written is the failure to avoid here — an uncounted install is invisible to the group-by, and a false count is worse than an invisible one.

**Never re-word a stored sentence, and never name a term `/lookup` did not return.** This command does not teach; a run that invents a term to have something to count against has manufactured the record it was supposed to read.

## Step 2 — Choose the skill to lease

Take the first source that produces a candidate:

0. **`--skill` / `-s`, when given.** It skips this step outright.
1. **The stored record's `surfacedSkills`.** These are the skills `/teach` **discovered** and pointedly did not install — the list that exists because those names used to be dropped on the floor. A lease is the reader that list never had, so read it before searching for anything.
2. **The stored record's `skills`.** The skills a `/teach` run applied to name the concept. A skill good enough to name the thing is usually good enough to work on it.
3. **`find-skills`**, when the record surfaced nothing or the run had no term hit. Invoke the skill and search the field — `--field`, or the field the neighbours reported. **`find-skills` is never itself the leased skill**, and never goes into a record: it is a meta-skill about finding skills.

Verify before leasing, on `find-skills`' own terms: prefer a skill with a real install count and a reputable source, and treat anything obscure with skepticism. **Nothing found is a complete answer.** Say plainly that no public skill covers this field, skip to the closing turn, and install nothing — a lease of a skill nobody vouches for costs more than doing the task unaided.

## Step 3 — Take the lease

**Probe first, then install.** The probe is what makes the removal safe, so it is never skipped and never inferred from the install's own output:

```bash
npx -y skills list -g --json
```

Read the `name` field of every entry. Then:

- **The skill is already there** — the install is a **no-op**. Load it with the `Skill` tool and record the lease as `keep`. **This skill is never removed**, by this run or any later step, whatever `--keep` says.
- **The skill is not there** — install it globally and record the lease as `return`:

  ```bash
  npx -y skills add <owner/repo@skill> -g -y
  ```

Then write the lease into the harness todo/task list, as its own item, immediately before the closing-turn item:

- `return <skill> — leased for <task id>, concept <term>` when this run installed it.
- `keep <skill> — already installed before this run, never remove` when it did not.

**The task id is the branch when there is one.** Read it from `my-command-tools state` (`|| true` — this command runs outside a repo just as happily), and fall back to the first few words of the task text. The branch is the same holder string `/improve` picks for an idea claim, and for the same reason: it is the one identifier a later reader can check for themselves.

**A failed install is a stated skip, not a stop.** Say the package and what the CLI returned, record no lease, and carry on to the task unaided. There is nothing to remove and nothing to count.

**`--dry-run` stops here.** Report the concept, the chosen skill, whether the install would be real or a no-op, and the lease that would be recorded. Install nothing.

## Step 4 — Count the install on the record `/teach` already writes

**Only on a term hit.** The count is one `POST` to the same hosted concept store, adding the leased skill to the record's `skills` and carrying every other field forward unchanged. The store is append-only, so this lands as a **new version of the same concept** — which is the count. Grouping those rows by `skill` on the read side is "how often did we download this", and it needs nothing this command maintains.

Both halves of the address come from the environment, exactly as `/teach` and `/lookup` read them. `printenv CONCEPTS_URL` is safe. **Never run `printenv CONCEPTS_TOKEN`** — that prints the token into the transcript. **Never hardcode either value, never write either one into a file, and never put the token on a command line.** The snippet reads both from `process.env` inside the node process.

**The snippet re-reads the stored record and writes it back, rather than the run retyping it.** A hand-composed record is where a paraphrased sentence or a dropped `notes` field comes from, and because reads resolve the newest version, a version written without them loses them for every later reader. Carrying them forward inside the same call is what makes that mechanical rather than remembered.

```bash
node -e '
const [term, skill] = process.argv.slice(1);
const base = process.env.CONCEPTS_URL;
const token = process.env.CONCEPTS_TOKEN;
if (!base || !token) {
  console.log("not counted: " + (base ? "CONCEPTS_TOKEN" : "CONCEPTS_URL") + " is not set");
  process.exit(0);
}
if (skill === "find-skills") {
  console.log("not counted: find-skills is never recorded as an applied skill");
  process.exit(0);
}
const root = base.replace(/\/+$/, "");
const auth = { authorization: "Bearer " + token };
const why = (e) => e.message + (e.cause && e.cause.message ? " (" + e.cause.message + ")" : "");
(async () => {
  let stored;
  try {
    const res = await fetch(root + "/api/concepts/concept?term=" + encodeURIComponent(term), { headers: auth });
    if (!res.ok) return console.log("not counted: the store answered " + res.status + " for " + JSON.stringify(term));
    stored = (await res.json()).concept;
  } catch (err) {
    return console.log("not counted: " + why(err));
  }
  if (!stored) return console.log("not counted: the corpus holds no concept for " + JSON.stringify(term));
  const rec = {
    term: stored.term,
    sentence: stored.sentence,
    field: stored.field,
    skills: [...(stored.skills || []), skill].filter((s) => s !== "find-skills"),
    savedAt: new Date().toISOString(),
  };
  for (const k of ["notes", "tips", "sources", "surfacedSkills"]) {
    const v = stored[k];
    if (typeof v === "string" ? v.trim() : Array.isArray(v) && v.length) rec[k] = v;
  }
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const res = await fetch(root + "/api/concepts", {
        method: "POST",
        headers: { "content-type": "application/json", ...auth },
        body: JSON.stringify(rec),
      });
      const body = (await res.text()).trim().slice(0, 200);
      if (res.ok) return console.log("counted: " + res.status + " — " + skill + " on " + rec.term);
      if (res.status >= 500 && attempt === 1) continue;
      return console.log("not counted: " + res.status + " " + body);
    } catch (err) {
      if (attempt === 1) continue;
      return console.log("not counted: " + why(err));
    }
  }
})();
' "<the stored term, exactly as /lookup returned it>" "<the leased skill name>"
```

The snippet always exits `0` and always prints one line. Read that line and repeat its cause in the reply.

- **A repeat lease is still a count.** The skill already sitting in the record's `skills` is not a reason to skip the write: the row counts an install, not a distinct skill.
- **A no-op install is still a count.** The question the group-by answers is how often this skill was reached for, and a run that reached for one it already had reached for it.
- **An unreachable store costs the count and nothing else.** Name the cause in one short line — which variable was unset, the status code and reason, or the network error — and carry on. Never stop the run over it, and never ask the user to fix it mid-run.

## Step 5 — Do the task with the skill loaded

Load the leased skill with the `Skill` tool if Step 3 has not already, then do the task the arguments described. The skill is the point of the run: a lease taken and never consulted has paid the install cost for nothing.

**This command still writes no code of its own and opens no PR.** For work that ends in a PR, compose it into the run that does: `/task -a learn <how the skill relates> <the task>` puts the lease around the implementation, so the skill is present while the work happens and goes back when that run ends.

## Step 6 — Close the run in a text-only turn

**Return every skill this run leased, in the same tool-call turn as the run's last piece of real work.** One call per leased skill:

```bash
npx -y skills remove <skill> -g -y
```

- **Return only what this lease installed.** A lease recorded as `keep` is a skill the user already had, and removing it takes away something this run was never given. This is the one rule with no exception in it — not a failing task, not a refusal, not `--keep` inverted, not tidiness.
- **`--keep` / `-k` skips the removal and says so.** The lease becomes a permanent install, and the run names it in the report so the decision is visible rather than silent.
- **It belongs here because every exit routes here.** A run that gives up, is refused, hits a failing gate, or is abandoned as wrong all arrive at this step, each one holding a skill it is done with. Hooking the return to the closing turn is what makes a temporary install trustworthy enough to be the default — and it is why the lease is a todo item rather than a note in this prompt, which a compaction does not carry.
- **A failed removal is reported, never retried into a delete.** Say the package and what the CLI returned, and name `npx skills remove <skill> -g` as the manual step. Never remove a skill directory by hand to force it.

Then report, in two or three lines: the concept and the outcome `/lookup` reached, the skill leased and whether it was returned or kept, and whether the install was counted or why it was not.

<!-- include-block: shared/closing-turn.md -->
**This step is never skipped and never delegated.** The run is over when this session sends **one message carrying text and zero tool calls** — not when the work lands. That is the mechanic, not a style preference: a run's outcome is recorded only from a message with no tool call in it, so a message carrying the report *and* a tool call is recorded as a decision mid-run, and a run whose last message is a tool call records no outcome at all. Make the last tool call, let it return, then reply with text alone.

- **Every exit routes here, not just the shipped one.** Finished; nothing to do; a gate still failing; a step blocked, refused, or awaiting my answer; the request abandoned as wrong. The wording changes, the closing turn does not. A run that stopped early says where it stopped and what is on the branch, and leaves `/revive <thread id>` as the recovery path when the proxy thread id is available.
- **Say it in one self-contained line first**, then any detail. Someone who never saw the request should be able to read that line alone.
- **A compaction boundary is a checkpoint, not an ending.** A recap prompt ("The user stepped away and is coming back…"), a `[SYSTEM NOTIFICATION - NOT USER INPUT]` event, or a session-continuation preamble each mean the run is still owed its turn: answer that prompt in text alone, say where the run actually stands, and restore the anchor todo item if it did not survive. A session is likeliest to die just after a compaction, so that answer is often the only outcome the run ever records. **Each side of the boundary records its own standing**, because a run split across two transcripts is two runs to the record: one that carried a PR across a boundary and closed on neither side reads as two abandoned runs, not one shipped one.
- **Every prompt from me opens a task, and only a text-only reply closes it.** The transcript starts a new `## Task:` at each of my messages — a mid-run question, a correction, a recap prompt, a change of direction — and writes `- done:` only when a reply carries text and no tool call. So answer my message in text alone *before* returning to tool calls. A run that reads the message and keeps working straight through leaves that task, and every task before it, with no outcome line. There is no marker to type: the `- done:` line is written for you from any text-only turn, and skipped entirely from a turn that carries a tool call.
- **A reply to another session is not this turn either.** `SendMessage` is a tool call, so a run whose whole job was answering another agent records no outcome when that reply is the last thing it sends. Send the reply, let it return, then close here in text alone — even when the closing message says much what the reply already said.
- **A subagent's report is never this turn.** The outcome belongs to the session the run started in, so after an `Agent` call returns, close the run here, in a message of your own.
- **Resolve the anchor before the message is composed, never as a call after it.** Mark the anchor todo item completed in the same tool-call turn as the run's last piece of real work, so nothing is left scheduled when that turn returns and the run's next action is the message itself. Marking it as a standalone final call is the recorded way this step fails: the mark lands every time, the message does not, and the run records no outcome. Handing back with it still open reads as abandoned, so close it — alongside a call you were already making, never as a turn of its own.
- **Do not tack the report onto the tool call before it.** `ExitWorktree`, `worktree end`, `verify`, and a closing `gh` call are exactly the calls that sit at the end of a run and swallow the outcome.
<!-- /include-block -->

## Notes

- **The lease is the product, not the skill.** A run that installs something and leaves it behind has done the thing this command exists to replace, however useful the skill turned out to be.
- **A device with `CONCEPTS_URL` / `CONCEPTS_TOKEN` unset still leases.** It reads no concept in Step 1 and counts nothing in Step 4, and says so in one line each time. That is the intended behaviour, not a bug to work around.
- **`find-skills` is the finder, never the leased skill**, and never lands in a record. Recording it would say the concept is about skill discovery, which no concept taught here is.
- **The count is not a verdict.** A skill leased twenty times is worth a permanent install and a skill leased once is not, but this command never decides that — the number is read on claude-proxy's concepts page by a person, which is the whole reason it maintains no threshold of its own.
