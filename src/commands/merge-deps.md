---
description: >
  Batch-merge open non-draft Dependabot PRs into main, one by one. For each, first run
  /mc -t <branch> to merge main in and resolve conflicts, verify in an isolated worktree,
  then merge into main and clean the worktree. Invoke on /my-command:merge-deps.
argument-hint: "[--label <name>] [--squash | --merge | --rebase] [--auto] [--dry-run | -n]"
allowed-tools: Bash, Read, Edit, Write
---

# merge-deps — Batch-merge Dependabot PRs

Merge every open, non-draft dependency PR (Dependabot) into `main`, one at a time.
Each PR is brought up to date with `main` and conflict-resolved via `/mc` first,
checked out in an isolated worktree to verify it is green, then merged into `main`
through GitHub (so branch protection is respected). Worktrees are cleaned up as you go.

**Announce at start** the label filter, merge method, and whether this is a dry run.

## Flags

Parse leading flags off `$ARGUMENTS`:

- `--label <name>` — the label a PR must carry to be in scope. Default: `dependencies`
  (Dependabot's default). Pass to widen/narrow (e.g. `--label "dependencies,security"`
  matches PRs with **any** of those labels).
- `--squash` / `--merge` / `--rebase` — the merge method handed to `gh pr merge`.
  Mutually exclusive; if more than one is given, stop and ask which. Default: `--squash`
  (clean single commit per dependency bump).
- `--auto` — don't wait on CI. Enable GitHub auto-merge for each PR (merges when its
  required checks pass) and move on. Without it, each PR is merged immediately and, only
  if GitHub blocks on still-pending required checks, auto-merge is enabled as a fallback.
- `--dry-run` / `-n` — list the PRs that would be processed, in order, then stop. No
  branches touched, no merges, no worktrees.

## Preconditions (once, up front)

1. Confirm you are inside a git repo (`git rev-parse --is-inside-work-tree`) and `gh` is
   authenticated (`gh auth status`). If not, stop.
2. Record the starting branch: `START_BRANCH=$(git rev-parse --abbrev-ref HEAD)`.
3. **Working tree must be clean.** `git status --porcelain`. If dirty, first check for an
   in-progress merge (`.git/MERGE_HEAD`) before stopping — do **not** stash, reset, or
   abort the user's work. Tell them to commit or stash and stop.
4. Identify the default branch: `git remote show origin | sed -n 's/.*HEAD branch: //p'`.
   Call it `MAIN` (`main` below is shorthand).
5. Update and fast-forward local main: `git fetch --all --prune`, then
   `git checkout main && git pull --ff-only origin main`. If the fast-forward fails, stop
   and report — local `main` diverged and needs a human.

## Select the PRs

List open, non-draft PRs carrying the label, based on main:

```
gh pr list --state open --draft=false --base main --label <label> \
  --json number,headRefName,title,isDraft,isCrossRepository,author,labels --limit 200
```

- Keep only PRs where `isDraft == false` (belt-and-suspenders alongside `--draft=false`).
- **Skip cross-repo / fork PRs** (`isCrossRepository == true`) — you cannot push the `/mc`
  conflict resolution to a fork. Collect them and report as skipped.
- Process in **ascending PR number** (oldest first) for a deterministic order.
- If there are none, say so and stop.
- **`--dry-run`:** print the ordered list (number, branch, title) and stop here.

## Per-PR loop (sequential — one PR fully done before the next)

Merging one PR changes `main`, so the next PR must be resolved and verified against the
**new** `main`. Process strictly one at a time. If a PR can't be safely merged, record it
and move on — never leave a branch mid-merge or a worktree behind.

For each PR (number `N`, branch `B`):

