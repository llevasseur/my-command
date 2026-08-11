---
description: Learn the real name for something you can only describe, then leave with one Simplified Technical English sentence you can say back to any agent
argument-hint: "[--here|-h] <description of the thing you cannot name>"
allowed-tools: Bash, Read, Grep, Glob, Skill
---

You can describe it but you cannot name it, so every prompt you write about it lands next to the thing you meant instead of on it. This command ends with **one sentence you can say back** — the concept reduced to its root, in words plain enough that nobody has to look anything up. The sentence is the whole deliverable.

Input is the text in the `<command-args>` block above — your description, however vague. Parse leading flags off the front; everything else is the description.

**Teach, never build.** No implementation, no PR, and no invocation of another command on the user's behalf. The user leaves with vocabulary.

<!-- include: shared/closing-turn-anchor.md -->**Before the first tool call, anchor the closing turn.** Put "close the run in a text-only turn" in the harness todo/task list as its own final item — worded on its own, never folded into the work it follows. The todo list is live session state that a compaction carries forward; this prompt is not, so once this run is summarized that item is the only surviving record that an outcome is still owed. **Resolve it in the same tool-call turn as the run's last piece of real work** — the teardown, the final `verify`, the closing `gh` call — so the anchor is already marked completed when that turn returns and the only thing left for the run to do is speak. **Never leave marking it as a call of its own after the work ends.** A run whose last scheduled action is a bookkeeping tool call ends on that call: the mark lands, the message that was meant to follow it does not, and the run records no outcome — the exact failure this anchor exists to prevent, arriving through the anchor itself. Compose the closing message against a task list that is already clean, and if the anchor somehow survives the work, close it alongside whatever you are already calling rather than scheduling a turn for it — a still-open anchor is never a reason to end the run on a tool call.<!-- /include -->

<!-- include-block: shared/step-marker.md -->
### Mark each step as you enter it

**Open every step with its marker, on the first line of the message that enters it:** the word `STEP` in capitals, the number written in the `## Step …` heading you are entering, a slash, and how many `## Step …` headings this command declares — `STEP <n>/<N>`. The marker states the step outright, so the record of this run anchors it exactly instead of inferring it from the words around it.

- **Take `<n>` from the heading, not from a count of the steps you have finished.** `## Step 1.5 — …` writes `1.5` and keeps the fraction. A command whose headings start at `## Step 0 — …` writes `0` for its first step. `<N>` is the number of `## Step …` headings in this command, counting a `Step 0` and a `Step 1.5` like any other.
- **A command with no `## Step …` headings has no marker to write.** A single `## Steps` list declares nothing to anchor against, so open those runs in prose alone.
- **Write the marker on entry, once.** Continuing inside a step you already opened writes nothing. Re-entering a step after a correction writes it again, because that is an entry.
- **Keep naming the step in prose as well.** Every run recorded before this marker existed is read from that prose, and the prose is still the only reading for any message the marker is missing from. Dropping it to save a line costs the fallback and buys nothing.
<!-- /include-block -->

## Flags

- `--here` / `-h` — read the current repo (`Read`, `Grep`, `Glob`) so the sentence can name real components, files, and existing patterns. **Default is context-only**: no file reads at all, so `/teach` runs from any directory, including one with no repo in it.
- Anything not a recognized flag is part of the description.

## How this command writes

