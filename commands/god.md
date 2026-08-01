---
description: Take a task all the way to merged — run /my-command:task (with /my-command:review woven in), resolve conflicts with /my-command:mc, wait for CI, merge the PR into main, and pull main. No human in the loop.
argument-hint: "[--here|-h] [--base <branch>] [--add|-a <list>] [--squash|--merge|--rebase] [--auto] [--fix <n>] [--no-review] <task criteria>"
---

`/my-command:task` plus the last mile: `/my-command:task` takes the criteria to a reviewed, open PR; this command gets that PR mergeable and green, merges it into `main`, and pulls the new `main` down. No human in the loop.

Input is the text in the `<command-args>` block above. Parse leading flags off the front; everything else is the **task criteria**, handed to `/my-command:task` verbatim.

**Announce at start**: the criteria, the merge method, whether review is woven in, and that this run will merge to `main` without asking again. Invoking `/my-command:god` is standing permission to merge this run's own PR.

## Flags

Forwarded to `/my-command:task` untouched: `--here` / `-h`, `--base <branch>`, `--add` / `-a <list>` (this command appends its own `review` entry after any entries you pass).

Always added to the `/my-command:task` invocation, whether or not you pass it: **`--sub`** — `/my-command:task` runs `/my-command:clean` + `/my-command:pr` inline by default, and this command needs that stage to be one subagent, because that is where the woven-in `review` entry lands and where an unattended run should keep the reviewer's context off this conversation. Passing `--sub` / `-s` yourself is accepted and redundant.

Owned here:

- `--squash` (default) / `--merge` / `--rebase` — method handed to `gh pr merge`. Mutually exclusive.
- `--auto` — don't wait on CI. Enable auto-merge and finish; the `main` pull is skipped and the PR is reported as queued.
- `--fix <n>` — auto-repair rounds spent on red CI. Default `1`; `0` disables repair.
- `--no-review` — don't weave `/my-command:review` into the `/my-command:task` run.
- `--draft` / `-d` — **rejected**: a draft can't merge. Stop and say to use `/my-command:task -d` instead.
- Anything not a recognized flag is task criteria.

## Step 1 — Preconditions

**Never ask a question — this command runs unattended.** If any precondition below is unmet or unresolvable, error out and explain what is missing and why the run cannot proceed.

1. `my-command-tools doctor` — confirms `git` and `gh` are both available. Then `gh auth status` for authentication, which `doctor` doesn't check.
2. `my-command-tools state` — one call covers the rest: it errors if this isn't a git repo, and reports `branch` (the starting branch), `root` (the **main checkout path** — Step 7 pulls `main` there, and by then `/my-command:task` may have torn down the worktree this started in), and `defaultBranch`. `main` below is shorthand for that.
   - When `worktree` is true, `root` is the worktree's root, not the main checkout. Resolve the main checkout separately in that case: `git rev-parse --path-format=absolute --git-common-dir`, minus `/.git`.
3. The criteria are specific enough to act on and no mutually exclusive flags conflict.

## Step 2 — Run `/my-command:task`, with `/my-command:review` woven in

Invoke `/my-command:task` with **`--sub`**, the forwarded flags, and the criteria; it owns the whole branch → implement → verify → `/my-command:clean` → `/my-command:pr` → teardown pipeline. Don't re-implement any of it here. `--sub` is what makes `/my-command:task`'s `/my-command:clean` + `/my-command:pr` stage a single fresh subagent, so the `review` entry below has a subagent to land in.

Unless `--no-review` was given, append this entry to `/my-command:task`'s `--add` list (after any entries I passed, so mine keep their order):

```
review after /my-command:pr has opened or updated the PR, run /my-command:review --here in that same subagent before any teardown, and carry /my-command:review through to its own end there — including running the /my-command:fb it emits, if it emits one. Show the reviewer's output verbatim. Never hand remaining review work back to the parent.
```

`/my-command:review` resolves both of its outcomes in place, so nothing comes back here as pending review work.

Then:

- **`/my-command:task` reports no changes and no PR** (criteria already satisfied) → skip to Step 8. No PR, no merge, don't touch `main`.
- **Otherwise** capture the branch name and PR number/URL from its report.

## Step 3 — Resolve the PR

