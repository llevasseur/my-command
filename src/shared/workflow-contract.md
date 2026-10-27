### The workflow contract

**A repository can ask for a different shape of run, and `my-command-tools workflow` is where it says so.** It prints `contract`, read from `localPath` — a file inside the git common dir, shared by every worktree of the clone and never committed — and otherwise from the repository's own `scripts/bootstrap-worktree.sh --print-workflow-contract`. **A null `contract` means none of this applies** and the run keeps its default shape. A developer who follows a team's workflow alone writes the local file, so nothing about it lands in the team's repository. The fields:

- `spec.dir` — where feature spec folders live, `specs` when unset. A folder is `<spec.dir>/NNN-slug/` holding `spec.md`, usually with `plan.md` and `tasks.md`, written by the team's own spec tooling. These commands read those files; they never generate a spec of their own.
- `branches.model` — `stacked` puts the spec folder on its own branch and cuts the implementation branch from it, with the implementation PR targeting that spec branch. The spec branch is the one `spec.md` names on its `**Feature Branch**:` line, else the folder's name. Merging the spec PR and deleting its branch retargets the implementation PR to the default branch, so implementation can never land first. `single`, or unset, keeps the default.
- `review.format` — `buckets` adds the spec pass to `/review`.

`my-command-tools workflow --spec <dir>` also reports one folder: `clarifications` counts the open `[NEEDS CLARIFICATION]` markers, `tasks` counts `tasks.md` checkboxes, and `branch` with `branchOnOrigin` names the spec branch and whether origin has it.
