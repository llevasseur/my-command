---
name: judge
description: Judge claude-proxy's fired suggestions against the raw session transcripts they came from, confirming the ones the transcripts support with context written from what the agent was doing and dismissing the ones the rule misread, then recording both verdicts for each bucket in one call.
---

# Judge Session Suggestions

Parse `--range <spec>` and `--dry-run`. There is no free-text argument; report anything else rather than interpreting it. Read `CLAUDE_PROXY_STORE` from the environment. Its parent is the log directory the suggestion tooling reads, and the directory above that is the claude-proxy repository, confirmed by its server package manifest. Stop with an explanation when the variable is unset, the path is missing, or the repository is not there. Never search the filesystem for the checkout and never fall back to a hardcoded path.

A rule fires from counts and node positions and cannot see what the agent was doing, so it reports a real slowdown and a misread with the same confidence. This skill decides which of the two each suggestion is. It is the precondition for `$improve`, which composes criteria from confirmed suggestions only, so an unjudged bucket is one whose findings cannot become a change.

1. List the buckets that are **dirty** — complete and unjudged — within the range, as structured data. Those are the only buckets to touch. Never judge a bucket short of its full ten sessions, because its counts are still changing and a verdict recorded now describes numbers that will not exist. Never judge a bucket already marked judged, because considered notes would be overwritten with fresh guesses. If nothing in the range is dirty, stop and say so: that is the good outcome, not a failure.
2. State the read cost before reading. A bucket is roughly 55 KB of transcripts typically and about 180 KB at worst. A few buckets is an ordinary run; dozens is a backfill measured in megabytes, so name the bucket count and rough total and ask before starting. The amnesty operation draws a line under history without reading any transcript, and is the alternative to offer.
3. For each dirty bucket, list its fired suggestions with detail. Keep each suggestion's source sessions and, for each source, the node positions in that transcript that matched. Those positions are what makes a verdict better than an impression: they name the turns the rule looked at. A suggestion with no sources has nothing to check, so dismiss it as unverifiable and say that is why.
4. Read the bucket's ten transcripts in **one batched pass**. Enumerate every transcript path from the source thread ids first, then issue all of the reads together in a single turn. Never loop one read per file across ten turns — the file list arrives complete here, which is exactly what invites walking it. Read each transcript once and use the matched node positions to know which part decides the verdict, not as a reason to read it again. Reading cost is not the concern; batching is.
5. Return exactly one verdict per fired suggestion. A bucket is marked judged as a whole, so a suggestion left without a verdict is one silently accepted. **Confirmed** carries a note written from the transcript at the matched nodes: what workflow phase was running, what it was trying to do, and what the slow shape actually was. Never restate the rule's own generated detail string — it is already stored, it is arithmetic, and paraphrasing it reads as corroboration while adding no evidence. When there is genuinely nothing to add beyond what the rule said, say that plainly instead of padding. **Dismissed** names the gap between what the rule counted and what was happening: read-only calls that were a deliberate probe where each answer chose the next, one error message from two unrelated causes, a guardrail correctly refusing something, a re-read of a file another agent had just rewritten. "Looks like a false positive" is a verdict with the evidence left out.
6. Judge the suggestion, not the rule. A rule wrong in this bucket may be right in the next, and a rule wrong in every bucket is a separate finding — a defect, derived from the dismissal record and dispatched as a criterion by `$improve`. Getting each bucket's verdicts right honestly is what makes that pattern visible; dismissing a rule wholesale short-circuits it.
7. A dry run stops here, having reported the dirty buckets, the suggestions in each, and the transcripts it would read, and having recorded nothing.
8. Record each bucket's confirmations and dismissals in a **single** invocation carrying both verdict sets — not one call per suggestion, and not a confirm call followed by a dismiss call. That call is what sets the bucket's judged flag, so splitting it means a run that dies between halves leaves the bucket judged with half its verdicts missing. Check the tool's own help for the exact form for attaching a note to a confirmation and a reason to a dismissal rather than guessing it; a verdict stored without its note cannot be repaired, because the bucket will not be re-read. Verify the reported counts match what was sent, treat a shortfall as a failed bucket to be re-judged rather than a partial success, and do one bucket at a time so a failure names one bucket instead of an unknown subset.
9. Report the range read, which buckets were judged, how many suggestions were confirmed and dismissed in each, and any bucket that failed to record.

## Rules

- A dismissal is not a regression. Regressed means a dated fix did not hold; dismissed means the finding was never true. They carry opposite consequences, and conflating them escalates against something that never happened.
- A dismissal is not a deliberate skip either. A skip passes over a real finding; a dismissal says the finding is false.
- Never confirm to be safe. A confirmation is what lets a suggestion become a criterion and then a standing rule for every future session, so confirming what the transcript does not show turns a counting error into policy.
- Never dismiss to be quick. The transcripts are the only thing that can separate these, and reading them is the entire cost of this skill.
- This skill writes only to claude-proxy's own store. It creates no branch, edits no file, and makes no commit.

## Closing turn

Close the run in a text-only turn: one final message carrying text and zero tool
calls, sent after the last tool call returns rather than alongside it. A run's
outcome is recorded only from a message with no tool call in it, so ending on one
— or bundling the report into one — records no outcome at all. Every ending owes
that turn, including one that stops early, is blocked or refused, or hands work
back to an invoking workflow.

Which turn that is depends on how this run was invoked, and there are exactly
three cases. Invoked directly by the user, this is the outermost run and it
closes in a text-only turn as above. Invoked inline by another command in the
same session, as a step of that invoker's own pipeline, it hands back without
spending a text-only turn: the report and the return marker go out as text in
the same message that carries the invoker's next tool call, so the turn
continues into the invoker's next step instead of returning control to the user.
A text-only turn there ends the whole assistant turn and strands every step the
invoker still owes, which is how a live pipeline comes to read as abandoned.
Dispatched as a subagent, it closes in its own text-only turn like an outermost
run, because its final message is a report to the parent session rather than a
turn in the parent's conversation. The return marker is written exactly once in
all three cases, alone on the last line of the message that hands control back —
never weakened, deferred to a later message, or dropped because the turn
continues.

Anchor that turn before the first tool call: put "close the run in a text-only
turn" in the todo list as its own final item, because the todo list is live
session state that a compaction carries forward and this prompt is not. Resolve it in the same tool-call turn as the run's last piece of real work,
so the list is already clean when that turn returns and the only thing left
to do is speak. Never leave marking it as a call of its own after the work
ends: a run whose last scheduled action is a bookkeeping tool call ends on
that call — the mark lands every time, and the message meant to follow it
never arrives. A compaction boundary is a
checkpoint, not an ending — a recap prompt, a background-task notification, or a
session-continuation preamble each mean the run is still owed its turn, so
answer in text alone, say where the run stands, and restore the todo item if it
did not survive. Every message from the user opens a task in the same
transcript, and only a reply carrying text and no tool call closes it, so answer
a mid-run question, correction, or recap in text before returning to tool calls. A reply to another session is
not that turn either: SendMessage is a tool call, so send the reply, let it
return, then close in text alone.
