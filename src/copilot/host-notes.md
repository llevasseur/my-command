## Running on GitHub Copilot CLI

This workflow was written host-neutrally. On Copilot CLI, read its generic terms as the tools below.

- **Arguments.** The text typed after `/<skill-name>` in the same prompt is this run's arguments: flags first, then criteria. Nothing is substituted into this file, so read them from the prompt.
- **Another workflow.** A `/<name>` reference is the skill of that name in `~/.copilot/skills`. Invoking it inline means following its `SKILL.md` in this session as a step of this run.
- **A subagent** is a `task` call naming one of the custom agents in `~/.copilot/agents`. The brief carries this run's specifics, not a restatement of the agent's role:
  - `mycommand-verifier` is the verification agent, for `/verify` and `/task`'s running-app step.
  - `mycommand-reviewer` is the independent reviewer for `/review`. It returns findings and applies none.
  - `mycommand-finisher` runs the `--sub` stage of `/clean` then `/pr` in one context.
  - `mycommand-delegate` runs one `/manage` unit.
- **A later round to the same agent** is `write_agent`, read back with `read_agent`. Multi-turn messaging to an agent that has already completed is not confirmed on this host. When `read_agent` reports the agent completed, or `write_agent` fails, start a fresh agent of the same type for that round. Hand it the previous round's reply word for word, plus everything a first round gets: the criteria, the changed files, the run contract, and that round's own browser session name. The booted app stays up between rounds either way.
- **A wave** is one `task` call per unit, all issued in the same turn, never one after another. Use the tool's background mode where this session's `task` tool offers one, then collect each unit with `read_agent`. Background mode is observed on this host but not documented, so if the tool refuses it, issue the wave's calls together and wait for all of them.
- **A long wait** is the blocking command the workflow names, run as a foreground `bash` call with the longest timeout the tool allows. If the call returns before the command exits, keep reading that same shell with `read_bash` until it ends, and never start a second wait over the same run. A server or watcher goes in a detached `bash` with a log file and is read from that log, never by sleeping.
- **A question** goes through `ask_user`, one focused question at a time.
- **The todo list** is this session's todo tool. The closing-turn anchor and `/manage`'s wave plan both live there, because a compaction carries it forward.
- **Scratch** goes to `${TMPDIR:-/tmp}/my-command/`, outside the repo. Where a workflow names a job directory for scratch, this is it.
- **Worktrees** live under `.copilot/worktrees/` and are made with `my-command-tools worktree begin --host copilot`. This host has no tool that moves the session into a worktree, so always work by absolute path under the `path` the helper reports, and remove the worktree with `my-command-tools worktree end`.
- **The workflow gates are not installed on this host.** A rule that says a gate refuses a shape still holds as a rule. Nothing enforces it here, so follow it unprompted.
- **Not installed on this host:** `/ideate`, `/improve`, `/judge`, `/work`, `/revive`, `/learn`, `/lookup`, `/teach`, `/warm` and `/trim`, which depend on the Claude proxy, a hosted store, or Claude transcripts. Where a workflow names `/revive` as a recovery path, report the branch and the step the run stopped at instead.