Every word this command emits is [ASD-STE100](https://asd-ste100.org) Simplified Technical English — the Step 1 field clause, each Step 3 question, the Step 4 sentence, the Step 7 `notes` and `tips`, and the closing turn. A command that hands over plain vocabulary in dense prose contradicts its own deliverable.

- **One word, one meaning, one part of speech.** A word doing two jobs in one sentence is two sentences.
- **One term per concept**, reused — never a synonym for variety.
- **Active voice; imperative for an instruction.** The actor is usually the claim; the passive drops it.
- **Simple tenses only.** No perfect and no progressive forms.
- **No gerund or participle standing in for a noun.** "It springs back", not "the springing back".
- **One instruction per sentence**, and 20 words for an instruction, 25 for a description.
- **Six sentences per paragraph at most**, and one topic in each.
- **Keep the articles.** "Press the button", not "press button".
- **No idiom, no metaphor, no slang.** Write the literal thing.
- **A vertical list for a set of conditions**, never one sentence stacking three clauses with "and" and "or".

**The taught term is the only hard word allowed anywhere in the run.** Never define jargon with harder jargon, and never reach for a longer word where the closed-dictionary one carries the same meaning.

## Step 1 — Place the field

Decide which field the description belongs to — domain modeling, UI motion, visual design, a business term, a workflow, something else. The field selects the corpus neighbours in Step 1.5 and the source in Step 2, and nothing more. Say which field you picked in one clause, so a wrong guess is correctable before the grill starts.

## Step 1.5 — Check the corpus before you name anything

**Run `/lookup` on the description, with `--field` set to the field Step 1 just placed it in.** The corpus already holds every term this command has ever settled, and until this step existed nothing read it back — so a run re-derived a term whether or not one was already stored. This step **replaces that unconditional re-derivation**, and it belongs here, before the naming step: after Step 2 the term has already been invented and the duplicate already exists.

The gate has three outcomes, and each one decides what the rest of the run does:

- **An exact term hit** — the concept is already taught. Print the stored sentence **verbatim**, copy it as Step 6 does, say when it was saved, and **stop the run there**. Never re-derive it, never improve it, and never save a second version. Two wordings for one concept is what this command's one-term-per-concept rule forbids, and re-deriving a stored sentence is how it happens.
- **A field hit with no term hit** — carry the neighbours into Step 2 as a **naming source, not as an answer**. None of them is the term.
- **A miss** — the corpus holds nothing for this. A miss is the only outcome that authorizes the rest of this run.

**An unreachable store is a miss with a stated cause, not a stop.** An unset variable, an error status, or a network failure each cost the check and nothing else, on the same terms Step 7 already sets for the save side. The run carries on to Step 2 and says in one line why the corpus was not read — an unread corpus is where a duplicate term comes from, so the cause is the reader's only warning.

`/lookup` writes nothing, so nothing in this step changes what Step 7 later saves.

## Step 2 — Name it, skills first

Resolve the description to the term a practitioner would use. Take the first source that covers the field:

0. **The neighbours Step 1.5 returned**, when it reported a field hit. A stored concept in the same field is what an installed skill covering the field is trying to approximate, so read them first — for the vocabulary the corpus already uses, never as a term to adopt whole.
1. **Installed skills.** `animation-vocabulary` is a reverse-lookup glossary for web motion and answers "the bouncy thing when a popover opens" directly. `domain-modeling` owns ubiquitous language and domain terminology. `apple-design` and `emil-design-eng` carry design and interaction vocabulary. Load a matching one with the `Skill` tool.
2. **The repo**, under `--here` only — a codebase's own name for a thing beats the general one, and `AGENTS.md` or `docs/` may already fix the vocabulary.
3. **Model knowledge**, when no skill covers the field.

Ambiguous between two terms is not a failure — carry both into Step 3 and let the first question settle it. **Never invent a term to sound authoritative.** An invented term is worse than the user's own words, because it survives into every later prompt and the agent builds against it. Nothing recognizable → say so plainly and treat the user's own description as the vocabulary.

**Keep track of what you load and what you read.** The skills you actually load here are the run's *applied* skills, and Step 7 records them as `skills`. What you consulted to get there — the page you read, the spec you cited, the repo path under `--here` — is the run's `sources`.

## Step 3 — Grill toward the root

**One question per turn. Never more.** Each question carries your recommended answer.

Ask a question only when the answer changes **which concept this is** or **how the user would ask for it**. Every other question is noise, however interesting.

Each question strips a layer rather than adding detail — the run moves from the user's handwave toward the root of the concept, so a question that adds a parameter, an edge case, or an implementation choice is the wrong question. Those belong to whoever builds it.

**Stop as soon as the user can say the sentence back.** Not at a fixed count, and not when the user signs off — the moment the remaining ambiguity no longer changes the sentence, stop asking and compose it.

## Step 4 — Compose the sentence

Write one sentence to the STE rules above, plus three that belong to the sentence alone:

- **Simple present tense**, not any other simple tense.
- **25 words maximum**, counted before you print it.
- **The taught term is the only hard word in it.** It is the payload; every word around it is ordinary English.

`/truncate` and `/docs` draw their **Rewrite toward** rules from the same standard and deliberately drop three of them — STE's word caps, its simple-tense restriction, and its closed dictionary — on the grounds that they serve a human reader with a limited vocabulary in the subject. That reader is exactly who `/teach` writes for, so `/teach` adopts them. Do not reconcile the two by loading `src/shared/rewrite-toward.md`; its exclusion clause is correct for a command file and wrong here.

## Step 5 — Point at public skills

**Always invoke the `find-skills` skill when it is installed. The run does not reach Step 8 without it.** Look for public skills that already encode this field. The point is inheritance: a skill someone else already tuned beats relearning the field one term at a time. List what it finds, or say plainly that nothing public covers this. **Never install anything** — surface the options and stop.

**Step 2 already having named the term is not a reason to skip this**, and neither is a field that feels too narrow, too obvious, or too well understood to search. The two steps answer different questions: Step 2 asks what this concept is called, Step 5 asks who has already written the whole field down. A run that fell through to model knowledge is the run that most needs the search, because falling through is what "nothing installed covers this field" means. The only skip is `find-skills` not being installed, and then say so in the reply.

**Keep the names it surfaces.** Step 7 records them as `surfacedSkills` — the skills this run *discovered*, as against the `skills` it applied. A `shadcn/ui` concept that turns up `radix-primitives` and `tailwind-tokens` surfaced both; it applied neither. A later turn that uncovers more skills adds to the same list.

**`find-skills` is never one of them, and never goes in `skills`.** It is a meta-skill about finding skills, not a skill this concept applied — recording it says the concept is about skill discovery, which no concept taught here is.

## Step 6 — Print it and copy it

Print the sentence in the reply **and** put it on the clipboard. One Bash call, heredoc-quoted so the shell expands and escapes nothing:

```bash
pbcopy <<'TEACHEOF'
<the sentence>
TEACHEOF
```

Off macOS, substitute `wl-copy`, `xclip -selection clipboard`, or `clip.exe`. With no clipboard sink, print the sentence and say the copy was skipped.

**The clipboard gets the bare sentence.** No `/god`, no `/cp`, no command name, no quotes, no surrounding prose — the user pastes it wherever they want, which is usually a prompt they are already writing.

## Step 7 — Offer to save

Ask whether to save the concept. On yes, POST one JSON object to the hosted concept store — a Cloudflare Worker, not a file on this machine. A concept taught on one device is then readable from every other one.

Both halves of the address come from the environment. `printenv CONCEPTS_URL` is safe to read. **Never run `printenv CONCEPTS_TOKEN`** — that prints the token into the transcript. Check only that it is set, without echoing it, or let the hook below report an unset one:

- **`CONCEPTS_URL`** — the base URL of the Worker. The write path is `POST <CONCEPTS_URL>/api/concepts`.
- **`CONCEPTS_TOKEN`** — the bearer token, sent as an `Authorization: Bearer <token>` header.

**Never hardcode either value, never write either one into a file, and never put the token on a command line.** The hook below reads both from `process.env` inside its own process, so the token stays out of the command, the transcript, and the shell history. Do not echo it, and do not print it back in the reply.

**The write is idempotent, and the retry belongs inside the call.** A row id is a ULID derived from the record itself, so the store returns **201** when the concept is new and **200** when the identical record is replayed. The hook below therefore retries once on a network error or a `5xx`, reusing the same record. **Never re-run the whole command to retry a failed save.** Every run stamps a fresh `savedAt`, which changes the record, which changes the derived id — so a second run writes a *second version* of the concept instead of replaying the first. Idempotency protects a repeated request, not a repeated run.

**An unreachable store is not fatal.** `/improve` cannot run without the proxy because the suggestions *are* the input; `/teach`'s input is the user. Step 6 already printed the sentence and copied it, and that stands whatever this step does. So when `CONCEPTS_URL` or `CONCEPTS_TOKEN` is unset, or the POST fails, keep the sentence, keep the clipboard, skip only the save, and never stop the run over it.

**Say why the save failed, in one short line.** The old behaviour skipped the save silently, which turned a broken store into quiet loss. One line, in the reply, naming the cause:

- A variable is unset → name which one, and say the concept was not saved.
- The store answered with an error → give the status code and the short reason it returned.
- The request never reached the store → give the network error.

Never expand this into a paragraph, and never ask the user to fix it mid-run.

### The record

One JSON object per request — the whole record is the POST body. Five fields are **required** and always written:

| Field | Type | What it holds |
| --- | --- | --- |
| `term` | string | The term Step 2 landed on. |
| `sentence` | string | The Step 4 sentence, exactly as printed and copied. |
| `field` | string | The field Step 1 placed it in. |
| `skills` | string[] | The skills this run **applied** — the ones Step 2 loaded. Never `find-skills`. |
| `savedAt` | string | ISO timestamp of the POST. |

Four more are **optional**, and claude-proxy's detail page renders each one it finds:

| Field | Type | What it holds |
| --- | --- | --- |
| `notes` | string (Markdown) | The research the run did: which source named the term, what the grill settled, what the concept is *not*. Written to the voice rules below. |
| `tips` | string[] | Short practical pointers the run produced — how to use the term, what it is confused with, what to say instead. |
| `sources` | string[] | What you consulted: URLs, spec names, skill names, repo paths under `--here`. An entry starting with `http`/`https` is rendered as a link. |
| `surfacedSkills` | string[] | The skills Step 5 **discovered**, as against the `skills` this run applied. Never `find-skills`. |

### How the Research reads

`notes` renders under the heading **Research** on the detail page, and the reader is a person months from now deciding whether they already know this. Write it the way the practitioner who owns this field writes a note to themselves. Every rule below is a positive instruction, and the test for all of them is that nobody reading it can tell whether the practitioner or the run wrote it.

- **Report the finding, never the run that found it.** "Material Design calls the dimmed layer behind a modal a scrim." Not "I searched for the term and discovered that…". Cut every trace of the process: no `I`, no `we`, no "let's", no step numbers, no tool or command names, no account of what you tried first.
- **Every sentence states a claim a reader could check**, and what backs it is already in `sources`. A sentence that states no claim gets deleted, not shortened.
- **Name what the concept is not.** The near-miss term the grill ruled out is the half of the research the reader cannot rebuild alone — name that term and say what made it lose.
- **Never restate the term or the sentence.** Both sit above this field on the same page, so a note that opens by defining the term has spent its first line on nothing.
- **Commit to one answer.** No "it is worth noting", no "while X, Y is also true", no paragraph that presents two views and picks neither. Where two terms are genuinely live, say which one to use and in which case.
- **Write it flat.** No headings, no `Overview` / `Summary` / `Conclusion` label, no bold word opening every line, and no closing sentence that restates the paragraph that just ended.
- **Drop the flourish.** No "not just X — it is Y", no three-item rhetorical build, no rhetorical question, no exclamation, and no word that exists to sound authoritative rather than to carry meaning.
- **Three to six sentences.** Longer means the run is explaining the field instead of recording what it found. Nothing found means omit the field.

`tips` carry the same voice, one pointer per line, each a thing to do or a thing to say instead.

**Omit an optional field entirely when there is nothing to record.** Never write `""` or `[]` for one: the detail page distinguishes absent from empty, and an absent field is what makes it show its "nothing more to show" fallback. Records written before these fields existed carry none of them and stay valid — a stored concept is never rewritten or migrated.

Write it with the `concept-save` hook, passing every value as an argument, so no shell quoting or JSON escaping can corrupt a sentence containing quotes, backslashes, or newlines. Lists are **newline-separated**, one entry per line, because a tip or a note reliably contains a comma and never contains a newline:

```bash
~/.claude/my-command/hooks/concept-save.mjs \
  "<term>" "<sentence>" "<field>" "<applied skills, one per line>" \
  "<notes as Markdown>" "<tips, one per line>" "<sources, one per line>" "<surfaced skills, one per line>"
```

<!-- include-block: shared/store-hooks.md -->
### Reach the hosted stores through the store hooks

**Every read and write of the hosted concept store and the hosted ideas ledger goes through a hook in `~/.claude/my-command/hooks/`**, never through an inlined `node -e` block. The hooks are installed beside the workflow gates and **allowlisted by name**, so each call runs without an approval round-trip; an inlined block is not allowlisted and costs one. On a device with `CLAUDE_CONFIG_DIR` set, they sit under that directory's `my-command/hooks/` instead — `my-command-tools doctor` reports where.

- `concept-save.mjs <term> <sentence> <field> <skills> [notes] [tips] [sources] [surfaced]` — write a concept. List arguments are newline-separated.
- `concept-count.mjs <term> <skill>` — count one skill install on that concept's record.
- `ideas-read.mjs [--available] [--repo <owner/name>] [--area <area>] [--status <a,b>]` — read the ledger.
- `ideas-add.mjs <path-to-json>` — record proposals from a JSON array in a file.
- `ideas-claim.mjs <slug> <holder> [pr-url]` — take an idea.
- `ideas-mark.mjs <slug> <status> [note]` — set an idea's status.

**Never pass a token to one of these, and never print one.** Each hook reads `CONCEPTS_URL`/`CONCEPTS_TOKEN` — and for the ledger `IDEAS_URL`/`IDEAS_TOKEN`, falling back to the concepts pair — from `process.env` inside its own process. A token on a command line reaches the transcript and the shell history; `printenv CONCEPTS_TOKEN` and `printenv IDEAS_TOKEN` are never run.

**Read the first line of the output, and only the first line, as the outcome.** Every hook prints at most one status line and always **exits 0**, so the exit status says nothing — `saved:`, `counted:`, `read:`, `added:`, `claimed:`, `marked:` are the successes, and a line beginning `not ` carries the cause after the colon: which variable was unset, the HTTP status with its short reason, or the network error. `ideas-read.mjs` and `ideas-add.mjs` print their JSON on the lines after that one, on success only.

**An unreachable store is a stated skip, never a stop** — except where the command says otherwise. The call is lost and nothing else: the run continues and says in one short line why, naming the cause the hook gave it. Each hook already retries once on a network error or a 5xx, reusing the identical record, so **never recover by re-running a whole command**: a fresh run stamps a new `savedAt`, which changes the derived row id and writes a second version instead of replaying the first.
<!-- /include-block -->

The hook enforces the omit rule — an empty string and an empty list both fall through and the key is never written. Pass `""` for anything the run did not produce; do not drop the argument, or the values after it shift.

It always exits `0` and always prints one line, because the save is the optional half of this step. Read that line and repeat its cause in the reply.

The store is append-only. Re-teaching a term adds a version rather than replacing one, reads resolve the newest version, and a concurrent run can never overwrite another's record.

**Why the hosted store and not a local file.** A file on one laptop strands the corpus on that laptop, gives an agent nothing to query, and cannot be reached at all from a cloud box that keeps no copy of your files. The Worker answers all three. claude-proxy's [ADR 0005](https://github.com/llevasseur/claude-proxy/blob/main/docs/adrs/0005-host-the-concept-store.md) records the decision, the D1 choice, and the nightly git backup that pays for it.

**This is step 2 of a three-step rollout, and the order is a correctness requirement.** The service shipped first. `/teach` posts to it now. claude-proxy retires `logs/concepts.jsonl` and its schema **only after every device runs this version of `/teach`** — see "Rolling this out to every device" below. Deleting the file earlier would silently drop concepts written by a device still on the old command. Do not write the file here as well: there is no dual-write, and two stores that each look complete is the failure this ordering avoids.

## Step 8 — Close the run in a text-only turn

Two or three lines: the term, the field, whether the concept was saved. Never reprint the sentence — it is already in the reply and on the clipboard.

<!-- include-block: shared/closing-turn.md -->
**This step is never skipped and never delegated.** The run is over when this session sends **one message carrying text and zero tool calls** — not when the work lands. That is the mechanic, not a style preference: a run's outcome is recorded only from a message with no tool call in it, so a message carrying the report *and* a tool call is recorded as a decision mid-run, and a run whose last message is a tool call records no outcome at all. Make the last tool call, let it return, then reply with text alone.

- **Every exit routes here, not just the shipped one.** Finished; nothing to do; a gate still failing; a step blocked, refused, or awaiting my answer; the request abandoned as wrong. The wording changes, the closing turn does not. A run that stopped early says where it stopped and what is on the branch, and leaves `/revive <thread id>` as the recovery path when the proxy thread id is available.
- **Say it in one self-contained line first**, then any detail. Someone who never saw the request should be able to read that line alone.
- **End the message with this run's return marker, alone on the last line:** the word `RETURN` in capitals, a space, then the name this run was invoked under, leading slash and all — `RETURN /<command>`, carrying whatever namespace prefix that invocation carried. Every command leaves through this step, so it is the one place a run nested inside another provably passes on its way out, and the marker is the only record of where it handed control back. Without it a nested run's span runs on to the next nested invocation, or to the end of the transcript for the last one, and that run is charged with everything its host did after it returned. **A run that ends abnormally never reaches this step and writes no marker**, so its span still runs to the end of the transcript: the marker makes the normal exit exact and leaves the abnormal one exactly as it already was.
- **A compaction boundary is a checkpoint, not an ending.** A recap prompt ("The user stepped away and is coming back…"), a `[SYSTEM NOTIFICATION - NOT USER INPUT]` event, or a session-continuation preamble each mean the run is still owed its turn: answer that prompt in text alone, say where the run actually stands, and restore the anchor todo item if it did not survive. A session is likeliest to die just after a compaction, so that answer is often the only outcome the run ever records. **Each side of the boundary records its own standing**, because a run split across two transcripts is two runs to the record: one that carried a PR across a boundary and closed on neither side reads as two abandoned runs, not one shipped one.
- **Every prompt from me opens a task, and only a text-only reply closes it.** The transcript starts a new `## Task:` at each of my messages — a mid-run question, a correction, a recap prompt, a change of direction — and writes `- done:` only when a reply carries text and no tool call. So answer my message in text alone *before* returning to tool calls. A run that reads the message and keeps working straight through leaves that task, and every task before it, with no outcome line. There is no `- done:` marker to type: that line is written for you from any text-only turn, and skipped entirely from a turn that carries a tool call.
- **A reply to another session is not this turn either.** `SendMessage` is a tool call, so a run whose whole job was answering another agent records no outcome when that reply is the last thing it sends. Send the reply, let it return, then close here in text alone — even when the closing message says much what the reply already said.
- **A subagent's report is never this turn.** The outcome belongs to the session the run started in, so after an `Agent` call returns, close the run here, in a message of your own.
- **Resolve the anchor before the message is composed, never as a call after it.** Mark the anchor todo item completed in the same tool-call turn as the run's last piece of real work, so nothing is left scheduled when that turn returns and the run's next action is the message itself. Marking it as a standalone final call is the recorded way this step fails: the mark lands every time, the message does not, and the run records no outcome. Handing back with it still open reads as abandoned, so close it — alongside a call you were already making, never as a turn of its own.
- **Do not tack the report onto the tool call before it.** `ExitWorktree`, `worktree end`, `verify`, and a closing `gh` call are exactly the calls that sit at the end of a run and swallow the outcome.
<!-- /include-block -->

## Rolling this out to every device

**Do this by hand on each machine. Nothing here is automated, and no command does it for you.** claude-proxy cannot retire `logs/concepts.jsonl` until every machine you teach from has finished both steps.

On each device, in order:

1. **Set both variables in the shell profile** (`~/.zshrc` or the equivalent), then open a new shell:

   ```sh
   export CONCEPTS_URL="https://<your-worker>.workers.dev"
   export CONCEPTS_TOKEN="<the token from the Worker's secret store>"
   ```

   Read the token out of the Worker's secret store or your password manager. Never commit it, and never paste it into a repo file, a note, or a prompt.

2. **Pull this version of the command** — run **`/sync`** in a session on that device, or `git pull` in the clone the commands are symlinked from. A device still on the old `/teach` keeps writing to its own local file, and those concepts never reach the store.

Confirm a device is done by teaching one throwaway concept and checking that the reply says `saved: 201`. When every device reports that, step 3 of the rollout is safe to start in claude-proxy.

## Notes

- **The sentence is the product.** Reaching it in fewer questions is good; reaching something longer, hedged, or more precise than the user can repeat from memory is a failed run.
- **A device with the variables unset still teaches.** It just reads nothing in Step 1.5 and saves nothing in Step 7, and the run says so in one line each time. That is the intended behaviour, not a bug to work around.
- **A term the corpus already holds ends the run at Step 1.5.** The stored sentence is the deliverable, so returning it verbatim is a complete run rather than a short one.
- A sentence the user cannot say back is not shorter than the handwave they arrived with, and the run has bought them nothing.
- Never grill for detail an implementer would need. The user is learning what to ask for, not writing a spec.
