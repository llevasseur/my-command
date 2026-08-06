---
description: Learn the real name for something you can only describe, then leave with one Simplified Technical English sentence you can say back to any agent
argument-hint: "[--here|-h] <description of the thing you cannot name>"
allowed-tools: Bash, Read, Grep, Glob, Skill
---

You can describe it but you cannot name it, so every prompt you write about it lands next to the thing you meant instead of on it. This command ends with **one sentence you can say back** — the concept reduced to its root, in words plain enough that nobody has to look anything up. The sentence is the whole deliverable.

Input is the text in the `<command-args>` block above — your description, however vague. Parse leading flags off the front; everything else is the description.

**Teach, never build.** No implementation, no PR, and no invocation of another command on the user's behalf. The user leaves with vocabulary.

<!-- include: shared/closing-turn-anchor.md -->**Before the first tool call, anchor the closing turn.** Put "close the run in a text-only turn" in the harness todo/task list as its own final item — worded on its own, never folded into the work it follows — and leave it open until it is the only item left. The todo list is live session state that a compaction carries forward; this prompt is not. Once this run is summarized, that item is the only surviving record that an outcome is still owed. **Then close it out:** "until it is the only item left" is the trigger to resolve it, not a reason to leave it open forever — once it is the last item and the work is done, mark it completed with the run's **final tool call**, and send the text-only message after that call returns. Both constraints hold at once that way: the task list ends clean and the closing message still carries zero tool calls. Never hand back with the anchor still open — a finished run reads as abandoned in the job list.<!-- /include -->

## Flags

- `--here` / `-h` — read the current repo (`Read`, `Grep`, `Glob`) so the sentence can name real components, files, and existing patterns. **Default is context-only**: no file reads at all, so `/my-command:teach` runs from any directory, including one with no repo in it.
- Anything not a recognized flag is part of the description.

## Step 1 — Place the field

Decide which field the description belongs to — domain modeling, UI motion, visual design, a business term, a workflow, something else. The field selects the source in Step 2 and nothing more. Say which field you picked in one clause, so a wrong guess is correctable before the grill starts.

## Step 2 — Name it, skills first

Resolve the description to the term a practitioner would use. Take the first source that covers the field:

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