1. **Refresh the branch, then resolve conflicts with `/mc`.** Dependabot force-pushes its
   branches, so the ref you fetched in preconditions may already be stale by the time the
   loop reaches this PR — first `git fetch origin B` so `/mc` branches off the current tip
   rather than a stale one (branching off a stale base makes its push get rejected as a
   non-fast-forward). If a stale local `B` already exists from an earlier iteration, delete
   it (`git branch -D B`) so `/mc` recreates it from the fresh `origin/B`. Then invoke
   **`/mc -t B`** — it merges the latest `main` into `B` one conflict at a time and pushes
   `B`. If `/mc` reports `B` in its 🔴 "needs human" list (a conflict it could not
   resolve), **do not merge**: record `B` as blocked (unresolved conflict), skip to the
   next PR.

2. **Verify in an isolated worktree.** After `/mc`, `B` is up to date with `main` and
   checked out nowhere (mc returns to `main`). Check it out in a throwaway worktree and
   confirm the dependency bump is green before it touches `main`:
   - `git worktree add .claude/worktrees/deps-<safe-B> B` (use a filesystem-safe form of
     `B`; if git says `B` is already checked out, `git worktree prune` and retry).
   - Bootstrap it: if the repo provides a worktree bootstrap
     (`scripts/bootstrap-worktree.sh`, or a "Worktree Setup" section in
     `AGENTS.md`/`CLAUDE.md`), run/follow it; otherwise run the repo's install
     (`pnpm install` / `npm ci` / …) only if verification needs it. Symlink gitignored
     `.env` files from the main checkout — never copy or edit them.
   - Run the repo's fast verification for what a dependency bump affects (typecheck /
     lint / build / tests), as available. If it **fails because of this update**, record
     `B` as blocked (failed verification), remove the worktree, skip to the next PR.

3. **Merge into main.** Merge through GitHub so branch protection is honored (never push
   to `main` directly):
   - `--auto` given → `gh pr merge N --<method> --delete-branch --auto` and record `B` as
     queued.
   - Otherwise → `gh pr merge N --<method> --delete-branch`. If GitHub rejects it because
     required checks are still pending, fall back to the same command **with `--auto`** and
     record `B` as queued; on a clean merge record `B` as merged.

4. **Clean the worktree.** `git worktree remove .claude/worktrees/deps-<safe-B>` (add
   `--force` if install artifacts left it dirty — these worktrees hold no authored work,
   so discarding them is safe). Never force-remove a worktree that holds real work; these
   never do.

5. **Refresh local main** before the next PR so its `/mc` resolves against the just-merged
   result: `git checkout main && git pull --ff-only origin main`. (Skip the pull effect for
   queued/auto PRs whose merge hasn't landed yet — `/mc` fetches main itself regardless.)

## Finish

1. Return to the starting branch: `git checkout $START_BRANCH`.
2. Confirm no leftover worktrees: `git worktree list`; prune any `deps-*` you created.
3. Report a concise summary:
   - ✅ merged into `main`
   - 🟡 had conflicts `/mc` resolved, then merged (name the files `/mc` touched)
   - ⏳ queued — auto-merge enabled, will merge when checks pass
   - 🔴 left for a human — with the reason (fork/cross-repo, unresolved conflict, or failed
     verification)
4. Never mark the run complete if anything is 🔴 without saying so explicitly.

## Notes

- **Dependency PRs only.** Scope is the label filter — never touch unlabeled or feature
  PRs. Non-draft only.
- **Fetch each PR branch fresh right before you touch it.** Dependabot force-pushes
  branches after your up-front `git fetch`, so a branch's remote-tracking ref goes stale
  mid-run; branching `/mc` off the stale ref triggers a non-fast-forward push rejection.
- Skip fork / cross-repo PRs: their conflict resolution can't be pushed.
- Sequential by design: refresh `main` between PRs so each merges against the latest.
- Delegate all conflict resolution to `/mc` — never hand-merge here. Never force-push;
  merges only.
- Never merge a PR whose `/mc` conflicts are unresolved or whose verification failed.
- Respect branch protection: merge via `gh pr merge`, never a direct push to `main`.
- Worktrees live under `.claude/worktrees/`; remove each when its PR is done.
- `$ARGUMENTS` holds only the flags — this command takes no free-text criteria.
