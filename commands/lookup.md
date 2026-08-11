---
description: Read the hosted concept store before a term is named, so a concept the corpus already holds is never named a second time
argument-hint: "[--field|-f <field>] [--limit|-l <n>] <term or description>"
allowed-tools: Bash, Read
---

The corpus already holds every term `/my-command:teach` has ever settled, and until now nothing read it back. So a concept taught in March gets taught again in August, under a second wording, and the two sentences disagree. This command is the **gate** that stops that: it reads the store, and its answer decides whether a `/my-command:teach` is allowed to start.

Input is the text in the `<command-args>` block above. Parse leading flags off the front; everything else is the term or the description to look up.

**This command is read-only and writes nothing to the store, ever.** Every request is a `GET`. It never posts, never saves, never re-teaches, and never edits a stored record. A concept that turns out to be wrong is not this command's to fix.

<!-- include: shared/closing-turn-anchor.md -->**Before the first tool call, anchor the way this run ends.** Put "close the run in a text-only turn" in the harness todo/task list as its own final item — worded on its own, never folded into the work it follows. The todo list is live session state that a compaction carries forward; this prompt is not, so once this run is summarized that item is the only surviving record that an outcome is still owed. **A run another command invoked inline with the `Skill` tool anchors its handback instead**, worded as "hand back to the invoking command in its next turn": a nested run that spends a text-only turn ends the whole assistant turn and strands every step its parent still owes, so the item it carries must not tell it to. A run the user invoked directly, and one dispatched as a subagent, both anchor the text-only close. **Resolve the item in the same tool-call turn as the run's last piece of real work** — the teardown, the final `verify`, the closing `gh` call — so the anchor is already marked completed when that turn returns and the only thing left for the run to do is speak. **Never leave marking it as a call of its own after the work ends.** A run whose last scheduled action is a bookkeeping tool call ends on that call: the mark lands, the message that was meant to follow it does not, and the run records no outcome — the exact failure this anchor exists to prevent, arriving through the anchor itself. Compose the closing message against a task list that is already clean, and if the anchor somehow survives the work, close it alongside whatever you are already calling rather than scheduling a turn for it — a still-open anchor is never a reason to end the run on a tool call.<!-- /include -->

<!-- include-block: shared/step-marker.md -->
### Mark each step as you enter it

**Open every step with its marker, on the first line of the message that enters it:** the word `STEP` in capitals, the number written in the `## Step …` heading you are entering, a slash, and how many `## Step …` headings this command declares — `STEP <n>/<N>`. The marker states the step outright, so the record of this run anchors it exactly instead of inferring it from the words around it.

- **Take `<n>` from the heading, not from a count of the steps you have finished.** `## Step 1.5 — …` writes `1.5` and keeps the fraction. A command whose headings start at `## Step 0 — …` writes `0` for its first step. `<N>` is the number of `## Step …` headings in this command, counting a `Step 0` and a `Step 1.5` like any other.
- **A command with no `## Step …` headings has no marker to write.** A single `## Steps` list declares nothing to anchor against, so open those runs in prose alone.
- **Write the marker on entry, once.** Continuing inside a step you already opened writes nothing. Re-entering a step after a correction writes it again, because that is an entry.
- **Keep naming the step in prose as well.** Every run recorded before this marker existed is read from that prose, and the prose is still the only reading for any message the marker is missing from. Dropping it to save a line costs the fallback and buys nothing.
<!-- /include-block -->

## Flags

- `--field` / `-f <field>` — the field the concept belongs to (`UI motion`, `domain modeling`, a business area). It selects the neighbours in outcome 2. Without it the run has only the query to go on, and neighbours come from the search alone.
- `--limit` / `-l <n>` — how many neighbours to list. Default 10.
- Anything not a recognized flag is part of the term or description.

## The three outcomes are the whole design

A lookup is not a search. It ends in exactly one of three outcomes, and the outcome — not the result count — is what the caller acts on:

