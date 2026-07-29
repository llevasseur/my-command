---
name: task-bootstrap
description: Create or update a repository-local bootstrap for safe, reproducible task worktrees.
---

# Worktree Bootstrap

Parse `--here`, `--base <branch>`, `--draft`, and stack notes. Follow `$task` workspace rules and inspect an existing bootstrap before creating anything.

1. Detect package management, monorepo layout, ignored environment files, generators, repository shell conventions, and changelog policy.
2. Ask one focused round only for details that cannot be discovered.
3. Create or update tracked `scripts/bootstrap-worktree.sh` and optional `AGENTS.md`/`CLAUDE.md` guidance. Make it portable: discover the main checkout via git common-dir, refuse to run there, link only ignored existing environment files without overwriting, install in the worktree, and regenerate from worktree-owned inputs.
4. Verify syntax, rerun safety, target selection, environment linking, and main-checkout refusal.
5. Add required changelog work, commit only scoped files, run `$clean`, and invoke `$pr`, forwarding `--draft`.
