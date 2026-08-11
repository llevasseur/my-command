---
name: improve
description: Turn claude-proxy session suggestions into implemented, evidence-backed workflow improvements — judge every unjudged bucket against its transcripts first, compose criteria from confirmed findings only, escalate suggestions whose previous fix did not hold, dispatch defective rules back at claude-proxy, and mark only shipped work done.
---

# Improve Agent Workflows

Parse `--range <spec>`, `--regressed`, `--dry-run`, task workspace flags, and optional scope. Read `CLAUDE_PROXY_STORE`; its parent log directory and repository define the suggestions CLI. Stop rather than guessing when the variable or checkout is unavailable.

**This workflow is advice only.** It reads the suggestions store and nothing else. The ideas a human accepted are built by `$work`, which owns the ideas ledger end to end — this workflow never reads it, never claims an idea, and never marks one. No flag here selects an idea, and none makes this workflow do that one's job.

A rule firing is not the same as something having gone wrong, so nothing composed here comes from unjudged rule output. Criteria come from **confirmed** suggestions only, and step 2 is what makes them confirmed. Judging is a precondition of composing: a run that composes no criterion has no unjudged output for a verdict to guard.

1. List pending suggestions for the selected buckets as structured data. Keep each row's recurrence state and its resolved claim, which names the bucket, date, and note of the fix already applied to that rule. Group duplicates by underlying rule while retaining evidence and source sessions.
2. Identify the **dirty** buckets in the range — complete and unjudged — and judge them with `$judge` before composing any criteria, then re-read the suggestions so they carry their verdicts. If none are dirty, every bucket already has verdicts and this step is done. Two hard limits. **A failed judge run stops the command**: an errored call, a bucket recording fewer verdicts than it had fired suggestions, or a judge run that could not finish means stopping and bringing the user in — never fall back to composing criteria from unjudged output, because the dirty flag is the record that nobody has checked and a silent fallback makes a failed judge run indistinguishable from a clean bill of health. **And cap it at five buckets**: more than five dirty buckets in the range means stopping and telling the user to narrow the range or run an explicit amnesty backfill, since the default range is every bucket and an uncapped first run reads megabytes of transcript before composing a single criterion. A dry run does not skip this step — judging records verdicts about transcripts rather than claims that a fix shipped, and criteria are only worth reporting if they came from confirmed findings.
3. Compose from confirmed rows only. **A dismissed row is excluded entirely** — not as a weaker criterion and not as a note on another one, because a dismissal is a verdict that the finding was never true. Where a confirmed row carries a judge enrichment note, **that note is the criterion's reason**: it was written from the transcripts by an agent that read the nodes the rule pointed at, which makes it better evidence than the rule's generated detail string. Where such a note says there was nothing to add beyond that detail, use the detail.
4. Split the remaining rows by recurrence. A regressed row means a dated fix already shipped for that rule and later sessions tripped it anyway; it forms a separate criteria block that leads the brief. Status alone cannot make this split, because a regressed row is still pending. A mixed row spans the fix date and proves nothing, so it stays an ordinary finding. `--regressed` narrows the run to the regression block alone.
5. For every regressed row, read the prior fix named in its resolved note, including when that note points at another repository. Record the files it changed and what it changed, then classify its mechanism on this ladder: prose rule in a repository instruction file; step written into the workflow that needs it; mechanical gate such as a hook, script, verification check, or changed default; removal of the affordance itself. Require the new fix to climb at least one rung, and forbid restating the previous rule at the same rung. A regressed row whose prior fix cannot be recovered has nothing to differ from, so treat it as an ordinary finding. A dismissed row never enters this track: regressed means a dated fix did not hold, dismissed means there was never anything to fix, and escalating a rung against a finding that was never true builds a gate to prevent something that did not happen.
6. Recheck every suggestion against current source and repository history. Drop obsolete or already-fixed findings and never invent improvements not supported by evidence.
7. Compose the remaining set into precise task criteria, naming the repository each change lands in. Dry run reports buckets, evidence, prior fixes with their rungs, and criteria without editing or marking.

   Ask the tooling which rules it reports as **defective** — a rule that keeps firing on things the transcripts do not support is a defect in claude-proxy's own rule code, not noise to dismiss bucket after bucket forever. Dispatch each one as an ordinary criterion against the claude-proxy checkout's suggestions rule module, naming the buckets it was dismissed in and the dismissal reasons themselves as evidence: those reasons say what the rule counted versus what was happening, and that gap is the specification for the fix. Ask for the match to narrow so the dismissed cases stop firing without silencing the confirmed ones in the same buckets. This needs no new dispatch machinery, since the dispatch step already runs one subagent per repository and claude-proxy is one of those repositories. A suggestion whose fix belongs to claude-proxy's dashboard or recurrence model rather than its rule code still stays pending and is reported as out of scope.

8. Group criteria by target repository and invoke `$task` once per repository with that repository's criteria, one invocation at a time with each result read before the next, since those briefs may reference each other across the escalation ladder. Most runs target one repository; the ladder makes more than one possible, because the rung that answers a regression often lives in a different checkout than the rule that failed. Give every invocation its explicit checkout path as the working directory and the forwarded workspace flags.
9. From each task result and pull request, map only actually shipped criteria back to suggestion IDs. Mark those `done`; leave dropped, deferred, or failed items pending. Never mark a dismissed suggestion at all — done would claim a fix that does not exist, and a deliberate skip would record a real finding deferred. A criterion whose fix spanned repositories is marked only after every one of them has landed. For a suggestion that had regressed, the note records the attempt number, the rungs climbed from and to, the new pull request, and the prior one it supersedes, because the stored claim keeps only the most recent fix. **Never mark anything in the ideas ledger from here**: that store belongs to `$work`, a suggestion ID is a bucket-and-id rather than a slug, and a run that writes to it is recording a claim about work it did not do.
10. Report implemented, already satisfied, deferred, and still-pending suggestions; which buckets were judged with how many confirmed versus dismissed; any defective rule dispatched; how many were regressed; and the pull request for each repository.

## Closing turn

Close the run in a text-only turn: one final message carrying text and zero tool
calls, sent after the last tool call returns rather than alongside it. A run's
outcome is recorded only from a message with no tool call in it, so ending on one
— or bundling the report into one — records no outcome at all. Every ending owes
that turn, including one that stops early, is blocked or refused, or hands work
back to an invoking workflow.

Anchor that turn before the first tool call: put "close the run in a text-only
turn" in the todo list as its own final item, because the todo list is live
session state that a compaction carries forward and this prompt is not. Resolve it in the same tool-call turn as the run's last piece of real work,
so the list is already clean when that turn returns and the only thing left
to do is speak. Never leave marking it as a call of its own after the work
ends: a run whose last scheduled action is a bookkeeping tool call ends on
that call — the mark lands every time, and the message meant to follow it
never arrives. A
compaction boundary is a checkpoint, not an ending — a recap prompt, a
background-task notification, or a session-continuation preamble each mean the
run is still owed its turn, so answer in text alone, say where the run stands,
and restore the todo item if it did not survive. Each side of a boundary
records its own standing, because a run split across two transcripts is two
runs to the record. Every message from the
user opens a task in the same transcript, and only a reply carrying text
and no tool call closes it, so answer a mid-run question, correction, or
recap in text before returning to tool calls. A reply to another session is
not that turn either: SendMessage is a tool call, so send the reply, let it
return, then close in text alone.
