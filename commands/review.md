---
description: Spawn a fresh agent to review an open PR, produce /fb-ready structured feedback, and apply it
argument-hint: "[--here|-h] [--target|-t <PR-number-or-branch>]"
---

Review an open PR with a fresh, independent agent, then apply what it finds. The point of a **fresh** agent is that it has no prior investment in this PR's approach — it reviews the diff cold, the way an outside reviewer would.

Your input is the text in the `<command-args>` block above. Parse leading flags off the front; anything left over is extra context for the reviewer (e.g. "focus on the auth changes").

## Flags

- `--target <PR-number-or-branch>` / `-t <PR-number-or-branch>` — review this PR/branch instead of the one associated with the current branch. Anything accepted by `gh pr view <target>` works (PR number, branch name, or PR URL).
- `--here` / `-h` — review in the **current checkout**, no worktree. Only valid for the current branch's own PR (no `--target`) — reviewing another branch in place would mean checking it out over whatever's already here. If both `--target` and `--here` are given, `--target` wins: still use a fresh worktree, and say why `--here` was ignored.
- Anything else left over after flags is extra context for the reviewer, not a separate step.

## Step 1 — Resolve the target PR

- `--target` given: `gh pr view <target> --json number,headRefName,baseRefName,url,title,body` to resolve it. If `gh` can't find it, stop and tell me — do not guess a branch name.
- No `--target`: `gh pr view --json number,headRefName,baseRefName,url,title,body` for the current branch. If there's no open PR for the current branch, stop and tell me (this command reviews existing PRs, it doesn't open one).

## Step 2 — Set up the workspace

- **Default (no `--here`):** put the review in a fresh worktree on the PR's **existing** branch (no `-b`, don't create a new branch):
  1. `git fetch origin`
  2. `git worktree add .claude/worktrees/<branch> <branch>` (use the branch's last path segment for the worktree dir if the name contains slashes)
  3. `EnterWorktree` with `path: .claude/worktrees/<branch>`
- **`--here` / `-h`:** confirm the current branch (`git rev-parse --abbrev-ref HEAD`) is the PR's `headRefName`. If it isn't, stop and tell me rather than switching branches for you.

## Step 3 — Spawn the review agent

Dispatch a **fresh** agent (not a fork — it must not inherit this conversation's framing of the PR) via the `Agent` tool, working in the worktree/checkout from Step 2. Brief it with:

- PR number, title, body, base branch, head branch, and URL from Step 1.
- Task: verify the PR does what it claims, and compare it against the existing codebase for discrepancies.
  - Read the actual diff: `gh pr diff <number>` or `git diff <base>...<head>`.
  - Check the diff against the PR's own title/description — does the code match what's claimed?
  - Run whatever the repo's own verification is for the touched area (typecheck/lint/tests/build) and report failures.
  - Compare against surrounding code and this repo's own conventions (`AGENTS.md`/`CLAUDE.md`, existing patterns in touched files) for things that clash: inconsistent style, skipped repo-specific steps (e.g. a missing feature doc, an out-of-sync generated file), missed edge cases, dead code, anything the PR description doesn't mention but the diff does.
  - Fold in the extra context from `<command-args>` (if any) as additional review focus.
- Required output shape — the agent's final report MUST end with:
  1. A short bullet list of concrete findings (or a single line stating none were found).
  2. If there are findings: a fenced code block containing **exactly one** ready-to-run `/my-command:fb` line that folds every finding into a single imperative feedback request, e.g.:
     ```
     /my-command:fb fix the off-by-one in the pagination cursor at src/list.ts:42, add the missing docs/features/review.md entry, and drop the leftover console.log in src/commands/review.md
     ```
     No `--target` in that line — it's meant to run **inside this same worktree/checkout**, which is already the PR's branch.
  3. If there are no findings: state clearly that no `/my-command:fb` is needed.

## Step 4 — Report and apply

1. Show me the reviewer's findings and the `/my-command:fb` block verbatim — this is the copy-pasteable output the wish asked for, so it must be visible even though the next step also applies it.
2. If the reviewer found nothing to fix: stop here. Don't invoke `/my-command:fb` for a clean PR.
3. If the reviewer produced an `/my-command:fb` line: run it via the `Skill` tool (`skill: "fb"`, `args:` the feedback text after `/my-command:fb`). This runs inside the same worktree/checkout from Step 2, so `/my-command:fb`'s default (current branch, no `--target`) is correct — do not add `--target` yourself.
   - `/my-command:fb` wraps `/my-command:task --here`, which implements the fix, commits, then runs `/my-command:clean` and `/my-command:pr` — `/my-command:pr` updates the **same** PR (same branch, already pushed) and removes the worktree it's running in once the branch is confirmed pushed. Don't tear down the worktree yourself in this command — `/my-command:pr` at the end of that chain already does it.

## Notes

- This command never merges or approves the PR — it only reviews, then fixes what it finds. Merging is a separate, human decision.
- This command doesn't post the review as a GitHub PR comment/review (`gh pr review`) — its output is the `/my-command:fb`-ready text, both shown to me and applied locally. That's the scope the wish asked for.
- If `--here` is used and the current branch has uncommitted changes unrelated to the PR, stop and tell me rather than mixing them into the review.
