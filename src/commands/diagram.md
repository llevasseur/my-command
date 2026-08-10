---
description: Draw the architecture a change produces as a Mermaid diagram and attach it to that change's PR
argument-hint: "[-t <pr|branch>] [-k <kind>] [-c] [-o <path>] [-n] [what to focus on]"
allowed-tools: Bash(git:*), Bash(gh:*), Bash(my-command-tools:*), Bash(mmdc:*), Read, Edit, Write, Grep, Glob, Skill
---

Draw the architecture that a change produces, as one Mermaid diagram, and put it where the
change is being reviewed. The subject is a **change**, not a repository: the diagram exists so
a reviewer can see the shape of the thing before reading the diff, so it renders the system
**after** the change and marks what the change added or moved.

The `<command-args>` block above holds leading flags followed by free text. The free text, when
present, is a focus hint — the layer, boundary, or flow the diagram should be about.

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

- `--target` / `-t <PR-number-or-branch>` — diagram that PR (or that branch's PR) instead of the
  current branch's. A bare number is a PR number; anything else is a branch name.
- `--kind` / `-k <flowchart|sequence|class|er|state>` — force the diagram type. Default is
  chosen from the change itself (Step 3).
- `--comment` / `-c` — post the diagram as a new PR comment instead of updating the block in the
  PR body. Use when the body is owned by a template you should not touch.
- `--out` / `-o <path>` — write the diagram into the Markdown file at `<path>` instead of
  posting it to GitHub. Creates the file when it does not exist; otherwise replaces the block
  between the markers and leaves the rest alone.
- `--dry-run` / `-n` — render the diagram in the reply and change nothing: no PR edit, no
  comment, no file write.
- Anything not a recognized flag is the focus hint.

## Where the diagram goes

The block is always the same fenced Mermaid diagram wrapped in markers, so a re-run replaces
what the last run wrote instead of stacking a second copy:

````markdown
## Architecture

<!-- diagram:start -->
```mermaid
…
```
<!-- diagram:end -->
````

Resolve the destination in this order, and say which one you used:

1. `--out <path>` given → the file. Nothing is posted to GitHub.
2. `--dry-run` given → the reply only.
3. An open PR exists for the subject → its body (or a new comment under `--comment`).
4. No PR exists yet → **hand the block back rather than creating one.** `/diagram` never opens
   a PR. Print the block, say it is unattached, and name the PR-opening step that should carry
   it — this is the case `--add` produces, and Step 6 covers it.

Editing a PR body means rewriting text a human may have written. **Only the marker block is
yours**: preserve every other byte of the body, and when the body has no markers yet, append
the block at the end rather than rearranging what is there.

## Step 0 — Load the diagramming skill first

Run this before Step 1, on every run, including `--dry-run`.

A skill installed on this device may already own the Mermaid syntax and the type-selection rules
this command otherwise applies by hand. Loading it costs one call, and it outranks the summaries
in Steps 3 and 4: a skill is maintained against Mermaid's own grammar, while those lists only
carry the failures seen so far.

1. **Look for one.** Check the skills available in this session for one covering Mermaid or
   software diagramming. `mermaid-diagrams` is the one that normally covers it, and it ships a
   `references/` directory with per-diagram-type syntax. Judge by what the listing actually
   offers, never by a name you expect to be there.
2. **Load the match with the `Skill` tool** before writing any Mermaid, and name the skill you
   loaded in the closing report.
3. **A miss is an expected answer**, not a failure. When no installed skill covers diagramming,
   say so once and apply Steps 3 and 4 as written. Never install a skill to satisfy this step.

Where a loaded skill and this file disagree about **syntax or diagram-type choice**, the skill
wins. Where they disagree about what the diagram is *for* — one claim about one change, marked
nodes, 5–20 real names, the marker block — this file wins, because those rules are about the
review rather than about Mermaid.

## Step 1 — Resolve the subject and its diff

One batch, not a sequence of probes:

- `my-command-tools state` — the branch, its base, its `commits`, and the per-file `diffStat`.
  Pass `--cwd <absolute path>` when the repo is not the session's cwd; never `cd` into it.
- `gh pr view <target> --json number,url,title,body,headRefName,baseRefName,state` — omit
  `<target>` for the current branch. **A missing PR is an expected answer here**, not a failure:
  end that probe with `|| true` and fall through to destination 4.
- `git diff --stat <base>...HEAD` for the file list when there is no PR to read it from.

The subject is the diff between the base and the head, plus the code that diff touches. A file
the change did not touch still belongs on the diagram when it is what the change plugs into —
the diagram is of the architecture, not of the diff.

Stop and say so, rather than guessing, when the subject resolves to an empty diff: there is no
architecture to draw for a change that made none.

## Step 2 — Read the change

<!-- include-block: shared/batched-discovery.md -->
### Discovery runs as one batched pass

This is a step of the workflow, not a habit to recall. Run it whenever a phase of this command has to look at more than one file.

1. **Enumerate before reading.** Name every path, pattern, and read-only probe the phase needs. Where naming them takes a search — `rg --files`, `git diff --name-only`, a PR's file list — that search is the phase's first call, and its output *is* the enumeration.
2. **Send the whole enumeration in one turn.** Every `Read`, `rg`, `ls`, and read-only `git` call on that list goes out as parallel tool calls in a single assistant turn. Only a call whose arguments depend on another call's result may wait for the next turn. "I will decide what to read after this one" is not a dependency when the path was already on the list, and four or more consecutive read-only calls with no decision between them means the enumeration was skipped.
3. **Never loop per file.** One `Read` per entry of a list you already hold, or one `git diff <base> -- <path>` per path, is the shape this step exists to stop. Pass every path to a single `git diff <base>...HEAD -- <path> <path> …`, and send every `Read` as one block. Reviews and doc audits are where the loop reappears, because there the file list arrives complete and then gets walked.
4. **Read each file once.** A file already in this session's transcript is already in context, and wanting a *different* symbol from it is not a reason to read it again. Locate every symbol you now want with one `rg -n 'foo|bar' <file>`, then pull only the range you still need with numeric `offset`/`limit`. The one legitimate re-read is after the file actually changed — your own `Edit`, a hook, a formatter, a generator, or another agent — and then only the changed range.
5. **Re-establish the read-before-write precondition after a compaction.** `Edit` and `Write` reject a file this *session* has not read. Inherited context, a continuation summary, and shell output do not satisfy that precondition, even though the summary reads as though they do. So after any compaction boundary, session continuation, or hand-off into this command, treat the precondition as unmet: enumerate the files the next edit pass will write, `Read` them in one batch (a targeted `offset`/`limit` slice counts), and edit only once that batch returns. Re-running the rejected `Edit` cannot clear the error — the batched `Read` is the fix, and doing it for the whole pass at once is what stops the same rejection repeating file after file.
<!-- /include-block -->

Read for structure, not for review: which modules exist afterwards, what calls what, where a
request enters, where state is written, which boundary the change moved. Follow an import or a
route registration one hop past the diff when that hop is what the new code attaches to; do not
walk the whole graph.

## Step 3 — Decide what the diagram claims

A diagram that redraws the repository is worth nothing. Pick the one claim a reviewer needs and
draw that:

- **What changed shape.** A node the change added, a call that now goes somewhere else, a
  boundary that moved. Mark those nodes; leave the untouched context plain.
- **Direction.** Arrows follow data or control, one direction per edge, labelled when the label
  is not obvious from the two ends.
- **Scale.** Roughly 5–20 nodes. Over that, the diagram is a map nobody reads — collapse a layer
  into one node, or narrow to the focus hint.
- **Names are real.** A node is a module, route, table, service, or command that exists by that
  name — `server/src/api.ts`, `/api/sessions`, `suggestion-status.json`. Never `Component A`.
- **One diagram.** Not a set. If the change genuinely spans two unrelated flows, diagram the one
  the focus hint names, and say in the reply what you left out.

Pick the kind from the change unless `--kind` forced one:

- `flowchart` — the default, and right for a module/data-flow change.
- `sequence` — a request/response or multi-actor protocol change, where **order** is the point.
- `er` — a schema or persistence change.
- `class` — a type/interface hierarchy change.
- `state` — a lifecycle or status-machine change.

## Step 4 — Write Mermaid that renders

GitHub renders an invalid diagram as a red error block in the PR, so syntax is not a detail.
Write to the skill Step 0 loaded where there was one; the list below is what this command knows
on its own, and it is the whole of the rule only when Step 0 found nothing. The forms that break
most often:

- **Quote any label holding `(`, `)`, `[`, `]`, `{`, `}`, `:`, `,`, `#`, or `"`** —
  `A["parse(args)"]`, never `A[parse(args)]`.
- **`end` is reserved.** Never use it as a node id; `subgraph` blocks close with it.
- **Node ids are bare identifiers** — no slashes, dots, or spaces. Put the path in the label:
  `api["server/src/api.ts"]`.
- **Edge labels** are `A -->|writes| B` or `A -- writes --> B`, not both forms mixed.
- **`subgraph` needs a quoted title** when the title has spaces: `subgraph "HTTP layer"`.
- **No HTML** beyond `<br/>` for a line break.
- **Direction is declared once**: `flowchart LR` (or `TD`). `LR` reads better in a PR's width.
- A `sequenceDiagram` uses `participant`/`->>`, and none of the flowchart forms above.

Mark what the change touched with a class rather than colour words in the label:

```mermaid
flowchart LR
  classDef added stroke-width:2px,stroke-dasharray:0,stroke:#2da44e
  …
  class newNode added
```

Validate before attaching. `mmdc --input <file> --output <file>.svg` when `mmdc` is on PATH
(`command -v mmdc` — a miss is an expected answer, not a failure). When it is not installed,
**do not install it**: re-read the diagram against the list above instead, and say in the reply
that it was checked by inspection rather than rendered.

## Step 5 — Attach it

Per the destination resolved above.

- **PR body.** Read the current body from Step 1's `gh pr view` output, replace the text between
  the markers (or append the whole block when they are absent), and write it back with
  `gh pr edit <number> --body-file <path>` — compose the file with the `Write` tool, never a
  heredoc. <!-- include: shared/gh-identity.md -->This device is logged in as more than one GitHub account, and `gh`'s GraphQL-backed writes (`gh pr create`, `gh pr edit`) authenticate as whichever one is active — so on a repo owned by another of them GitHub answers `must be a collaborator`. That is the wrong identity, not a permission to request, and the right account is not a guess: it is the remote's owner. `my-command-tools pr` resolves it internally and reports the `identity` that worked, so nothing extra is needed there. For any other `gh` write, ask the toolkit — `my-command-tools identity` names the `owner`, the `active` account, and the one plain `select` command, and `my-command-tools identity --select` runs it. **Never compose `GH_TOKEN="$(gh auth token --user <login>)" <command>`**: an assignment wrapping a command substitution is refused on shape, and it guesses at a login the remote already states.<!-- /include -->
- **Comment** (`--comment`). `gh pr comment <number> --body-file <path>`. A comment cannot be
  replaced in place, so on a re-run edit your own previous diagram comment
  (`gh pr comment --edit-last`) rather than adding another.
- **File** (`--out`). `Read` the target first when it exists, then `Edit` between the markers.
  A new file gets the heading plus the block and nothing else.
- **Dry run** (`--dry-run`). Nothing is written.

Never touch code, tests, or any file other than the `--out` target. `/diagram` does not commit
and does not push; a run inside `/task` leaves that to `/task`.

## Step 6 — Composing into `/task` with `--add`

`/task -a diagram <prompt>` weaves this command into a task run, and there are only two
positions worth using:

- **After `/pr`** — the normal one. The PR exists, so the diagram lands in its body in one pass:
  `/task -a diagram once the PR is open, diagram the new ingest path <criteria>`.
- **Before `/pr`** — the pre-PR case. There is no PR to attach to, so this run produces the
  block and hands it back for `/pr` to include in the description it writes. Say plainly that
  the block is unattached and must be carried into the PR body; if `/pr` opens the PR without
  it, run `/diagram` again afterwards, which attaches it to the now-existing PR.

Either way `/diagram` opens nothing, commits nothing, and never blocks the task: a subject that
cannot be resolved or a diagram that cannot be attached is reported, and the task run continues.

## Notes

- **The diagram is a claim about the code, so it must be true.** Every node comes from something
  read in Step 2. A plausible-looking box for a service the repo does not have is worse than no
  diagram, because a reviewer will believe it.
- Re-running is safe and expected — the markers make it a replacement, never an append.
- A subject with no architectural content (a copy change, a version bump, a comment cleanup) is
  a legitimate "nothing to draw". Say that instead of drawing a diagram of two boxes.
- <!-- include: shared/classifier-refusal.md -->A classifier refusal is not evidence that repository protections should be weakened. Inspect the refused command first; when the intended operation is safe and the refusal looks incidental to the command's shape — an over-broad chain, pipe, or extra flag — retry only the smallest exact command, never an allowlisted Bash pattern or a permission-settings change.<!-- /include -->
- <!-- include: shared/text-only-turn.md -->Deliver that report in this run's **closing turn** — the terminal step below — rather than alongside the tool call that precedes it.<!-- /include -->

## Step 7 — Close the run in a text-only turn

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

Lead with what the diagram claims and where it landed — PR number and URL, the file path, or
"unattached, handed to `/pr`" — or with why there was nothing to draw. Name the skill Step 0
loaded, or say that no installed skill covered diagramming.
