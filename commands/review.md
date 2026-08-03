---
description: Independently review an open PR, produce /fb-ready structured feedback, and apply it
argument-hint: "[--here|-h] [--target|-t <PR-number-or-branch>]"
---

Review an open PR independently, then apply what the review finds. By default, spawn a **fresh** agent so it has no prior investment in the PR's approach and reviews the diff cold. With `--here`, do the review yourself; the caller is asserting that you are already the fresh, independent agent.

Your input is the text in the `<command-args>` block above. Parse leading flags off the front; anything left over is extra context for the reviewer (e.g. "focus on the auth changes").

## Flags

- `--target <PR-number-or-branch>` / `-t <PR-number-or-branch>` — review this PR/branch instead of the one associated with the current branch. Anything accepted by `gh pr view <target>` works (PR number, branch name, or PR URL).
- `--here` / `-h` — review the current branch's own PR **yourself**, in the current checkout. Do not create a worktree and do not spawn a review agent; this mode expects that you are already running as a fresh, independent agent. It is only valid without `--target`, because reviewing another branch in place would mean checking it out over whatever is already here. If both `--target` and `--here` are given, `--target` wins: ignore `--here`, use the default fresh-worktree/fresh-agent flow, and say why.
- Anything else left over after flags is extra context for the reviewer, not a separate step.

## Step 1 — Resolve the target PR

- `--target` given: `gh pr view <target> --json number,headRefName,baseRefName,url,title,body` to resolve it. If `gh` can't find it, stop and tell me — do not guess a branch name.
- No `--target`: `gh pr view --json number,headRefName,baseRefName,url,title,body` for the current branch. If there's no open PR for the current branch, stop and tell me (this command reviews existing PRs, it doesn't open one).

## Step 2 — Set up the workspace

- **Default (no `--here`):** put the review in a fresh worktree on the PR's **existing** branch — `--existing` so the verb checks the branch out rather than creating one over the PR's work:
  1. `my-command-tools worktree begin --branch <headRefName> --existing --bootstrap` (it fetches first, and reports the `path` it created)
  2. `EnterWorktree` with that `path`
- **`--here` / `-h`:** stay in the current checkout — do not create a worktree — and confirm `my-command-tools state` reports `branch` equal to the PR's `headRefName`. If it isn't, stop and tell me rather than switching branches for you.

## Step 3 — Perform the review