1. **An exact term hit.** The stored Simplified Technical English sentence comes back **verbatim**, and the run **stops**. That sentence is the entire deliverable `/my-command:teach` exists to produce, so re-deriving it would yield a second wording for one concept — the thing `/my-command:teach`'s own one-term-per-concept rule forbids.
2. **A field hit with no term hit.** The neighbours come back **as context for the naming step, never as the answer**. A stored concept in the same field is what `/my-command:teach`'s first naming source — an installed skill covering the field — is trying to approximate, so handing those neighbours to the naming step improves it. Handing them back as though one of them were the term does not.
3. **A miss.** Say so and exit. **A miss is the only outcome that authorizes a `/my-command:teach` at all.**

Only an exact term match is outcome 1 — the query equal to a stored `term`, compared trimmed and without case. A search result that merely mentions the query is a **neighbour**, and belongs to outcome 2 with the rest of them. There is no fourth outcome, and a near miss is never promoted into outcome 1 to save a run.

## Step 1 — Read the store

<!-- include-block: shared/concepts-store.md -->
### The concept store

**The store is a hosted service, and every call into it goes through one toolkit verb.** It is a Cloudflare Worker over D1, and it is the source of truth for every concept `/my-command:teach` has ever saved. `my-command-tools concepts` is the only thing that speaks to it — never hand-roll a `node -e` block or a `curl` against it. The verb is what `Bash(my-command-tools:*)` allowlists, so it runs without an approval round-trip, and an inlined snippet costs one on every run.

**Both halves of the address come from the environment, and the verb reads them itself.**

- **`CONCEPTS_URL`** — the base URL of the Worker. `IDEAS_URL` is read first and `CONCEPTS_URL` is the documented fallback, because ideas and concepts are one dataset behind one Worker.
- **`CONCEPTS_TOKEN`** — the shared bearer token, sent as an `Authorization: Bearer <token>` header. `IDEAS_TOKEN` is read first and `CONCEPTS_TOKEN` is the fallback, for the same reason.

**Never print the token, never write it into a file, and never put it on a command line or in a URL** — a token in a query string lands in the transcript, in shell history, and in the Worker's request log. `printenv CONCEPTS_URL` is safe to read; **never run `printenv CONCEPTS_TOKEN`**. The verb reads both variables from `process.env` inside its own process, so neither value ever reaches an argument, and a record being saved travels **as a file path or on stdin** rather than as arguments for the same reason. Prefer `--record-file <path>`: write the JSON with the `Write` tool and hand over the path, with no shell in between, exactly as `commit --message-file` and `pr --body-file` already work. Composing the record inline means a heredoc, and that shape is refused inside an isolated worktree.

**Every subcommand prints exactly one status line on stdout and always exits `0`.** Read that line; it is the outcome, and nothing else in the run overrides it. `--json` returns the structured result instead, for a caller that wants the fields rather than the line.

**An unreachable store is a stated skip, never a stop.** Name the cause in one short line — which variable was unset, the status code and the short reason it returned, or the network error — and carry on. Never stop the run over it, and never ask the user to fix it mid-run. **Never work around it by touching a local file**: `logs/concepts.jsonl` is a backup of the store, not a second copy of it, so writing to it forks the corpus and reading it answers from a snapshot of unknown age.
<!-- /include-block -->

The store is read in a fixed order, and the first thing that answers decides the outcome:

1. `GET /api/concepts/concept?term=<query>` — the exact term. A `200` is outcome 1 and the run stops there. A `404` is this probe saying only that the corpus has no concept under that exact term.
2. `GET /api/concepts/search?q=<query>` — BM25 full text. A result whose `term` equals the query is promoted to outcome 1; every other result is a neighbour.
3. `GET /api/concepts?field=<field>` — the field listing, run only when `--field` was given. A row whose `term` equals the query is promoted to outcome 1 on the same terms as step 2; every other row joins the neighbours from step 2. The promotion is not an optimization: a concept the term probe missed and BM25 did not rank still *is* the exact term, and reporting it as a neighbour would invite `/my-command:teach` to name it a second time.

Neighbours found at the end of that order is outcome 2. Nothing found is outcome 3.

One call runs that whole order:

```bash
my-command-tools concepts lookup "<the term or description>" --field "<the field>" --limit <n>
```

Leave `--field` off when the run has no field, and `--limit` off to take the default of 10.

The verb always exits `0` and always prints one first line naming the outcome — `term hit:` followed by a `sentence:` line carrying the stored sentence unmodified, `field hit:` followed by one `- term [field] sentence` line per neighbour, or `miss:` with the cause appended when the corpus could not be read. Read that line; it is the outcome, and nothing else in the run overrides it.

