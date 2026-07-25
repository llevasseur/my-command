---
description: Take a task all the way to merged — run /task (with /review woven in), resolve conflicts with /mc, wait for CI, merge the PR into main, and pull main. No human in the loop.
argument-hint: "[--here|-h] [--base <branch>] [--add|-a <list>] [--squash|--merge|--rebase] [--auto] [--fix <n>] [--no-review] <task criteria>"
---

Take a task from a plain-language description all the way to **merged into `main`** — no human in the loop. This is `/task` plus the last mile: `/task` opens and reviews the PR, then this command gets that PR green, merges it, and pulls the new `main` down locally.

The task is the text in the `<command-args>` block above. Parse leading flags off the front; everything else is the **task criteria**, handed to `/task` verbatim.

**Announce at start**: the criteria, the merge method, whether review is woven in, and that this run will merge to `main` without asking again. Invoking `/god` is standing permission to merge this run's own PR — do not stop to confirm the merge.

## Flags

Forwarded to `/task` untouched:

- `--here` / `-h` — no worktree; work on the current branch.
- `--base <branch>` — branch off `<branch>` instead of `main`.
- `--add` / `-a <list>` — extra commands to weave into the `/task` run. This command appends its own `review` entry to whatever list you pass (see Step 2).

Owned by this command:

- `--squash` / `--merge` / `--rebase` — the method handed to `gh pr merge`. Mutually exclusive; if more than one is given, stop and ask which. Default: `--squash`.
- `--auto` — don't wait on CI. Enable GitHub auto-merge (`gh pr merge --auto`) so the PR lands whenever its required checks pass, and finish without waiting. The final `main` pull is skipped, and the report says the merge is queued rather than landed.
- `--fix <n>` — how many auto-repair rounds to spend on red CI before giving up. Default: `1`. `--fix 0` disables repair — a red PR ends the run.
- `--no-review` — don't weave `/review` into the `/task` run.
- `--draft` / `-d` is **rejected**: a draft PR can't be merged, so it contradicts this command. Stop and tell me to use `/task -d` instead.
- Anything not a recognized flag is part of the task criteria.

## Step 1 — Preconditions

1. Confirm you are inside a git repo (`git rev-parse --is-inside-work-tree`) and `gh` is authenticated (`gh auth status`). If not, stop.
2. Record the starting branch (`START_BRANCH=$(git rev-parse --abbrev-ref HEAD)`) and the **main checkout path** (`git rev-parse --path-format=absolute --git-common-dir`, minus `/.git`) — Step 7 pulls `main` there, and by then `/task` may have torn down the worktree this started in.
3. Identify the default branch: `git remote show origin | sed -n 's/.*HEAD branch: //p'`. Call it `MAIN`; `main` below is shorthand for it.
4. If the criteria are too vague to act on, ask one focused clarifying question now — before `/task` spins up a worktree. This is the **only** point in the run where a question is allowed.

## Step 2 — Run `/task`, with `/review` woven in

Invoke `/task` with the forwarded flags and the criteria, and let it own the whole branch → implement → verify → `/clean` → `/pr` → teardown pipeline. Do not re-implement any of it here.

Unless `--no-review` was given, append this entry to `/task`'s `--add` list (after any entries I passed, so mine keep their order):

```
review after /pr has opened or updated the PR, run /review --here in that same subagent before any teardown, and resolve its outcome there too — show the findings and the /fb block verbatim, then, if it emitted an /fb line, run that line yourself in this same subagent so the PR is review-clean before it is merged; if the reviewer signed off with no findings, that is the finished state — run no /fb and return. Either way, do not hand the /fb line back to the parent to run.
```

Why `--here` and why "same subagent": `/task`'s step 3 runs `/clean` then `/pr` in one subagent and tells it **not** to tear down the worktree, so that subagent is still sitting on the PR's branch with the PR already pushed — exactly what `/review --here` needs. A `--target` there would nest a second worktree for the branch it is already in. `/review`'s own `/fb` chain re-enters `/task --here` and updates the same PR.

**Both review outcomes terminate inside that subagent** — this is `/review`'s own step 4, not something this command adds. Findings → it runs the `/fb` line itself via the `Skill` tool and the PR is updated in place; a clean review ("LGTM", no findings) → it stops without invoking `/fb`, which is a complete result, not a missing step. Nothing about the review comes back to this command as pending work: by the time `/task` returns, the PR is either already review-clean or was never dirty. Step 3 picks up from there.

Then:

- **If `/task` reports no changes and no PR** (its criteria were already satisfied), there is nothing to merge. Skip to Step 8 and report that — do not open a PR, do not touch `main`.
- **Otherwise** capture the branch name and PR number/URL from `/task`'s report.