Re-resolve from git rather than trusting the hand-off text: `gh pr view <branch> --json number,url,headRefName,baseRefName,state,isDraft,mergeable`.

- Only act on the PR whose `headRefName` is **this run's branch**. Never merge a PR this run did not create or update.
- Draft (a `--draft` slipped through an inner command) → `gh pr ready <number>` first.
- Already `MERGED` → skip to Step 7.

## Step 4 — Make it mergeable (`/my-command:mc` on conflict)

`main` may have moved while `/my-command:task` worked. Test **locally** — `git fetch origin`, then `git merge-tree --write-tree main <branch>`; GitHub's `mergeable` is lazy and reports `UNKNOWN` for a fresh branch. Issue the `git fetch` as its **own** Bash call: it may require approval, and folding it into an `&&` chain escalates approval to the whole compound command and costs a turn plus a retry.

- **No conflict** → Step 5.
- **Conflict** → run **`/my-command:mc -t <branch>`**. If it puts the branch in its 🔴 "needs human" list, **stop**: report the branch, the files, and why, and leave the PR open. That is the one failure this command cannot drive through.
- After a successful `/my-command:mc` the branch has new commits, so Step 5 waits on the new CI run, not the stale one.

## Step 5 — Get it green

- **`--auto`** → skip the wait; Step 6 hands the merge to GitHub.
- **Otherwise** → `gh pr checks <number> --watch --fail-fast`. A PR with no required checks returns immediately; that's a pass.
- **Never wait by sleeping.** `--watch` is the wait — a foreground `sleep` is blocked by the harness, and so is polling with `sleep N && gh pr checks …`. If a condition needs waiting on outside `--watch`, use the `Monitor` tool with an until-loop.

Red, with repair budget (`--fix <n>`, default `1`) left:

1. Collect the failure: `gh pr checks <number>` for which check, `gh run view <run-id> --log-failed` for why.
2. Spend a round: **`/my-command:fb -t <branch> <the failing check, the error, and what needs to change>`**.
3. Re-run the wait; decrement the budget.

Budget exhausted with CI still red → **stop**: report the failing checks and rounds spent, leave the PR open. Never merge a red PR; never reach for `--admin`.

## Step 6 — Merge into `main`

Merge through GitHub so branch protection is honored — never push to `main` directly:

- `--auto` → `gh pr merge <number> --<method> --delete-branch --auto`; record as **queued**.
- Otherwise → `gh pr merge <number> --<method> --delete-branch`; record as **merged**.
  - Rejected for pending required checks → re-run the same command **with `--auto`** and record as queued.
  - Rejected as **not mergeable** (`main` moved) → back to Step 4 once, then retry. Twice in a row means a human is needed — stop and report.

## Step 7 — Pull `main`

Skip for a **queued** PR — nothing has landed; say so in the report instead.

In the **main checkout** recorded in Step 1 (not a worktree — `/my-command:task` removed the one it made):

1. `git checkout main`
2. `git pull --ff-only origin main` — if the fast-forward fails, stop and report; local `main` has diverged and needs a human.
3. `git fetch --prune`, and delete the merged local branch if one is left behind (`git branch -d <branch>`; never `-D`).

Under `--here` this leaves you on `main` rather than the branch you started on — that branch is merged and deleted. Say so in the report.

## Step 8 — Report

One concise summary, in a **text-only turn** — after the last tool call, never in the same turn as one, or this run is recorded as unfinished even after the merge landed. It covers: branch and PR number/URL; what `/my-command:review` found and what was applied (or clean / skipped); whether `/my-command:mc` ran and on which files; CI green first try or the repair rounds spent; and the outcome — ✅ merged into `main` and pulled, ⏳ queued for auto-merge, or 🔴 stopped with the reason and the PR left open. On a no-change run: no PR was opened, and what established that.

## Notes

- **No human in the loop is the point.** Never stop to confirm anything you have a defined path for — including the merge. Do stop for the four things with no safe automatic answer: an unresolvable `/my-command:mc` conflict, CI still red after the repair budget, a diverged local `main`, and a PR that isn't this run's.
- **`/my-command:task` owns the branch, the commits, the PR, and the teardown.** This command adds only the last mile — never implement, commit, or clean up here.
- Never commit or push to `main` directly, never use `--admin`, never force-push.