Write one sentence in [ASD-STE100](https://asd-ste100.org) Simplified Technical English:

- **One word, one meaning, one part of speech.** A word doing two jobs in one sentence is two sentences.
- **One term per concept**, reused — never a synonym for variety.
- **Active voice.** The actor is usually the claim; the passive drops it.
- **Simple present tense.** No perfect or progressive forms.
- **No gerund as a noun.** "It springs back", not "the springing back".
- **25 words maximum.**
- **The term being taught is the only hard word in the sentence.** It is the payload; every word around it is ordinary English. Never define jargon with harder jargon.

`/my-command:truncate` and `/my-command:docs` draw their **Rewrite toward** rules from the same standard and deliberately drop these last four — STE's caps, its simple-tense restriction, and its closed dictionary — on the grounds that they serve a human reader with a limited vocabulary in the subject. That reader is exactly who `/my-command:teach` writes for, so `/my-command:teach` adopts them. Do not reconcile the two by loading `src/shared/rewrite-toward.md`; its exclusion clause is correct for a command file and wrong here.

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

**The clipboard gets the bare sentence.** No `/my-command:god`, no `/my-command:cp`, no command name, no quotes, no surrounding prose — the user pastes it wherever they want, which is usually a prompt they are already writing.

## Step 7 — Offer to save

Ask whether to save the concept. On yes, append one JSON object to `concepts.jsonl` in claude-proxy's log directory.

Resolve the path exactly as [improve](improve.md) Step 1 does — read `CLAUDE_PROXY_STORE` from the environment (`printenv CLAUDE_PROXY_STORE`), then take its parent as the log directory, because the store is `<logDir>/sessions`. **Never hardcode a path and never search the filesystem for a claude-proxy checkout.**

**Unlike `/my-command:improve`, an unresolvable store is not fatal here.** `/my-command:improve` cannot run without the proxy because the suggestions *are* the input; `/my-command:teach`'s input is the user. So when `CLAUDE_PROXY_STORE` is unset or its path is missing, the teaching still happened: keep the sentence, keep the clipboard, skip only the save, and say which of the two failed and that the concept was not recorded. Never stop the run over it.

### The record

One JSON object per line. Five fields are **required** and always written:

| Field | Type | What it holds |
| --- | --- | --- |
| `term` | string | The term Step 2 landed on. |
| `sentence` | string | The Step 4 sentence, exactly as printed and copied. |
| `field` | string | The field Step 1 placed it in. |
| `skills` | string[] | The skills this run **applied** — the ones Step 2 loaded. Never `find-skills`. |
| `savedAt` | string | ISO timestamp of the append. |

Four more are **optional**, and claude-proxy's detail page renders each one it finds:

| Field | Type | What it holds |
| --- | --- | --- |
| `notes` | string (Markdown) | The research the run did: which source named the term, what the grill settled, what the concept is *not*. |
| `tips` | string[] | Short practical pointers the run produced — how to use the term, what it is confused with, what to say instead. |
| `sources` | string[] | What you consulted: URLs, spec names, skill names, repo paths under `--here`. An entry starting with `http`/`https` is rendered as a link. |
| `surfacedSkills` | string[] | The skills Step 5 **discovered**, as against the `skills` this run applied. Never `find-skills`. |

**Omit an optional field entirely when there is nothing to record.** Never write `""` or `[]` for one: the detail page distinguishes absent from empty, and an absent field is what makes it show its "nothing more to show" fallback. Records written before these fields existed carry none of them and stay valid — nothing in `concepts.jsonl` is ever rewritten or migrated.

Append with `node` and pass every value as an argument, so no shell quoting or JSON escaping can corrupt a sentence containing quotes, backslashes, or newlines. Lists are **newline-separated**, one entry per line, because a tip or a note reliably contains a comma and never contains a newline:

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

`put` is what enforces the omit rule — an empty string and an empty list both fall through and the key is never written. Pass `""` for anything the run did not produce; do not drop the argument, or the values after it shift.

The file is append-only and one object per line, so a concurrent run can never truncate another's record.

**Why a file and not the database.** claude-proxy's SQLite database is a disposable materialized view over `logs/`, and `rm logs/claude-proxy.db && ingest` is a supported recovery. Nothing authored may live only there — which is why `suggestion-status.json` is a file too. The precedent for authored data that is still queryable is `command_run`, whose source of truth is `commands/runs.jsonl` and whose table is rebuilt from it under a watermark. `concepts.jsonl` follows that precedent, and a `concept` table ingested from it is a separate change in the claude-proxy repo. This file is the contract between the two.

## Step 8 — Close the run in a text-only turn

Two or three lines: the term, the field, whether the concept was saved. Never reprint the sentence — it is already in the reply and on the clipboard.

<!-- include-block: shared/closing-turn.md -->
**This step is never skipped and never delegated.** The run is over when this session sends **one message carrying text and zero tool calls** — not when the work lands. That is the mechanic, not a style preference: a run's outcome is recorded only from a message with no tool call in it, so a message carrying the report *and* a tool call is recorded as a decision mid-run, and a run whose last message is a tool call records no outcome at all. Make the last tool call, let it return, then reply with text alone.

- **Every exit routes here, not just the shipped one.** Finished; nothing to do; a gate still failing; a step blocked, refused, or awaiting my answer; the request abandoned as wrong. The wording changes, the closing turn does not. A run that stopped early says where it stopped and what is on the branch, and leaves `/my-command:revive <thread id>` as the recovery path when the proxy thread id is available.
- **Say it in one self-contained line first**, then any detail. Someone who never saw the request should be able to read that line alone.
- **A compaction boundary is a checkpoint, not an ending.** A recap prompt ("The user stepped away and is coming back…"), a `[SYSTEM NOTIFICATION - NOT USER INPUT]` event, or a session-continuation preamble each mean the run is still owed its turn: answer that prompt in text alone, say where the run actually stands, and restore the anchor todo item if it did not survive. A session is likeliest to die just after a compaction, so that answer is often the only outcome the run ever records.
- **Every prompt from me opens a task, and only a text-only reply closes it.** The transcript starts a new `## Task:` at each of my messages — a mid-run question, a correction, a recap prompt, a change of direction — and writes `- done:` only when a reply carries text and no tool call. So answer my message in text alone *before* returning to tool calls. A run that reads the message and keeps working straight through leaves that task, and every task before it, with no outcome line. There is no marker to type: the `- done:` line is written for you from any text-only turn, and skipped entirely from a turn that carries a tool call.
- **A subagent's report is never this turn.** The outcome belongs to the session the run started in, so after an `Agent` call returns, close the run here, in a message of your own.
- **Resolve the anchor item as the last tool call.** The todo item that held this turn open is the one thing still owed once the work lands: mark it completed, let that call return, then send the message. It is the natural final call, and it keeps the closing message free of tool calls exactly as this step requires. Handing back with it still open makes a finished run read as abandoned.
- **Do not tack the report onto the tool call before it.** `ExitWorktree`, `worktree end`, `verify`, and a closing `gh` call are exactly the calls that sit at the end of a run and swallow the outcome.
<!-- /include-block -->

## Notes

- **The sentence is the product.** Reaching it in fewer questions is good; reaching something longer, hedged, or more precise than the user can repeat from memory is a failed run.
- A sentence the user cannot say back is not shorter than the handwave they arrived with, and the run has bought them nothing.
- Never grill for detail an implementer would need. The user is learning what to ask for, not writing a spec.
