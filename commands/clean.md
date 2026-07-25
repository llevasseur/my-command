---
description: Clean up comments across a branch's committed changes (plus any uncommitted changes on top) — make them lean and to the point
argument-hint: "[optional branch name] [optional path or scope to limit cleanup]"
allowed-tools: Bash(git:*), Bash(my-command-tools:*), Read, Edit
---

Clean up the comments in my changes. Only touch comments — never change code, logic, formatting, or behavior.

## Scope

`my-command-tools clean-scope` derives the scope for you: it reports every comment on a line this branch added or modified, grouped by file with line numbers, across both the branch's commits and any uncommitted edits on top. Which comments are in scope is mechanical; judging them is not — that half stays below.

1. Run `my-command-tools clean-scope`. It resolves the base itself (the branch's upstream merge-base, else the repo's default branch) and reports it back under `base`. Never check out or switch branches — the diff happens in place with the current checkout untouched.
2. If $ARGUMENTS names a base or branch to compare against, pass it as `--base <ref>`.
3. If $ARGUMENTS also names a path or scope, pass it as `--path <glob>` (repeatable).
4. If `empty` is true, say so and stop.
5. Only consider the comments it reports. Do NOT clean comments in untouched code, even if they're bad. Generated and vendored files are already excluded, as are lint directives — the verb never offers those up, because they're load-bearing.
   - On a long-lived/shared branch, the branch-wide diff resurfaces earlier commits' code — including comments a prior clean pass already handled. If the branch shows evidence of an earlier clean (e.g. a `chore: clean ... comments` commit), re-run with `--base <task-base>` to scope to the current task's commits, and report the older code as out-of-scope instead of re-litigating it.

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
- **Keep** the sole comment inside an intentionally empty block (`catch {}`, `else {}`) — it is load-bearing: linters like Biome's `noEmptyBlockStatements` fail on an empty block with no comment. `clean-scope` can't see this from the diff alone, so it's on you to spot it.
- **Never add** new comments. This command only removes and shortens.

## Finish

- Apply edits directly with Edit.
- Report a short summary: how many comments removed vs. tightened, grouped by file. Do not commit.
