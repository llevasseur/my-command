---
name: diagram
description: Draw the architecture a change produces as one Mermaid diagram and attach it to that change's pull request.
---

# Diagram

Draw the architecture a change produces, as one Mermaid diagram, and put it where the change is
being reviewed. The subject is a **change**, not a repository: render the system **after** the
change and mark what the change added or moved, so a reviewer sees the shape before reading the
diff.

Arguments are leading flags followed by free text; the free text is a focus hint naming the
layer, boundary, or flow the diagram should be about.

## Flags

- `--target` / `-t <PR-number-or-branch>` — diagram that pull request, or that branch's, instead
  of the current branch's. A bare number is a PR number.
- `--kind` / `-k <flowchart|sequence|class|er|state>` — force the diagram type; otherwise it is
  chosen from the change.
- `--comment` / `-c` — post a pull-request comment instead of updating the block in the body.
- `--out` / `-o <path>` — write the diagram into that Markdown file instead of posting it.
- `--dry-run` / `-n` — render it in the reply and change nothing.

## Where the diagram goes

Always the same fenced Mermaid block wrapped in `<!-- diagram:start -->` and
`<!-- diagram:end -->` under an `## Architecture` heading, so a re-run replaces what the last run
wrote rather than stacking a copy. Resolve the destination in order and name the one you used:
the `--out` file; the reply alone under `--dry-run`; the open pull request's body (or a comment
under `--comment`); otherwise **hand the block back unattached** — this skill never opens a pull
request.

A pull-request body may hold text a human wrote. Only the marker block is yours: preserve every
other byte, and append the block when no markers exist yet.

## Steps

0. **Look for a diagramming skill before anything else**, on every run. Another installed skill
   may already own Mermaid's syntax and its diagram-type choices, and it is maintained against
   the grammar itself while step 4 below only carries the failures seen so far. Check what the
   session actually offers rather than assuming a name; a Mermaid or software-diagramming skill
   is the match, and load it before writing any Mermaid. Finding none is an expected answer, not
   a failure: say so once and follow steps 3 and 4 as written, and never install one to satisfy
   this step. Where a loaded skill and this file disagree about syntax or diagram type, the skill
   wins; where they disagree about what the diagram is *for* — one claim about one change, marked
   nodes, 5 to 20 real names, the marker block — this file wins.
1. **Resolve the subject and its diff in one batch.** `my-command-tools state` gives the branch,
   base, commits, and per-file diffstat; pass `--cwd <absolute path>` for another checkout rather
   than changing directory. Read the pull request through the GitHub CLI for its number, URL, and
   body — **a missing pull request is an expected answer**, not a failure, and falls through to
   the unattached destination. An empty diff means there is no architecture to draw: say so and
   stop.
2. **Read the change as one batched pass.** Enumerate every path first, then issue those reads
   together instead of one per turn, and read each file once — a file already in context is not
   re-read because a different symbol is now interesting. Read for structure: which modules exist
   afterwards, what calls what, where a request enters, where state is written. Follow an import
   or route registration one hop past the diff when that hop is what the new code attaches to.
3. **Decide the one claim.** Mark the nodes the change added or moved and leave untouched context
   plain. Arrows follow data or control, one direction per edge, labelled when the ends do not
   say it. Roughly 5 to 20 nodes; collapse a layer or narrow to the focus hint rather than
   exceeding it. Every node names a real module, route, table, or file — never `Component A`. One
   diagram, and say what you left out. Pick `flowchart` for a module or data-flow change,
   `sequence` when order is the point, `er` for a schema change, `class` for a type hierarchy,
   `state` for a lifecycle.
4. **Write Mermaid that renders.** GitHub shows an invalid diagram as a red error block. Quote a
   label holding brackets, parentheses, a colon, a comma, or a quote. Never use `end` as a node
   id. Keep node ids bare identifiers and put paths in labels. Use one edge-label form. Give a
   `subgraph` a quoted title. Allow no HTML beyond `<br/>`. Declare direction once, and prefer
   `LR` for a pull request's width. Mark changed nodes with a `classDef`, not with colour words
   in the label. Validate with the Mermaid CLI when it is already on PATH; when it is not,
   **do not install it** — check the diagram against these rules by inspection and say in the
   reply that it was checked rather than rendered.
5. **Attach it** to the resolved destination: rewrite only the marker block in the pull-request
   body, edit your own previous diagram comment rather than adding a second one, or edit between
   the markers in the `--out` file. Compose the body text as a file rather than an inline
   heredoc. Touch no code, no tests, and no other file; do not commit and do not push.

## Composing into a task run

`$task` can weave this skill in. After the pull request is opened is the normal position — the
diagram lands in the body in one pass. Before it, there is nothing to attach to, so the run
produces the block and hands it back for the pull-request step to include, saying plainly that
it is unattached; if the pull request is opened without it, run this skill again afterwards. It
never blocks the task: an unresolvable subject or a failed attachment is reported and the run
continues.

## Rules

- Every node comes from something actually read. A plausible box for a service the repository
  does not have is worse than no diagram, because a reviewer will believe it.
- Re-running is safe: the markers make it a replacement.
- A change with no architectural content — copy, a version bump, a comment cleanup — is a
  legitimate "nothing to draw". Say that instead of drawing two boxes.

## Closing turn

Close the run in a text-only turn: one final message carrying text and zero tool calls, sent
after the last tool call returns rather than alongside it. A run's outcome is recorded only from
a message with no tool call in it, so ending on one — or bundling the report into one — records
no outcome at all. Every ending owes that turn, including one that stops early, is blocked or
refused, or hands work back to an invoking workflow. Lead with what the diagram claims and where
it landed, or with why there was nothing to draw, and name the diagramming skill step 0 loaded or
say that none was installed.

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
speak. Never leave marking it as a call of its own after the work ends: a run whose last
scheduled action is a bookkeeping tool call ends on that call — the mark lands every time, and
the message meant to follow it never arrives. A compaction boundary is a checkpoint,
not an ending — a recap prompt, a background-task notification, or a session-continuation
preamble each mean the run is still owed its turn, so answer in text alone, say where the run
stands, and restore the todo item if it did not survive. Each side of a boundary
records its own standing, because a run split across two transcripts is two
runs to the record. Every message from the user opens a task
in the same transcript, and only a reply carrying text and no tool call closes it, so answer a
mid-run question, correction, or recap in text before returning to tool calls. A reply to another session is
not that turn either: SendMessage is a tool call, so send the reply, let it
return, then close in text alone.