## Step 3 — Resolve the PR

Re-resolve the PR from git rather than trusting the hand-off text: `gh pr view <branch> --json number,url,headRefName,baseRefName,state,isDraft,mergeable`.

- Only ever act on the PR whose `headRefName` is **this run's branch**. Never merge a PR this run did not create or update.
- If it is a draft (a `--draft` slipped through some inner command), `gh pr ready <number>` before merging.
- If `state` is already `MERGED`, skip to Step 7.

## Step 4 — Make it mergeable (`/mc` on conflict)

`main` may have moved while `/task` was working. Test for conflicts **locally** — `git fetch origin` then `git merge-tree --write-tree main <branch>` — and do not trust GitHub's `mergeable` field, which is computed lazily and reports `UNKNOWN` for a freshly pushed branch.

- **No conflict** → go to Step 5.
- **Conflict** → run **`/mc -t <branch>`**. It merges the latest `main` into the branch one conflict at a time and pushes. If `/mc` puts the branch in its 🔴 "needs human" list, **stop**: report the branch, the files, and why, and leave the PR open and unmerged. That is the one failure this command cannot drive through.
- After a successful `/mc`, the branch has new commits, so CI restarts — Step 5's wait covers the new run, not the stale one.

## Step 5 — Get it green

- **`--auto` given:** skip the wait entirely; Step 6 hands the merge to GitHub's auto-merge.
- **Otherwise:** wait on the checks — `gh pr checks <number> --watch --fail-fast`. A PR with no required checks returns immediately; that's a pass, not an error.

If checks come back red and the repair budget (`--fix <n>`, default `1`) is not exhausted:

1. Collect the failure: `gh pr checks <number>` for which check, and the failing job's log (`gh run view <run-id> --log-failed`) for why.
2. Spend one round: **`/fb -t <branch> <the failing check, the error, and what needs to change>`** — that wraps `/task --here` in a worktree of the existing branch, fixes, commits, `/clean`s, and updates the same PR.
3. Re-run the wait. Decrement the budget.

When the budget runs out with CI still red, **stop**: report the failing checks and the rounds spent, and leave the PR open. Never merge a red PR, and never reach for `--admin` to get around one.

## Step 6 — Merge into `main`

Merge through GitHub so branch protection is honored — never push to `main` directly:

- `--auto` given → `gh pr merge <number> --<method> --delete-branch --auto`; record the PR as **queued**.
- Otherwise → `gh pr merge <number> --<method> --delete-branch`; record it as **merged**.
  - If GitHub rejects it because required checks are still pending, re-run the same command **with `--auto`** and record it as queued.
  - If GitHub rejects it as **not mergeable** (`main` moved between Step 4 and here), go back to Step 4 once and retry. Twice in a row means a human is needed — stop and report.

## Step 7 — Pull `main`

Skip this for a **queued** PR — nothing has landed yet; say so in the report instead.

In the **main checkout** recorded in Step 1 (not a worktree — `/task` removed the one it made):

1. `git checkout main`
2. `git pull --ff-only origin main` — if the fast-forward fails, stop and report; local `main` has diverged and needs a human.
3. `git fetch --prune` and delete the merged local branch if `--delete-branch` left one behind (`git branch -d <branch>`; never `-D`).

Under `--here` this leaves you on `main` rather than the branch you started on — that branch is merged and deleted, so `main` is the right landing spot. Say so in the report.

## Step 8 — Report

One concise summary:

- Branch and PR number/URL.
- What `/review` found and what was applied (or that it was clean / skipped).
- Whether `/mc` ran, and on which files.
- CI: green first try, or the repair rounds spent.
- ✅ merged into `main` and pulled — or ⏳ queued for auto-merge — or 🔴 stopped, with the reason and the PR left open.
- On a no-change run: no PR was opened, and what established that.

## Notes

- **No human in the loop is the point.** Between Step 1's optional clarifying question and Step 8, don't stop to confirm anything you have a defined path for — that includes the merge itself. Do stop for the four things with no safe automatic answer: an unresolvable `/mc` conflict, CI still red after the repair budget, a diverged local `main`, and a PR that isn't this run's.
- **`/task` owns the branch, the commits, the PR, and the teardown.** This command adds only the last mile. Never implement, commit, or clean up here.
- Never commit or push to `main` directly; the merge always goes through `gh pr merge`.
- Never use `--admin` to bypass branch protection or a failing required check, and never force-push.
- `--draft` is incompatible by construction — a draft can't merge.
- Report the branch up front and the PR number/URL plus its merge state at the end.
