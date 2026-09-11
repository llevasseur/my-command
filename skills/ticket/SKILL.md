---
name: ticket
description: Create and move Jira work items from the repository's own Jira contract, never from values written into this skill.
---

# Ticket

Create and move Jira work items for the repository you are standing in. Every Jira fact — site,
project, board, issue types, and the two transitions this skill may fire — comes from **that
repository's own Jira contract**. This skill hardcodes no site, no project key, no issue type id,
and no transition id.

Arguments are leading flags followed by a verb and its arguments.

## Flags

- `--yes` / `-y` — skip the creation approval **and** the template question together, inferring
  the template from the diff. `$god` passes it, so an unattended run never blocks on a prompt.
- `--template <story|bug|chore|spike|technical>` — force the description template.

## Verbs

- `create [story|bug|task|chore|spike] <summary>` — create a work item. The optional word is the
  Jira issue type; omitted, the contract's default issue type is used. **Waits for an explicit
  go** unless `--yes`.
- `move <KEY> start|review` — fire the contract's start or review transition. Fires without asking.
- `link <KEY> blocks|blocked-by|relates <KEY>` — link two existing items. Always explicit.
- `show <KEY>` — read one item and report it. Reads only.
- `<KEY>` alone — the thin default: infer which move is due from the branch and the pull request,
  then fire it.

## Reading the contract

Discovery mirrors the bootstrap discovery `$task` performs. Take the first source that answers.
Run the repository's worktree bootstrap with its Jira-contract flag and parse the JSON it prints;
a repository with no bootstrap, or a bootstrap with no Jira leg, is an expected answer rather than
a failure. When nothing usable is printed, read a `## Jira` section from the repository's agent
guidance file. When neither exists the repository has no Jira: warn once, **skip all ticket work**,
record the skip in the report, and say that `$task-bootstrap` writes the contract — **without
invoking it**, because adding a tracker to a repository is its own decision.

The contract holds the site, the project key, the board, a sprint that is null or a sprint id or
the word `active`, a default issue type, a map of issue type name to id and default template, a
lifecycle map whose `start` and `review` entries each carry a transition id, a transition name,
and the target status's id and name, a `never` list of forbidden transitions each with its reason,
and a link type. **The cloud id is never pinned in the contract**: resolve it at run time from the
site, because a pinned cloud id rots silently when a site is migrated.

When the Atlassian tooling is not connected in this session, **state that ticket work is
unavailable and let the run continue.** Do not fail, do not retry, and never infer an item's state
from the branch or the pull request in place of reading it.

## Creating

Creation is the only irreversible action here, which is why it is the only one that waits.

Pick the Jira issue type from the verb's optional word, or the contract's default; a word absent
from the contract's map is a stop, and the reply lists the types the contract actually declares.
Then pick the template **by whether the change is user-visible, not by the Jira issue type** —
conflating the two is how a backend story acquires Given/When/Then about a screen nobody built.
Read the branch diff in one call and pre-fill that guess from it. Without `--yes`, show the guess
and ask; with `--yes`, take it. Render the whole ticket as text and wait for an explicit go, then
create it, set the sprint the contract asks for, and report the key and its URL. Nothing reaches
Jira before the go.

### The five templates

Baked into this skill rather than into the contract, because they govern how a ticket is written
rather than how one repository's Jira is configured. `story` for user-visible behaviour someone
asked for; `bug` for user-visible behaviour that is wrong, written as observed, expected, and
numbered repro steps; `chore` for maintenance with no behaviour change; `spike` for a question
with a timebox and an ending artifact; `technical` for an internal change a user cannot see.

Every template carries **Acceptance Criteria**, **How to Test**, and **Out of Scope**. How to Test
is the navigation needed to *reach* the criteria — where to go, what to be logged in as, what
state to start from.

Add **Testing Done** only when the run actually exercised something, and have it record what was
**not** tested as well, because a section listing only successes reads as full coverage. Never add
it speculatively and never write "N/A" into it: an absent section says the same with less noise.

Use Given/When/Then **only for user-facing behaviour that branches on state**. Never for bug repro
steps, backend cases, chores, or spikes.

A ticket carries acceptance criteria and the navigation needed to reach them, **never full test
cases** — those belong to whoever owns testing, and a ticket that inlines them goes stale the
first time the suite changes. A QA exemption is **one line in the description**, saying it is
exempt and why.

## Moving

Transitions fire without asking: they are reversible, and the contract already named them.

