### Make the workspace here, before the subagent exists

**A dispatched unit must never be the thing that creates or enters its own worktree.** Make it at the dispatch site, one `my-command-tools worktree begin --branch <name> --bootstrap` per unit, and hand the `path` it prints to that unit as `--worktree <path>`.

The reason is the shape of a wave rather than any one agent's judgement. Siblings go out in the same turn and run concurrently, so a lesson one of them learns is unreachable to the other four — they are already past the point where it would have helped. A note in the repo's own conventions has the same problem from the other side: the unit reads it only once it has been dispatched, with the repo root as its working directory, which is precisely the state in which the worktree call it is about to make cannot succeed. Every sibling in a wave hits the same refusal at the same step, so the fix belongs to the fan-out, not to any one agent (ADR 0023).

So the dispatch site does the work rather than handing out advice. Concretely, for every unit:

- Run `worktree begin` **here**, in this turn's setup, before composing the prompt. Its `path` is what makes the handover possible at all — a unit cannot be told about a directory that does not exist yet.
- Put `--worktree <path>` in the invocation, with the path copied byte for byte from that `path` field.
- Add the line **`Work through absolute paths under that worktree. Do not create a worktree and do not call EnterWorktree.`** to the unit's prompt. A subagent's working directory is the repo root, so an absolute path is the only form that resolves for it either way.
- Keep teardown here too. The unit that did not make the worktree does not remove it; collect the wave first, then end each branch's worktree from this session.

A unit dispatched **without** `--worktree` sets its own workspace up — this is a handover, not a new precondition on the delegate.