- **Default:** dispatch a **fresh** agent (not a fork — it must not inherit this conversation's framing of the PR) via the `Agent` tool, working in the worktree from Step 2. Brief it with the material and rubric below.
- **`--here` / `-h`:** do **not** use the `Agent` tool. Apply the material, rubric, and required output shape below directly yourself in the current checkout. The caller chose this mode because this command is already running inside the fresh agent that should perform the independent review.

Review material:
- PR number, title, body, base branch, head branch, and URL from Step 1.
- Task: verify the PR does what it claims, and compare it against the existing codebase for discrepancies.
  - Read the actual diff: `gh pr diff <number>` or `git diff <base>...<head>`.
  - Check the diff against the PR's own title/description — does the code match what's claimed?
  - Run the repo's own verification with `my-command-tools verify` and report failures — it discovers the repo's gates itself and returns a bounded log for each one that failed.
  - Compare against surrounding code and this repo's own conventions (`AGENTS.md`/`CLAUDE.md`, existing patterns in touched files) for things that clash: inconsistent style, skipped repo-specific steps (e.g. a missing feature doc, an out-of-sync generated file), missed edge cases, dead code, anything the PR description doesn't mention but the diff does.
  - Fold in the extra context from `<command-args>` (if any) as additional review focus.
  - **Batch independent reconnaissance.** Reading the diff's files and their neighbours is independent work — issue reads, greps, and read-only exploratory shell probes as separate tool calls in one turn (parallel when possible). Never chain them with `&&` or `;`, or stitch them together with `echo` separators. One no-match or approval must not taint the other probes or cause successful ones to be retried. Only when no-match is acceptable for an individual read-only probe, end that probe with `|| true`; never suppress a corrective or state-changing command's failure. A file already read this session is already in context: re-read it only after it changed, and prefer a targeted `offset`/`limit` over the whole file.
- Required output shape — the review report MUST end with:
  1. A short bullet list of concrete findings (or a single line stating none were found).
  2. If there are findings: a fenced code block containing **exactly one** ready-to-run `/my-command:fb` line that folds every finding into a single imperative feedback request, e.g.:
     ```
     /my-command:fb fix the off-by-one in the pagination cursor at src/list.ts:42, add the missing docs/features/review.md entry, and drop the leftover console.log in src/commands/review.md
     ```
     No `--target` in that line — it's meant to run **inside this same worktree/checkout**, which is already the PR's branch.
  3. If there are no findings: state clearly that no `/my-command:fb` is needed.

## Step 4 — Report and apply

1. Show me the review findings and the `/my-command:fb` block verbatim — this is the copy-pasteable output the wish asked for, so it must be visible even though the next step also applies it. In `--here` mode, emit your own report in exactly the same shape.
2. If the review found nothing to fix: don't invoke `/my-command:fb` for a clean PR — go straight to (4).
3. If the review produced an `/my-command:fb` line: run it **inline in this session** via the `Skill` tool (`skill: "fb"`, `args:` the feedback text after `/my-command:fb`). Never dispatch `/my-command:fb` to a subagent via the `Agent` tool — the independence a subagent buys is the *reviewer's*, and Step 3 already spent it; running `/my-command:fb` here keeps the findings you just read in context. This runs inside the same worktree/checkout from Step 2, so `/my-command:fb`'s default (current branch, no `--target`) is correct — do not add `--target` yourself.
   - `/my-command:fb` wraps `/my-command:task --here`, which implements the fix, commits, then runs `/my-command:clean` and `/my-command:pr` — `/my-command:pr` updates the **same** PR (same branch, already pushed).
4. **Tear down the Step 2 worktree yourself** (default mode only — under `--here` there is no worktree, so touch nothing), whether or not `/my-command:fb` ran. `/my-command:pr` does **not** remove it: it skips teardown for any worktree its session didn't create. <!-- include: shared/worktree-ownership.md -->**Remove a worktree through the same mechanism that created it.** One created by `git worktree add` or `my-command-tools worktree begin` is not owned by the session worktree tool merely because the session later entered it via `EnterWorktree({path})` — `ExitWorktree` refuses to remove it. Step back out with `action: "keep"`, then run `my-command-tools worktree end --branch <branch>` from outside the worktree; it re-verifies the branch reached origin before removing, so push rather than forcing if it refuses. If it refuses because another live session still holds the worktree, stop and report the path as left in place — never force past a live lock. **Whatever removes the worktree, stop the processes rooted in it first.** `worktree end` now does this itself, but `ExitWorktree` does not: a dev server or watcher started inside a worktree outlives the directory, and where the repo symlinks shared state (a log directory, a database) into each worktree, the survivor keeps writing to that shared state through a path that no longer resolves — one whose reads now fail can reconcile the shared store down to empty and make the main checkout look like it has no data. Run `my-command-tools worktree reap --path <worktree path>` immediately before `ExitWorktree({action: "remove"})`, and pass `--no-reap` to `end` only when a survivor is deliberate.<!-- /include -->
5. Report the verdict, what `/my-command:fb` applied (or that the PR was clean), and the PR. <!-- include: shared/text-only-turn.md -->Deliver that report in a **text-only turn** — a final message carrying text and **zero tool calls**, sent after the last tool call returns rather than alongside it, because a run's outcome is recorded only from a message with no tool call in it: end on (or bundle the report into) a tool call and the run reads as unfinished even though the work landed. Every ending owes that turn — shipped, nothing-to-do, blocked, failed, refused, cut short, or a question back to me — and a subagent's report is never it, because the outcome belongs to the session the run started in.<!-- /include -->

## Notes

- This command never merges or approves the PR — it only reviews, then fixes what it finds. Merging is a separate, human decision.
- This command doesn't post the review as a GitHub PR comment/review (`gh pr review`) — its output is the `/my-command:fb`-ready text, both shown to me and applied locally.
- If `--here` is used and the current branch has uncommitted changes unrelated to the PR, stop and tell me rather than mixing them into the review.