**Before any transition, check the workflow has not moved.** Fetch the live transitions for the
item and confirm the contract's declared transition id **and** name both still match one of them.
On any mismatch — the id gone, the name changed, or the two now naming different transitions —
stop and report a workflow change, naming what the contract declared and what Jira now offers, and
say the contract needs regenerating. Never fire the closest match: an edited workflow is one whose
meaning may have been edited.

**Refuse every transition in the contract's `never` list, even when asked for directly**, and
report the reason the contract records. No flag overrides it, and `--yes` does not touch it —
`--yes` skips a confirmation, and a refusal is not a confirmation.

The bare-key default infers one move. A pre-work status with a branch means start. Start's target
status with an open, non-draft pull request carrying the key means review. An item already in the
target status is a no-op, which is a correct answer. A branch and a pull request that disagree,
or neither implying a move, is a stop that says what was read — the default saves a word, not a
guess. A draft pull request is not review-ready.

## Linking

`blocks` and `blocked-by` use the contract's link type; the direction is the argument's. `relates`
uses the plain relates link. **The verb is explicit and nothing else here creates a link**, since
an inferred dependency is a claim about work someone else owns. `$manage` passes the dependency
graph it already builds for its waves, so a stacked unit becomes a Blocks link — one call per
edge, and no edge this skill invented.

## Attaching verification screenshots

Where a verification loop recorded a **browser** tier, its screenshots are evidence the item
should carry. The attachment route is the REST API, because the Atlassian tooling exposes none:
`POST /rest/api/3/issue/{key}/attachments`, with the **`X-Atlassian-Token: no-check`** header,
which Jira requires and without which the request is rejected as cross-site forgery, and a
multipart field named **`file`** — any other field name uploads nothing and still returns a
response.

The API token comes from the macOS Keychain. Pipe it into the HTTP client's stdin config rather
than passing it on the command line, where every process on the machine could read it. Probe for
its presence first and treat a miss as the absent case rather than an error. **When the token is
absent, attach the screenshots' location as a remote link instead** and say in the report that
they were linked rather than uploaded, and why. Never prompt for the token and never write it
anywhere.

## Composing into a task run

`$task` can weave this skill in, and in that position it is deliberately narrower. It **only ever
adopts an existing key**, read from the branch or the prompt, and **never creates**. It fires the
**start** transition when work begins and attaches the pull request to the item as a remote link
once the pull request is open. It **never fires the review transition**.

Those last two are one decision. Several task runs can feed one ticket — a fix, a follow-up, a
review round — so no single run is in a position to say the work is done. Calling development
complete is the user's judgement, so adoption stops at start and leaves review to an explicit
`move <KEY> review`.

Never block the task. A missing contract, unavailable tooling, an unresolvable key, or a refused
transition is reported, recorded, and the run continues.

## Rules

- Nothing here is repository-specific. A value written into this skill would be wrong for every
  other repository that installs it.
- Reading is always safe; creating is the one thing that waits, because it is the one thing that
  cannot be undone.
- An access error on `show` is an access answer, not a defect — report it as one.

## Closing turn

Close the run in a text-only turn: one final message carrying text and zero tool calls, sent after
the last tool call returns rather than alongside it. A run's outcome is recorded only from a
message with no tool call in it, so ending on one — or bundling the report into one — records no
outcome at all. Every ending owes that turn, including one that stops early, is blocked or
refused, or hands work back to an invoking workflow. Lead with the item and what happened to it —
the key, its URL, and the status it now holds — or with why there was no ticket work.

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

Anchor that turn before the first tool call: put "close the run in a text-only turn" in the todo
list as its own final item, because the todo list is live session state that a compaction carries
forward and this prompt is not. Resolve it in the same tool-call turn as the run's last piece of
real work, so the list is already clean when that turn returns and the only thing left to do is
speak. Never leave marking it as a call of its own after the work ends: a run whose last scheduled
action is a bookkeeping tool call ends on that call — the mark lands every time, and the message
meant to follow it never arrives. A compaction boundary is a checkpoint, not an ending — a recap
prompt, a background-task notification, or a session-continuation preamble each mean the run is
still owed its turn, so answer in text alone, say where the run stands, and restore the todo item
if it did not survive. Each side of a boundary records its own standing, because a run split
across two transcripts is two runs to the record. Every message from the user opens a task in the
same transcript, and only a reply carrying text and no tool call closes it, so answer a mid-run
question, correction, or recap in text before returning to tool calls. A reply to another session
is not that turn either: sending a message is a tool call, so send the reply, let it return, then
close in text alone.
