---
type: adr
title: Shell shapes the harness refuses become toolkit flags and verbs
description: Heredocs on stdin, loop-computed paths, and cd-and-chain commands are refused or fail inside worktree-isolated sessions, so commit messages and PR bodies go through --message-file and --body-file, the /cp ring rotates through a stash verb, and worktrees are addressed with git -C and --cwd.
tags: [process, commands, toolkit, decisions]
timestamp: 2026-10-05
dirty: true
decided-by: /task
ratified: false
needs-human: false
---

# Shell shapes the harness refuses become toolkit flags and verbs

## Status

Accepted. **Written by `/task`, not ratified by a human**, under
[ADR 0005](0005-agent-authored-decisions-are-marked-in-frontmatter.md). It holds the history
moved out of `src/commands/task.md`, `src/commands/pr.md`, `src/commands/cp.md` and
`src/shared/merge-command-forms.md` under
[ADR 0021](0021-command-prompts-state-the-rule-and-adrs-keep-the-history.md).

## Context

**Heredocs.** `my-command-tools commit` and `my-command-tools pr` first took a multi-line
message or body on stdin, as `--message -` and `--body -`. That meant composing a heredoc,
and a heredoc is refused wholesale inside an isolated worktree, which is where `/task` and
`/pr` run. The refusal landed mid-commit and mid-PR.

**Loop-computed paths.** `/cp` kept a five-deep clipboard ring by pasting a
`for i in 3 2 1` loop over `$((i + 1))` paths into its prompt. Every path was under
`~/.claude` and the loop carried no git operation, yet it was refused every run, because a
worktree-isolated session cannot resolve a loop-computed path by reading it. A snippet that
is a different string on every run can never be allowlisted.

**Changing directory.** `cd <dir> && git …` was the recorded failure in merge steps, because
a worktree session is rarely where that path resolves.

## Decision

- Multi-line text goes to a file written with `Write` and passed as `--message-file` or
  `--body-file`. A `PreToolUse` gate refuses `--message -` and `--body -` and names the flag.
- Repeated shell logic becomes a toolkit verb: the `/cp` ring is `my-command-tools stash`,
  covered by the `Bash(my-command-tools:*)` allowlist.
- A worktree is addressed by path: `git -C <path>` and `--cwd <path>`.
