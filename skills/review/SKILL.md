---
name: review
description: Independently review an open pull request, produce actionable feedback, and apply validated findings on its existing branch.
---

# Review and Apply Feedback

Parse `--target <PR-number-or-branch>`, `--here`, and optional focus. Resolve the PR with `gh`; never approve, comment on, or merge it.

1. Unless valid here mode targets the current branch's PR, fetch and use a fresh existing-branch worktree under `.codex/worktrees/`.
2. Independently inspect the PR body, full diff, repository instructions, surrounding code, and relevant checks. Verify every finding and cover correctness, regressions, security, reliability, conventions, generated output, and docs.
3. Report concrete path-anchored findings. If findings exist, compose and execute one `$fb` request in the same PR workspace, in this session and never delegated to a subagent; if clean, say no feedback run is needed.
4. Let `$fb`/`$task` own commits, cleanup, and the PR update. Tear down the step 1
   worktree yourself, whether or not feedback ran.
   - Remove a worktree through the same mechanism that created it. One this
     session merely entered is not owned by the session worktree tool; step back
     out, then remove it through the repository helper from outside the worktree,
     which re-verifies the branch reached origin — push rather than forcing if it
     refuses. If another live session still holds it, stop and report the path as
     left in place.
5. Report the final PR state in a text-only outcome.

Use `my-command-tools state`, `verify`, and worktree operations when available.

## Closing turn

Close the run in a text-only turn: one final message carrying text and zero tool
calls, sent after the last tool call returns rather than alongside it. A run's
outcome is recorded only from a message with no tool call in it, so ending on one
— or bundling the report into one — records no outcome at all. Every ending owes
that turn, including one that stops early, is blocked or refused, or hands work
back to an invoking workflow.