## Step 2 — An unreachable store is a miss with a stated cause

**A store this run could not read is a miss, not a stop.** The same reasoning `/my-command:teach` already applies to the save side applies here: the run keeps going, and the failure costs the check rather than the work. Never stop the run over it, and never ask the user to fix it mid-run.

**Say the cause, in one short line**, so a reader can tell a corpus that holds nothing from a corpus that was never read. The difference matters here more than it does on the save side: an unread corpus authorizes a `/my-command:teach` that may well duplicate a stored term, and only the stated cause says so.

- A variable is unset → name which one, and say the corpus was not read.
- The store answered with an error → give the status code and the short reason it returned.
- The request never reached the store → give the network error.

Never expand this into a paragraph.

## Step 3 — Report the outcome

Print the outcome plainly, in the shape it earned. **Never re-word a stored sentence** — it is the deliverable of the run that produced it, and a paraphrase here is the second wording this command exists to prevent.

- **Term hit** — the stored sentence on its own line, exactly as the store returned it, then the term, the field, and a note that older versions exist when the store reported more than one. Put the bare sentence on the clipboard as well, the way `/my-command:teach` Step 6 does, so it is usable in the prompt the user is already writing:

  ```bash
  pbcopy <<'LOOKUPEOF'
  <the stored sentence>
  LOOKUPEOF
  ```

  Off macOS, substitute `wl-copy`, `xclip -selection clipboard`, or `clip.exe`. With no clipboard sink, print the sentence and say the copy was skipped. Then **stop** — no `/my-command:teach`, no second wording, no improvement of a sentence that is already the answer.
- **Field hit** — the neighbours as a short list, one `term — sentence` per line, under one line saying plainly that none of them is the term and that they are context for naming it. Never present the closest neighbour as the answer.
- **Miss** — one line saying the corpus holds nothing for this, plus the cause when the store could not be read, and `/my-command:teach <the description>` as the next step.

**Teach nothing here.** This command reads; it does not name, grill, or compose a sentence. A miss hands the work to `/my-command:teach` and ends.

## Step 4 — Close the run in a text-only turn

Lead with the outcome — term hit, field hit, or miss — in one line.

<!-- include-block: shared/closing-turn.md -->
**Every run states its outcome on the way out, and *how* it states it depends on how this run was invoked.** One mechanic decides all three cases: in Claude Code an assistant message carrying text and **zero tool calls** ends the assistant's turn and hands control back to the user. That is what records a run's outcome — and it is also what strands a parent pipeline when a nested run spends one, because the parent's remaining steps never get a turn to run in.

**Tell which of the three cases this run is in before composing anything, from how it was invoked:**

- **Outermost** — the user invoked this command directly, as the prompt this turn is answering. No other command run encloses it. It **closes in a text-only turn**.
- **Nested inline** — another command invoked this one with the `Skill` tool in this same session, as a step of its own pipeline, and that parent still has steps owed once this one returns. It **hands back without spending a text-only turn**.
- **Subagent** — this run was dispatched with the `Agent` tool (`--sub`, a delegated unit, any Agent-tool dispatch). It has its own conversation, and its final message is a report *to* the parent session rather than a turn *in* the parent's conversation, so nothing of the parent's is waiting behind it. It **closes in a text-only turn**, exactly like an outermost run.

**Outermost and subagent: close in a text-only turn. Never skipped, never delegated.** The run is over when this session sends **one message carrying text and zero tool calls** — not when the work lands. That is the mechanic, not a style preference: a run's outcome is recorded only from a message with no tool call in it, so a message carrying the report *and* a tool call is recorded as a decision mid-run, and a run whose last message is a tool call records no outcome at all. Make the last tool call, let it return, then reply with text alone.

**Nested inline: hand back without spending a text-only turn.** Emit the report and the return marker as **text in the same assistant message that carries the parent's next tool call**, so the turn continues into the parent's next step instead of ending and returning control to the user. A nested run that closes in a text-only turn strands every step its parent still owes — the recorded failure is a `/my-command:clean` and a `/my-command:pr` nested in one pipeline, where each child's text-only close handed control back before the parent could invoke the next child, run its teardown, or record its own outcome, leaving a live run reading as abandoned. So do not compose a message of text alone here, and do not stop to let the parent speak: say what this run did, write the marker, and make the parent's next call in that same message. The parent's own closing turn is the one that records the outcome for both.

