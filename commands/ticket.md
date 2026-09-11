---
description: Create and move Jira work items from the repo's own Jira contract — create, move, link, show, and a thin default that infers the move from branch and PR state
argument-hint: "[--yes|-y] [--template <name>] create [story|bug|task|chore|spike] <summary> | move <KEY> start|review | link <KEY> blocks|blocked-by|relates <KEY> | show <KEY> | <KEY>"
---

Create and move Jira work items for the repo you are standing in. The Jira facts — site, project,
board, issue types, and the two transitions this command is allowed to fire — come from **that
repo's own Jira contract**, never from anything written here. This command hardcodes no site, no
project key, no issue type id, and no transition id.

The `<command-args>` block above holds leading flags followed by a verb and its arguments. Parse
the flags off the front; the first remaining token is the verb.

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

- `--yes` / `-y` — skip the creation approval **and** the template question together. The
  template is inferred from the diff instead of asked for. `/my-command:god` passes this, so an unattended
  run never blocks on a prompt.
- `--template <story|bug|chore|spike|technical>` — force the description template. Without it the
  template is chosen by whether the change is user-visible (see Step 3), pre-filled from the diff.
- Anything not a recognized flag is the verb and its arguments.

## Verbs

| Form | What it does |
| :--- | :----------- |
| `create [story\|bug\|task\|chore\|spike] <summary>` | Create a work item. The optional word is the **Jira issue type**; omitted, the contract's `defaultIssueType` is used. **Waits for an explicit go** unless `--yes`. |
| `move <KEY> start\|review` | Fire the contract's `start` or `review` transition on `<KEY>`. Fires without asking. |
| `link <KEY> blocks\|blocked-by\|relates <KEY>` | Link two existing items. Always explicit — nothing else in this command infers a link. |
| `show <KEY>` | Read one item: summary, type, status, assignee, sprint, links, and the description. Reads only. |
| `<KEY>` (bare) | The thin default: infer which move is due from the branch and the PR state, then fire it. |

## Step 1 — Read the repo's Jira contract

**Discovery mirrors `/my-command:task` Step 1.5** — the repo states its own facts, and this command reads
them. Take the first source that answers:

1. **`bash scripts/bootstrap-worktree.sh --print-jira-contract`** — parse its stdout as JSON.
   The script is the same one `/my-command:task` Step 1.5 and `/my-command:verify` read, and the flag is handled ahead
   of that script's main-checkout guard, so it answers from anywhere. End the probe with
   `|| true`: a repo with no bootstrap, or a bootstrap with no Jira leg, is an expected answer
   rather than a failure.
2. **Nothing usable printed** — no script, a non-zero exit, empty stdout, or output that does not
   parse — then look for a `## Jira` section in `AGENTS.md` or `CLAUDE.md` and read the contract
   out of it.
3. **Neither exists → this repo has no Jira.** Warn once, **skip all ticket work**, record the
   skip in this run's report (and in the PR description when composed into `/my-command:task`), and say that
   `/my-command:task-bootstrap` is what writes the contract. **Do not invoke `/my-command:task-bootstrap`** — adding a
   tracker to a repo is its own decision, not a side effect of a ticket run.

### The contract

```json
{
  "site": "<your-site>.atlassian.net",
  "projectKey": "<KEY>",
  "board": 0,
  "sprint": null,
  "defaultIssueType": "<name>",
  "issueTypes": {
    "<name>": { "id": "<id>", "template": "<story|bug|chore|spike|technical>" }
  },
  "lifecycle": {
    "start":  { "transitionId": "<id>", "transitionName": "<name>", "statusId": "<id>", "statusName": "<name>" },
    "review": { "transitionId": "<id>", "transitionName": "<name>", "statusId": "<id>", "statusName": "<name>" }
  },
  "never": [
    { "transitionId": "<id>", "transitionName": "<name>", "reason": "<why this one is forbidden>" }
  ],
  "linkType": "<name>"
}
```

