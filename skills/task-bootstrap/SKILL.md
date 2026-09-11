---
name: task-bootstrap
description: Create or update a repository-local bootstrap, and its run contract, for safe, reproducible task worktrees.
---

# Worktree Bootstrap

Parse `--here`, `--base <branch>`, `--draft`, and stack notes. Follow `$task` workspace rules and inspect an existing bootstrap before creating anything.

1. Detect package management, monorepo layout, ignored environment files, generators, repository shell conventions, changelog policy, and the app's boot script, health endpoint, and route directories. Detect Jira **signal** too, and only signal: the Atlassian tooling connected in this session, a Jira URL in the README, or issue keys in branch names. None of the three means the repository has no Jira, which is a complete answer.
2. Ask one focused round only for details that cannot be discovered. Then ask a second round for the run contract: boot command, health probe URL, seeded dev login, and a map of source globs to routes. State when asking that the login is used only against a localhost URL the verification run itself booted. A repository with no app to boot records that and emits no contract; never invent a boot command to fill the field.
   - **Ask a third round for the Jira contract only where step 1 saw signal**, and never ask a repository whether it uses Jira when nothing in it says so. **Query Jira for the facts rather than asking them to be recited**: resolve the accessible sites and the project, read the project's issue types for their names and ids, and read the live transitions from one real issue in the project. Record for `start` and for `review` the transition id, the transition name, **and** the target status's id and name — all four, because `$ticket` checks the declared name and id against the live workflow before firing and confirms the status afterwards. Ask which transitions are forbidden and why, then the board, the sprint (null, a sprint id, or `active`), the default issue type, and the blocking link type, and map each issue type to a default template. **Never write a cloud id into the contract**: it is resolved at run time from the site, so a site migration cannot leave a pinned id pointing at the wrong tenant. This leg is **additive and re-runnable** — a repository that already has a bootstrap gains only the Jira contract, and an existing Jira contract is updated in place.
3. Create or update tracked `scripts/bootstrap-worktree.sh` and optional `AGENTS.md`/`CLAUDE.md` guidance. Make it portable: discover the main checkout via git common-dir, refuse to run there, link only ignored existing environment files without overwriting, install in the worktree, and regenerate from worktree-owned inputs. Give it a `--print-verify-contract` flag that prints `{boot, health, login, routes}` as JSON on stdout and exits, handled ahead of the main-checkout refusal so a caller with no worktree can still read it. Omitting the flag is allowed: a verification run then falls through to detection, reading a dev, start, or preview script and taking the real bound port from the startup log. Where the third round produced a Jira contract, give it a `--print-jira-contract` flag on the same terms, handled alongside the first one and ahead of the refusal, printing the site, project key, board, sprint, default issue type, issue types, lifecycle, forbidden transitions, and link type — and no cloud id. A repository with no Jira omits the flag and `$ticket` skips.
4. Verify syntax, rerun safety, target selection, environment linking, and main-checkout refusal. Where a contract is emitted, verify the flag prints parsable JSON from the main checkout as well as from a worktree. Verify a Jira contract the same way, and confirm its JSON carries no cloud id.
5. Add required changelog work, commit only scoped files, run `$clean`, commit whatever cleanup it leaves uncommitted, then invoke `$pr`, forwarding `--draft`. `1Password: failed to fill whole buffer` with `fatal: failed to write commit object` is an unapproved signing prompt, not a repository problem: the commit did not happen and the tree is untouched. Retry the same commit once after the prompt is approved. Never rewrite the commit, pass `--no-gpg-sign`, or change the repo's signing configuration to get around it.
   - Remove a worktree through the same mechanism that created it. One this
     session merely entered is not owned by the session worktree tool; step back
     out, then remove it through the repository helper from outside the worktree,
     which re-verifies the branch reached origin. If another live session still
     holds it, stop and report the path as left in place.

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