- **Every exit routes here, not just the shipped one.** Finished; nothing to do; a gate still failing; a step blocked, refused, or awaiting my answer; the request abandoned as wrong. The wording changes; which of the three cases applies does not. A run that stopped early says where it stopped and what is on the branch, and leaves `/my-command:revive <thread id>` as the recovery path when the proxy thread id is available. A nested run that stopped early still hands back in the parent's turn — it reports the stop as text beside the parent's next call, and the parent decides whether to carry on.
- **Say it in one self-contained line first**, then any detail. Someone who never saw the request should be able to read that line alone.
- **End the message with this run's return marker, alone on the last line, in all three cases:** the word `RETURN` in capitals, a space, then the name this run was invoked under, leading slash and all — `RETURN /<command>`, carrying whatever namespace prefix that invocation carried. Written **exactly once**, on the last line of the message that hands control back, whether that message is a text-only close or a nested handback riding the parent's next tool call. The marker is the only record of where a run handed control back, so it is never weakened, deferred to a later message, or dropped because the turn continues: without it a nested run's span runs on to the next nested invocation, or to the end of the transcript for the last one, and that run is charged with everything its host did after it returned. **A run that ends abnormally never reaches this step and writes no marker**, so its span still runs to the end of the transcript: the marker makes the normal exit exact and leaves the abnormal one exactly as it already was.
- **A compaction boundary is a checkpoint, not an ending.** A recap prompt ("The user stepped away and is coming back…"), a `[SYSTEM NOTIFICATION - NOT USER INPUT]` event, or a session-continuation preamble each mean the run is still owed its turn: answer that prompt in text alone, say where the run actually stands, and restore the anchor todo item if it did not survive. A session is likeliest to die just after a compaction, so that answer is often the only outcome the run ever records. **Each side of the boundary records its own standing**, because a run split across two transcripts is two runs to the record: one that carried a PR across a boundary and closed on neither side reads as two abandoned runs, not one shipped one.
- **Every prompt from me opens a task, and only a text-only reply closes it.** The transcript starts a new `## Task:` at each of my messages — a mid-run question, a correction, a recap prompt, a change of direction — and writes `- done:` only when a reply carries text and no tool call. So answer my message in text alone *before* returning to tool calls. That is true even inside a nested run: my message is addressed to the session, not to whichever command currently holds it. A run that reads the message and keeps working straight through leaves that task, and every task before it, with no outcome line. There is no `- done:` marker to type: that line is written for you from any text-only turn, and skipped entirely from a turn that carries a tool call.
- **A reply to another session is not this turn either.** `SendMessage` is a tool call, so a run whose whole job was answering another agent records no outcome when that reply is the last thing it sends. Send the reply, let it return, then close in text alone — even when the closing message says much what the reply already said.
- **A subagent's report is never the dispatching run's turn.** The outcome belongs to the session the run started in, so after an `Agent` call returns, close that run in a message of your own.
- **Resolve the anchor before the message is composed, never as a call after it.** Mark the anchor todo item completed in the same tool-call turn as the run's last piece of real work, so nothing is left scheduled when that turn returns and the run's next action is the message itself. Marking it as a standalone final call is the recorded way this step fails: the mark lands every time, the message does not, and the run records no outcome. Handing back with it still open reads as abandoned, so close it — alongside a call you were already making, never as a turn of its own.
- **Do not tack the report onto the tool call before it — in the two closing cases.** `ExitWorktree`, `worktree end`, `verify`, and a closing `gh` call are exactly the calls that sit at the end of an outermost or subagent run and swallow the outcome. The nested handback is the deliberate exception and the only one: there the report rides the parent's **next** call, which is what keeps the parent's turn alive.
<!-- /include-block -->

## Notes

- **The outcome is the product, not the rows.** A run that lists five plausible concepts without saying which of the three outcomes it reached has answered a search, not a gate.
- **A device with the variables unset still answers.** It answers miss, and says which variable was unset. That is the intended behaviour, not a bug to work around.
- The store is append-only and reads resolve the newest version of a term, so a term hit is the current wording rather than the first one.
