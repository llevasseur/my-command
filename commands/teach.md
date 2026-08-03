---
description: Learn the real name for something you can only describe, then leave with one Simplified Technical English sentence you can say back to any agent
argument-hint: "[--here|-h] <description of the thing you cannot name>"
allowed-tools: Bash, Read, Grep, Glob, Skill
---

You can describe it but you cannot name it, so every prompt you write about it lands next to the thing you meant instead of on it. This command ends with **one sentence you can say back** — the concept reduced to its root, in words plain enough that nobody has to look anything up. The sentence is the whole deliverable.

Input is the text in the `<command-args>` block above — your description, however vague. Parse leading flags off the front; everything else is the description.

**Teach, never build.** No implementation, no PR, and no invocation of another command on the user's behalf. The user leaves with vocabulary.

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

Invoke the `find-skills` skill for public skills that already encode this field. The point is inheritance: a skill someone else already tuned beats relearning the field one term at a time. List what it finds, or say plainly that nothing public covers this. **Never install anything** — surface the options and stop.

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

Append with `node` and pass every value as an argument, so no shell quoting or JSON escaping can corrupt a sentence containing quotes, backslashes, or newlines:

```bash
node -e 'const fs=require("fs"),[f,term,sentence,field,skills]=process.argv.slice(1);fs.appendFileSync(f,JSON.stringify({term,sentence,field,skills:skills?skills.split(","):[],savedAt:new Date().toISOString()})+"\n")' \
  "<logDir>/concepts.jsonl" "<term>" "<sentence>" "<field>" "<comma-separated skills>"
```

The file is append-only and one object per line, so a concurrent run can never truncate another's record.

**Why a file and not the database.** claude-proxy's SQLite database is a disposable materialized view over `logs/`, and `rm logs/claude-proxy.db && ingest` is a supported recovery. Nothing authored may live only there — which is why `suggestion-status.json` is a file too. The precedent for authored data that is still queryable is `command_run`, whose source of truth is `commands/runs.jsonl` and whose table is rebuilt from it under a watermark. `concepts.jsonl` follows that precedent, and a `concept` table ingested from it is a separate change in the claude-proxy repo. This file is the contract between the two.

## Step 8 — Close the run in a text-only turn

Two or three lines: the term, the field, whether the concept was saved. Never reprint the sentence — it is already in the reply and on the clipboard. <!-- include: shared/text-only-turn.md -->Deliver that report in a **text-only turn** — a final message carrying text and **zero tool calls**, sent after the last tool call returns rather than alongside it, because a run's outcome is recorded only from a message with no tool call in it: end on (or bundle the report into) a tool call and the run reads as unfinished even though the work landed. Every ending owes that turn — shipped, nothing-to-do, blocked, failed, refused, cut short, or a question back to me — and a subagent's report is never it, because the outcome belongs to the session the run started in.<!-- /include -->

## Notes

- **The sentence is the product.** Reaching it in fewer questions is good; reaching something longer, hedged, or more precise than the user can repeat from memory is a failed run.
- A sentence the user cannot say back is not shorter than the handwave they arrived with, and the run has bought them nothing.
- Never grill for detail an implementer would need. The user is learning what to ask for, not writing a spec.