- `sprint` is one of three things: `null` (no sprint field is set), a sprint id, or the string
  `"active"` (resolve the board's open sprint at run time).
- `issueTypes` maps a Jira issue type **name** to its `id` and the template that type usually
  wants. The template is a default, not a rule — Step 3 picks by user-visibility and may
  override it.
- `lifecycle` carries exactly two entries, `start` and `review`, and each carries **four** facts:
  the transition id, the transition name, and the target status's id and name. Both halves are
  checked before either is used.
- `never` lists transitions this command must refuse. Each carries a reason, and the reason is
  what gets reported when one is asked for.
- **`cloudId` is not in the contract and must never be pinned there.** Resolve it at run time
  from `site`: `getAccessibleAtlassianResources`, then match the resource whose URL carries that
  site. A pinned cloud id is a value that silently rots when a site is migrated.

### When the Atlassian MCP server is not connected

Check that the Atlassian MCP tools are actually available in this session before the first Jira
call. When they are not, **state that ticket work is unavailable for this run and let the run
continue.** Do not fail the run, do not retry, and do not infer a ticket's state from the branch
or the PR in place of reading it. A composed `/my-command:task` run keeps going and reports the gap; a
standalone `/my-command:ticket` run reports it and stops there.

## Step 2 — Resolve the verb and the item

<!-- include-block: shared/batched-discovery.md -->
### Discovery runs as one batched pass

This is a step of the workflow, not a habit to recall. Run it whenever a phase of this command has to look at more than one file.

1. **Enumerate before reading.** Name every path, pattern, and read-only probe the phase needs. Where naming them takes a search — `rg --files`, `git diff --name-only`, a PR's file list — that search is the phase's first call, and its output *is* the enumeration.
2. **Send the whole enumeration in one turn.** Every `Read`, `rg`, `ls`, and read-only `git` call on that list goes out as parallel tool calls in a single assistant turn. Only a call whose arguments depend on another call's result may wait for the next turn. "I will decide what to read after this one" is not a dependency when the path was already on the list, and four or more consecutive read-only calls with no decision between them means the enumeration was skipped.
3. **Never loop per file.** One `Read` per entry of a list you already hold, or one `git diff <base> -- <path>` per path, is the shape this step exists to stop. Pass every path to a single `git diff <base>...HEAD -- <path> <path> …`, and send every `Read` as one block. Reviews and doc audits are where the loop reappears, because there the file list arrives complete and then gets walked.
4. **Read each file once.** A file already in this session's transcript is already in context, and wanting a *different* symbol from it is not a reason to read it again. Locate every symbol you now want with one `rg -n 'foo|bar' <file>`, then pull only the range you still need with numeric `offset`/`limit`. The one legitimate re-read is after the file actually changed — your own `Edit`, a hook, a formatter, a generator, or another agent — and then only the changed range.
5. **Re-establish the read-before-write precondition after a compaction.** `Edit` and `Write` reject a file this *session* has not read. Inherited context, a continuation summary, and shell output do not satisfy that precondition, even though the summary reads as though they do. So after any compaction boundary, session continuation, or hand-off into this command, treat the precondition as unmet: enumerate the files the next edit pass will write, `Read` them in one batch (a targeted `offset`/`limit` slice counts), and edit only once that batch returns. Re-running the rejected `Edit` cannot clear the error — the batched `Read` is the fix, and doing it for the whole pass at once is what stops the same rejection repeating file after file.
<!-- /include-block -->

Resolve these once, in one batch, before any verb runs:

- `my-command-tools state` — the branch, its base, and its `diffStat`. Pass `--cwd <absolute
  path>` for another checkout rather than changing directory.
- `my-command-tools prs view` — the PR for this branch, if there is one. A missing PR is an
  expected answer; end that probe with `|| true`.
- The **issue key**, where the verb needs one: taken from the verb's own argument, and otherwise
  read off the branch name, which carries it as `<PROJECT>-<number>` in any position.
- `getJiraIssue` for that key, to learn its current status before deciding anything.

A key that appears nowhere — not in the arguments, not in the branch — is a stop, not a guess.
Say which sources you looked in.

## Step 3 — `create`

**Creation is the only irreversible action this command takes**, which is why it is the only one
that waits.

1. **Pick the Jira issue type.** The word after `create`, matched against the contract's
   `issueTypes`; absent, `defaultIssueType`. A word that is not in the map is a stop — list the
   types the contract actually declares rather than inventing one.
2. **Pick the template — by whether the change is user-visible, not by the Jira issue type.**
   The two are different questions and conflating them is how a backend `Story` ends up with
   Given/When/Then about a screen nobody built. Read the branch diff in one call
   (`my-command-tools scope --diff`) and pre-fill the guess from it: a change under the app's
   user-facing surfaces is user-visible, one confined to build, tooling, schema, or internals is
   not.
   - **Without `--yes`:** show the guess and ask which template, with the guess pre-selected.
   - **With `--yes`:** take the guess and do not ask. `--template <name>` overrides either path.
3. **Render the whole ticket as text** — summary, issue type, project, sprint, and the full
   description — and **wait for an explicit go.** `--yes` skips this approval. Nothing is written
   to Jira before the go.
4. **Create it** with `createJiraIssue`, then set the sprint when the contract asks for one, and
   report the key and its URL.

### The five templates

They are baked into this command rather than into the contract, because they are about how a
ticket is written rather than about how one repo's Jira is configured. A repo that wants a
different house style changes the command, not thirty contracts.

**Every template carries these three sections, in this order:**

- **Acceptance Criteria** — what must be true for this to be done.
- **How to Test** — the navigation needed to *reach* the acceptance criteria: where to go, what
  to be logged in as, what state to start from.
- **Out of Scope** — what this ticket deliberately does not cover.

**Add a fourth, `Testing Done`, only when the run actually exercised something** — a `/my-command:verify`
loop that reached a browser or HTTP tier, a test suite that ran, a manual pass someone did. It
records what was exercised **and what was not**, because a Testing Done that lists only successes
reads as full coverage. Never add the section speculatively, and never write "N/A" into it — an
absent section says the same thing with less noise.

| Template | For | Shape |
| :------- | :-- | :---- |
| `story` | User-visible behaviour someone asked for | Context, then criteria as user-observable outcomes |
| `bug` | User-visible behaviour that is wrong | Observed, Expected, and repro **steps** — never Given/When/Then |
| `chore` | Maintenance with no behaviour change | What moves, and how you can tell nothing else did |
| `spike` | A question to be answered, not code to be shipped | The question, the timebox, and what artifact ends it |
| `technical` | Internal change a user cannot see | The interface before and after, and who consumes it |

### Given/When/Then

Use it **only for user-facing behaviour that branches on state** — where the outcome depends on
which state the user is in, and the branches are the point.

**Never use it for** bug repro steps (numbered steps say it better and are what a person follows),
backend cases, chores, or spikes. Given/When/Then on a backend change reads as ceremony and hides
the one interface fact a reader needed.

### What a ticket is not

**A ticket carries acceptance criteria and the navigation needed to reach them. It never carries
full test cases.** Test cases belong to whoever owns testing; a ticket that inlines them goes
stale the first time the suite changes and then contradicts it.

**A QA exemption is one line in the description**, saying it is exempt and why. Not a section, not
a checklist, not a label negotiation.

## Step 4 — `move`, and the bare-key default

Transitions fire **without asking**. They are reversible, the contract already named them, and an
approval prompt on every status change is what makes people stop using the tool.

### Before any transition, check the workflow has not moved

This runs on every transition, including one fired by the bare-key default and one fired in adopt
mode:

1. `getTransitionsForJiraIssue` for the key — the **live** transitions available on that item now.
2. Confirm the contract's declared transition **id and name both still match** a live transition.
3. **On any mismatch — id gone, name changed, or the two now naming different transitions — stop
   and report a workflow change.** Name what the contract declared, what Jira now offers, and say
   the contract needs regenerating with `/my-command:task-bootstrap`. Do not fire the closest match: a
   workflow that was edited is a workflow whose meaning may have been edited, and firing an
   id-matched transition under a new name is how a ticket lands in a status nobody chose.

### The `never` list is absolute

**Refuse every transition in the contract's `never` list, even when asked for directly.** Report
the transition and the reason the contract records. There is no flag that overrides it and
`--yes` does not touch it — `--yes` skips a confirmation, and a refusal is not a confirmation.

### `move <KEY> start|review`

Fire the named lifecycle transition after the check above. Confirm afterwards that the item's
status is the contract's declared `statusId`/`statusName` for that entry, and report it.

### The bare `/my-command:ticket <KEY>` default

Thin by design: infer the one move that is due from the branch and the PR, then fire it.

- Item is in a pre-work status and a branch for it exists → **`start`**.
- Item is in `start`'s target status and an **open, non-draft** PR carries its key → **`review`**.
- Item is already in the status the inferred move targets → **do nothing** and say so. A no-op is
  a correct answer here, not a failure.
- The branch and the PR disagree, or neither implies a move → **stop and say what you read**,
  rather than picking one. The default exists to save a word, not to guess.

A **draft** PR is not review-ready. Leave it at `start` and say why.

## Step 5 — `link`

`link <KEY> blocks|blocked-by|relates <KEY>` links two items that already exist.

- `blocks` / `blocked-by` use the contract's `linkType`. The direction is the argument's: in
  `link A blocks B`, A is the blocker.
- `relates` uses Jira's plain relates link.
- **The verb is explicit and nothing else in this command creates a link.** An inferred
  dependency is a claim about work someone else owns.

**`/my-command:manage` passes the dependency graph it already builds for its waves.** That graph is the one
place a dependency is already stated rather than guessed at, so a stacked unit becomes a `Blocks`
link between the two units' items — one `link` call per edge, and no edge this command invented.

## Step 6 — Attach `/my-command:verify` screenshots

When a `/my-command:verify` loop (or `/my-command:task` Step 2.6) recorded a **browser** tier, its screenshots are
evidence a reviewer of the ticket wants. Read them with `my-command-tools shots read`.

**The attachment route is the REST API**, because the MCP surface has none:

```bash
security find-generic-password -s my-command-jira -a <atlassian account email> -w | sed 's/^/user = "<atlassian account email>:/; s/$/"/' | curl --silent --show-error --fail --config - --header "X-Atlassian-Token: no-check" --form "file=@<absolute path to screenshot>" --url "https://<site>/rest/api/3/issue/<KEY>/attachments"
```

Three parts of that are not optional: the endpoint `POST /rest/api/3/issue/{key}/attachments`,
the **`X-Atlassian-Token: no-check`** header, which Jira requires on every attachment upload and
without which the request is rejected as a cross-site forgery, and the multipart field named
**`file`** — any other field name uploads nothing and still returns a response.

**The API token comes from the macOS Keychain**, under service `my-command-jira` with the
Atlassian account email as the account. Piping it into `curl --config -` keeps the token off
argv, where every process on the machine could read it, and out of this conversation. Probe for
it first — `security find-generic-password -s my-command-jira -a <email> -w >/my-command:dev/null 2>&1` —
and treat a non-zero exit as the absent case rather than an error.

**When the token is absent, fall back to a remote link.** Attach the screenshots' location to the
item as a remote link (`addTeamworkGraphContext` with
`jira-work-item-links-jira-work-item-remote-link`) and say in the report that the images were
linked rather than uploaded, and why. Never prompt for the token, and never write it anywhere.

## Composing into `/my-command:task` with `--add`

`/my-command:task -a ticket <prompt>` weaves this command into a task run. In that position it is
deliberately narrower than the standalone command:

- **It only ever adopts an existing key.** It reads the key from the branch or the prompt.
  **It never creates.**
- **It fires the `start` transition when the work begins**, after the workflow check in Step 4.
- **It attaches the PR to the item as a remote link once the PR is open.**
- **It never fires the `review` transition.**

Those last two are one decision. **Several `/my-command:task` runs can feed one ticket** — a fix, a follow-up,
a review round — so no single run is in a position to say the work is done. **Calling development
complete is the user's judgement**, so adopt mode stops at `start` and leaves `review` to an
explicit `/my-command:ticket move <KEY> review`.

Never block the task. A missing contract, an unavailable MCP server, a key that cannot be
resolved, or a refused transition is **reported, recorded, and the run continues**.

## Notes

- **Nothing here is repo-specific.** Every site, project, board, type, transition, and link type
  comes from the contract at run time. A value written into this file would be wrong for every
  other repo that installs it.
- **Reading is always safe; creating is the one thing that waits.** Edits and transitions fire on
  their own because they are reversible and already named by the contract.
- A `show` on a key you do not have access to is an access answer, not a bug — report it as such.
- <!-- include: shared/approval-own-call.md -->**A command that may need approval goes in its own Bash call** — `git fetch`, `git config`, and, as a narrow exception to the general rule to chain dependent mutations, branch-lifecycle operations such as checkout/switch, pull, remote-branch inspection, and local branch deletion. Folding one into an `&&` chain escalates approval to the whole compound command and costs a turn plus a retry. Put status output, pipes, and follow-up verification in separate read-only calls.<!-- /include -->
- <!-- include: shared/classifier-refusal.md -->A classifier refusal is not evidence that repository protections should be weakened. Inspect the refused command first; when the intended operation is safe and the refusal looks incidental to the command's shape — an over-broad chain, pipe, or extra flag — retry only the smallest exact command, never an allowlisted Bash pattern or a permission-settings change. **The remedy is always the command's form, and the two recorded shapes each have one:** a chained read-only probe (`head <file>; ls -l <dir>`) is refused as one command and succeeds when reissued as the single bare command you actually needed, so drop the chain rather than the intent — and where the probe was reading a file, `Read` answers it with no shell to judge; a heredoc composing a file is refused wholesale inside an isolated worktree, which is exactly where these runs work, so compose it with `Write` and change it with `Edit` instead of reaching for a quoting trick. **One refusal in this family is correct and stays correct:** a probe that names a `.env` file is refused because of the file, not the shape, and no smaller form of it is the fix — never rewrite it, never allowlist it, and never work around it. If you need a value from `.env`, ask me to run the command myself with `! <command>`.<!-- /include -->
- <!-- include: shared/text-only-turn.md -->Deliver that report in this run's **closing turn** — the terminal step below — rather than alongside the tool call that precedes it.<!-- /include -->

## Step 7 — Close the run in a text-only turn

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

Lead with the item and what happened to it — the key, its URL, and the status it is now in, or
the ticket that was created, or the link that was made. On a skip, lead with why there was no
ticket work: no contract in this repo, or no Atlassian MCP server connected.
