---
description: Clean up comments across a branch's committed changes (plus any uncommitted changes on top) — make them lean and to the point
argument-hint: "[optional branch name] [optional path or scope to limit cleanup]"
allowed-tools: Bash(git:*), Read, Edit
---

Clean up the comments in my changes. Only touch comments — never change code, logic, formatting, or behavior.

## Scope

1. Target branch: if $ARGUMENTS names a branch, use it; otherwise use the current branch (`git branch --show-current`). Never check out or switch branches — diff the target ref in place with the current checkout untouched.
2. Determine the base to diff against:
   - If the target branch has an upstream tracking branch, use `git merge-base <upstream> <branch>`.
   - Otherwise, detect the repo's default branch (`git symbolic-ref refs/remotes/origin/HEAD` or fall back to `main`/`master`, whichever exists) and use `git merge-base origin/<default> <branch>`.
3. Full diff = `git diff <merge-base>...<branch>` (every commit made on the branch) plus, if the target branch is the current branch, any current staged/unstaged changes on top (`git diff HEAD`). If targeting a different branch, only its committed changes are in scope — there's no working tree to inspect.
4. Only consider comments on lines added or modified anywhere in that combined diff. Do NOT clean comments in untouched code, even if they're bad. Ignore generated files.
   - On a long-lived/shared branch, the branch-wide diff resurfaces earlier commits' code — including comments a prior clean pass already handled. If the branch shows evidence of an earlier clean (e.g. a `chore: clean ... comments` commit), scope to the current task's commits (`git diff <task-base>...HEAD`) and report the older code as out-of-scope instead of re-litigating it.
5. If $ARGUMENTS also names a path or scope (beyond the branch name), limit to that.
6. If the combined diff is empty, say so and stop.

## How I want comments

- Lean, concise, to the point.
- Tell the **what**, not the why. Drop comments that only explain why or justify a choice, unless the why is genuinely non-obvious and load-bearing.
- No examples in comments.
- Match the tone of the existing human-written comments in the same file. Don't sound like an AI narrating.

## What to do to each comment in scope

- **Delete** comments that restate what the code plainly says, narrate steps ("Now we loop over...", "This function does..."), or add ceremony (obvious section banners, TODO-less filler).
- **Tighten** comments that carry real information but are verbose — cut them to the essential what, one line where possible.
- **Keep** comments that document something non-obvious the code can't express (edge cases, gotchas, external constraints). Leave license headers, linter directives (e.g. `biome-ignore`, `eslint-disable`), and doc/JSDoc annotation tags intact.
- **Keep** section-header comments inside JSX (e.g. `{/* Header */}`, `{/* Sidebar */}`) that label a structural region of markup — JSX has no other lightweight way to mark these regions, so they aren't ceremony the way a banner in plain code is. Only tighten them if verbose; don't delete them.
- **Keep** the sole comment inside an intentionally empty block (`catch {}`, `else {}`) — it is load-bearing: linters like Biome's `noEmptyBlockStatements` fail on an empty block with no comment.
- **Never add** new comments. This command only removes and shortens.

## Finish

- Apply edits directly with Edit.
- Report a short summary: how many comments removed vs. tightened, grouped by file. Do not commit.
