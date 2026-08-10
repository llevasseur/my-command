#!/usr/bin/env bash
# Enforce the command-authoring invariants from docs/specs/adding-a-command.md so a
# new (or removed) command can't silently ship half-wired. Runs in PR CI.
#
#   1. commands/ is byte-in-sync with what build-plugin.sh generates from
#      src/commands/ (the generated namespaced copy was regenerated and committed).
#   2. every src/commands/<name>.md has a feature doc, generated Claude command,
#      and Codex-native skill directory.
#   3. the install wizard still enumerates src/commands/ dynamically, so new commands
#      are auto-included — guards against someone replacing the glob with a hardcoded
#      list (which is how a new command would silently drop out of the wizard).
#   4. the shared toolkit every command calls is still wired end to end: entrypoint and
#      shim present and runnable, every verb registered, and the wizard still installing
#      it device-wide (docs/specs/command-toolkit.md).
#   5. the Claude and Codex docs workflows both retain their integrated density phase.
#   6. every command carries the closing turn as its own step and anchors it in the todo
#      list up front, and every Codex skill mirrors both, so a run cannot end — or be
#      compacted mid-flight — without recording an outcome.
#   7. both density paths keep the Rewrite toward vocabulary rules.
#   8. every command that sweeps files carries the batched discovery step.
#   9. every merge command carries the working merge command forms.
#  10. the workflow gates ship whole: hook scripts present and executable, both events
#      registered in the settings fragment, the installer wiring them, and an off switch.
#  11. every command that enters a worktree it just created states the working entry form.
#  12. no command or shared snippet prescribes `gh pr merge … --delete-branch`, whose local
#      cleanup always fails where the default branch is checked out.
#  13. the npx wizard installs and registers the gates too, not just the toolkit — an
#      install surface that skips them ships the commands with the gates inert.
#  14. the toolkit fails closed when those gates are not armed: the verbs every workflow
#      command opens with refuse to run, with one detector behind them and one documented
#      escape for a genuinely hook-less environment.
#  15. every command carries the step marker rules, so a run states the step it enters
#      instead of leaving the record to infer it (docs/specs/run-markers.md).
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"
fail=0

# 0. src/commands/ matches src/shared/. Must run before 1, whose build expands them in place
# and would otherwise repair a hand-edit before the sync check ever saw it.
if ! node scripts/expand-includes.mjs --check; then
  fail=1
fi

# 1. commands/ in sync with src/commands/ via build-plugin.sh.
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
cp -R commands "$tmp/committed"
./scripts/build-plugin.sh >/dev/null
if ! diff -rq "$tmp/committed" commands >/dev/null 2>&1; then
  echo "::error::commands/ is out of sync with src/commands/. Run ./scripts/build-plugin.sh and commit the result."
  diff -rq "$tmp/committed" commands || true
  fail=1
fi

# 2 + 3 below reuse the freshly-built commands/ (identical when in sync).

# 2. Each command has a feature doc, generated copy, and Codex-native skill.
for f in src/commands/*.md; do
  name="$(basename "$f" .md)"
  if [ ! -f "docs/features/$name.md" ]; then
    echo "::error::command '$name' has no docs/features/$name.md — every command needs a feature doc (docs/specs/adding-a-command.md)."
    fail=1
  fi
  if [ ! -f "commands/$name.md" ]; then
    echo "::error::command '$name' has no generated commands/$name.md — run ./scripts/build-plugin.sh."
    fail=1
  fi
  if [ ! -f "skills/$name/SKILL.md" ]; then
    echo "::error::command '$name' has no skills/$name/SKILL.md — every Claude command needs a Codex-native translation."
    fail=1
  fi
done

for f in skills/*/SKILL.md; do
  name="$(basename "$(dirname "$f")")"
  if [ ! -f "src/commands/$name.md" ]; then
    echo "::error::Codex skill '$name' has no src/commands/$name.md counterpart."
    fail=1
  fi
done

# 3. Wizard still globs the command directory rather than a hardcoded list.
if ! grep -q 'readdirSync(SRC_DIR)' src/my-command.ts; then
  echo "::error::src/my-command.ts no longer enumerates src/commands/ with readdirSync(SRC_DIR); new commands may not auto-appear in the wizard."
  fail=1
fi
if ! grep -q 'readdirSync(SKILLS_DIR)' src/my-command.ts; then
  echo "::error::src/my-command.ts no longer enumerates skills/ dynamically; new Codex skills may not appear in the wizard."
  fail=1
fi

# 4. Shared toolkit wired end to end.
for required in src/toolkit/cli.mjs src/toolkit/bin/my-command-tools; do
  if [ ! -f "$required" ]; then
    echo "::error::missing $required — commands resolve their shared tooling through it (docs/specs/command-toolkit.md)."
    fail=1
  fi
done
if [ "$(git ls-files -s scripts/install-codex-personal.sh | awk '{print $1}')" != "100755" ]; then
  echo "::error::scripts/install-codex-personal.sh is missing or not executable."
  fail=1
fi

# The shim is what lands on PATH; a non-executable copy fails only at call time.
if [ -f src/toolkit/bin/my-command-tools ] && [ ! -x src/toolkit/bin/my-command-tools ]; then
  echo "::error::src/toolkit/bin/my-command-tools is not executable — run chmod +x and commit the mode bit."
  fail=1
fi

# A verb file that nobody registered is dead code the CLI can never reach. Ask the
# CLI itself rather than grepping for a key spelling — `help` lists the live registry.
if [ -f src/toolkit/cli.mjs ]; then
  registered="$(node src/toolkit/cli.mjs help 2>/dev/null | sed -n '/^Verbs:/,/^$/p')"
  for verb in src/toolkit/verbs/*.mjs; do
    case "$verb" in *.test.mjs) continue ;; esac
    name="$(basename "$verb" .mjs)"
    if ! printf '%s\n' "$registered" | grep -qx "  $name"; then
      echo "::error::verb '$name' is not registered in src/toolkit/cli.mjs — it can never be invoked."
      fail=1
    fi
  done
fi

# Every install surface must place the toolkit, or it exists only in this repo.
if ! grep -q 'installToolkit()' src/my-command.ts; then
  echo "::error::src/my-command.ts no longer calls installToolkit(); the npx install would ship commands without their tooling."
  fail=1
fi
if ! grep -q "installToolkit(deviceRoot('codex'))" src/my-command.ts; then
  echo "::error::Codex Skills mode no longer installs the toolkit under CODEX_HOME."
  fail=1
fi

# Commands spell the call bare, so the install has to put the shim on PATH or every toolkit
# call reads as "not installed". Grep the call site, not the bare name — the function's own
# definition contains `linkOnPath(` too, so a looser pattern would pass with the call gone.
if ! grep -q 'linkOnPath(bin)' src/my-command.ts; then
  echo "::error::src/my-command.ts no longer calls linkOnPath(); the installed shim would not be callable as a bare my-command-tools."
  fail=1
fi

# 5. Docs must finish its own dirty queue instead of requiring a second task and PR.
if ! grep -Fq '## Step 6 — Truncate the dirty queue' src/commands/docs.md; then
  echo "::error::src/commands/docs.md no longer contains its integrated truncate phase."
  fail=1
fi
if ! grep -Fq 'Run the `$truncate` density rules inline' skills/docs/SKILL.md; then
  echo "::error::skills/docs/SKILL.md no longer contains its integrated truncate phase."
  fail=1
fi

# 6. The closing turn is a step of every command, not a note at the end of one, and is
# anchored in the todo list up front — a rule that lives only in the prompt is gone once the
# run is summarized. It regressed twice: first as advisory prose, then as a step /task alone
# carried while every other command kept it as a tail sentence.
for f in src/commands/*.md; do
  name="$(basename "$f")"
  if ! grep -Fq 'include: shared/closing-turn-anchor.md' "$f"; then
    echo "::error::$name dropped the shared/closing-turn-anchor.md include; nothing would survive a compaction to say an outcome is owed."
    fail=1
  fi
  if ! grep -Fq 'include-block: shared/closing-turn.md' "$f"; then
    echo "::error::$name dropped the shared/closing-turn.md include; a run that ends on a tool call would record no outcome."
    fail=1
  fi
  if ! grep -Eq '^#+ (Step [0-9]+ — )?Close the run in a text-only turn$' "$f"; then
    echo "::error::$name has no 'Close the run in a text-only turn' heading; the closing turn must be a step, not a tail sentence."
    fail=1
  fi
done
for f in skills/*/SKILL.md; do
  if ! grep -Fq 'text-only turn' "$f"; then
    echo "::error::$f no longer states the text-only closing turn; its runs would record no outcome."
    fail=1
  fi
  # Hard-wrapped prose, so the phrase can straddle a line break — flatten whitespace first.
  if ! tr '\n' ' ' <"$f" | tr -s ' ' | grep -Fq 'A compaction boundary is a checkpoint'; then
    echo "::error::$f no longer mirrors the compaction-boundary rule; a run compacted mid-flight would record no outcome."
    fail=1
  fi
done

# 7. Both density paths keep the Rewrite toward vocabulary rules. Check 0 catches an edit
# between the markers but not a deleted directive, which is what these assert. The Codex
# skills are translations, not includes, so they are held to the rules in their own words.
for f in src/commands/truncate.md src/commands/docs.md; do
  if ! grep -Fq 'include-block: shared/rewrite-toward.md' "$f"; then
    echo "::error::$f dropped the shared/rewrite-toward.md include; its density pass has no vocabulary standard."
    fail=1
  fi
done
for f in skills/truncate/SKILL.md skills/docs/SKILL.md; do
  if ! grep -Fqi 'one instruction per sentence' "$f"; then
    echo "::error::$f no longer states the Rewrite toward vocabulary rules; the Codex path would truncate to a different standard."
    fail=1
  fi
done

# 8. Every command that sweeps files before acting triggers the batched discovery pass from its
# own workflow. Serial reads and re-reads regressed twice against a prose rule in the consuming
# repo's AGENTS.md — a rule an agent has to recall is not a mechanism, so the step lives in the
# commands and this gate keeps it there.
for f in src/commands/task.md src/commands/fb.md src/commands/review.md src/commands/god.md \
  src/commands/docs.md src/commands/clean.md src/commands/truncate.md src/commands/revive.md \
  src/commands/improve.md src/commands/judge.md src/commands/ideate.md; do
  if ! grep -Fq 'include-block: shared/batched-discovery.md' "$f"; then
    echo "::error::$f dropped the shared/batched-discovery.md include; its discovery phase would go back to one read per turn and to re-reading files already in context."
    fail=1
  fi
done

# 9. The merge commands state the working command forms at the step that runs them. Bash
# supplied over 90% of this pipeline's failed calls, concentrated in a rejected merge re-issued
# verbatim and in `cd <path> &&` where the toolkit takes a `--cwd` flag.
for f in src/commands/mc.md src/commands/god.md src/commands/merge-deps.md; do
  if ! grep -Fq 'include-block: shared/merge-command-forms.md' "$f"; then
    echo "::error::$f dropped the shared/merge-command-forms.md include; its merge step would have no working command forms and a rejected merge would be re-issued verbatim."
    fail=1
  fi
done
if grep -RFq 'cd <path> && my-command-tools' src/commands/; then
  echo "::error::a command still tells agents to 'cd <path> && my-command-tools …'; the toolkit takes the checkout as 'my-command-tools <verb> --cwd <path>'."
  fail=1
fi

# 10. The workflow gates are wired end to end. A hook script does nothing until settings.json
# registers it, and the installer is the only thing that registers it — so a missing script, a
# lost mode bit, an unregistered event, or an installer that stopped calling the registration
# all reduce the gates to files nobody executes.
for required in src/hooks/pre-tool-use.mjs src/hooks/stop.mjs src/hooks/install-hooks.mjs \
  src/hooks/settings-fragment.json; do
  if [ ! -f "$required" ]; then
    echo "::error::missing $required — the workflow gates only exist if all of them ship (docs/specs/workflow-gates.md)."
    fail=1
  fi
done

# A lost mode bit fails only at hook time, and silently: a failing hook allows the call.
for script in src/hooks/pre-tool-use.mjs src/hooks/stop.mjs; do
  if [ -f "$script" ] && [ ! -x "$script" ]; then
    echo "::error::$script is not executable — run chmod +x and commit the mode bit."
    fail=1
  fi
done

# An unparseable fragment, or one missing an event, turns a gate off without saying so.
if [ -f src/hooks/settings-fragment.json ]; then
  if ! node -e 'JSON.parse(require("node:fs").readFileSync("src/hooks/settings-fragment.json","utf8"))' 2>/dev/null; then
    echo "::error::src/hooks/settings-fragment.json is not valid JSON; the installer would refuse to register the gates."
    fail=1
  else
    for event in PreToolUse Stop; do
      if ! node -e "
        const f = JSON.parse(require('node:fs').readFileSync('src/hooks/settings-fragment.json','utf8'));
        const entries = f.hooks?.['$event'] ?? [];
        const ok = Array.isArray(entries) && entries.length > 0 &&
          entries.every((e) => (e.hooks ?? []).every((h) => String(h.command).includes('{{HOOKS_DIR}}')));
        process.exit(ok ? 0 : 1);
      " 2>/dev/null; then
        echo "::error::src/hooks/settings-fragment.json no longer registers a $event hook against {{HOOKS_DIR}}; that gate would never fire."
        fail=1
      fi
    done
  fi
fi

# Every gate must be reachable from a fresh device, and switchable off without uninstalling.
if ! grep -q 'install-hooks.mjs' scripts/install-personal.sh; then
  echo "::error::scripts/install-personal.sh no longer runs src/hooks/install-hooks.mjs; the gates would ship unregistered and inert."
  fail=1
fi
if ! grep -q 'MY_COMMAND_HOOKS' src/hooks/lib/io.mjs; then
  echo "::error::src/hooks/lib/io.mjs no longer honors MY_COMMAND_HOOKS; the gates would have no off switch."
  fail=1
fi
if ! grep -q 'MY_COMMAND_HOOKS' scripts/install-personal.sh; then
  echo "::error::scripts/install-personal.sh no longer tells the user how to turn the gates off."
  fail=1
fi

# Registering the gates is a separate step from installing the commands, and command files
# reach a device by paths that never run the installer — so the gates can ship, be pulled, and
# still never execute. Something on the device has to say so.
if ! grep -qi 'hooksstatus' src/toolkit/verbs/doctor.mjs; then
  echo "::error::src/toolkit/verbs/doctor.mjs no longer reports hook registration; nothing on the device would report the gates as unarmed."
  fail=1
fi
for f in src/commands/sync.md skills/sync/SKILL.md; do
  if ! grep -Fq 'hooks.armed' "$f"; then
    echo "::error::$f no longer reads hooks.armed from doctor; a sync that did not arm the gates would report success."
    fail=1
  fi
done

# The installer must not delete a hooks directory holding hooks it does not own: settings.json
# can register a foreign hook there independently, and clobbering it aims that registration at
# a path the new symlink cannot provide.
if ! grep -Fq 'refusing to replace' scripts/install-personal.sh; then
  echo "::error::scripts/install-personal.sh no longer refuses to replace a hooks directory holding foreign files; installing our gates would delete a hook the user registered independently."
  fail=1
fi

# 11. A command that creates a worktree and then enters it must state the working call form.
# Left unstated, every EnterWorktree call in one recorded window was refused — 3 of 3 — and each
# run reinvented the same absolute-path workaround from scratch instead of calling it correctly.
for f in src/commands/task.md src/commands/task-bootstrap.md src/commands/review.md \
  src/commands/fb.md src/commands/revive.md; do
  if ! grep -Fq 'include: shared/enter-worktree.md' "$f"; then
    echo "::error::$f dropped the shared/enter-worktree.md include; its worktree entry would be attempted, refused, and worked around from scratch in every run."
    fail=1
  fi
done

# 12. `gh pr merge --delete-branch` runs a local branch cleanup after the merge, which fails
# with `fatal: '<default>' is already used by worktree at …` wherever the default branch stays
# checked out. The merge lands and the call still exits 1, so the prescribed form drops the
# flag and deletes the branch as its own step.
if grep -REn -- 'gh pr merge[^`]*--delete-branch' src/commands/ src/shared/; then
  echo "::error::a command or shared snippet still prescribes 'gh pr merge … --delete-branch'; its local cleanup fails wherever the default branch is checked out, reporting a failure for a merge that succeeded. Merge without the flag and delete the branch separately ('my-command-tools worktree end --branch <branch>', 'git push origin --delete <branch>')."
  fail=1
fi

# 13. The npx wizard arms the gates, not just installs the toolkit — invariant 10 for the
# other install surface. The bundle shipped whole while the wizard had no hooks step at all,
# so every `npx @llevasseur/my-command` device reported `hooks.armed: false`.
if ! grep -q 'installHooks()' src/my-command.ts; then
  echo "::error::src/my-command.ts no longer calls installHooks(); an npx install would ship the commands with the gates inert."
  fail=1
fi

# Both Claude surfaces — plugin and personal — or one of them silently installs unarmed.
wired="$(grep -c 'reportHooks(await installHooks())' src/my-command.ts || true)"
if [ "$wired" -ne 2 ]; then
  echo "::error::src/my-command.ts wires the gates into $wired of the 2 Claude install paths; both the plugin and personal choices must arm them."
  fail=1
fi

# The copy has to be a copy. npx runs from an ephemeral cache that is cleaned up after the
# wizard exits, so a symlink into it dangles and every gate silently disappears.
if ! grep -q 'cpSync(HOOKS_SRC' src/my-command.ts; then
  echo "::error::src/my-command.ts no longer copies src/hooks to the device; a link into the npx cache would dangle once that cache is cleaned up."
  fail=1
fi

# A gate the user cannot turn off or remove is one they will uninstall the whole tool to escape.
for needle in MY_COMMAND_HOOKS --uninstall; do
  # -e, because the second needle starts with a dash and would otherwise read as a flag.
  if ! grep -Fq -e "$needle" src/my-command.ts; then
    echo "::error::src/my-command.ts no longer reports '$needle'; a wizard install would arm the gates without saying how to switch them off."
    fail=1
  fi
done

# The hint that fixes unarmed gates must not name install-personal.sh unconditionally — that
# script only exists in a git checkout, so on a wizard-installed device it pointed at nothing.
if ! grep -q 'fixHint' src/toolkit/lib/hooks-status.mjs; then
  echo "::error::src/toolkit/lib/hooks-status.mjs no longer chooses its hint by install surface; a wizard-installed device would be told to run a script it does not have."
  fail=1
fi

# 14. The toolkit fails closed on an unarmed device. Reporting `hooks.armed: false` from
# `doctor` left the unarmed state fully runnable, and nothing a session calls reads doctor, so
# the closing-turn gate kept going unrun. The verbs a workflow command opens with must refuse
# instead, and there must be a documented way out.
if ! grep -q 'requireArmed' src/toolkit/cli.mjs; then
  echo "::error::src/toolkit/cli.mjs no longer calls requireArmed(); an unarmed device would run every workflow verb with the gates inert."
  fail=1
fi
if [ -f src/toolkit/lib/require-armed.mjs ]; then
  # The gate has to reach the verbs a run actually opens with, or it gates nothing.
  for verb in state scope commit pr; do
    if ! grep -q "'$verb'" src/toolkit/lib/require-armed.mjs; then
      echo "::error::src/toolkit/lib/require-armed.mjs no longer gates '$verb'; a run could start on an unarmed device through it."
      fail=1
    fi
  done
  # A second detector could disagree with doctor's; there is exactly one.
  if ! grep -q 'deviceHooksStatus' src/toolkit/lib/require-armed.mjs; then
    echo "::error::src/toolkit/lib/require-armed.mjs no longer reads deviceHooksStatus(); the gate and doctor would answer from different detectors."
    fail=1
  fi
  # Fail-closed with no way out is a brick: CI and a fresh clone have no hooks by design.
  if ! grep -q 'MY_COMMAND_REQUIRE_HOOKS' src/toolkit/lib/require-armed.mjs; then
    echo "::error::src/toolkit/lib/require-armed.mjs no longer honors MY_COMMAND_REQUIRE_HOOKS; a hook-less environment such as CI would have no documented escape."
    fail=1
  fi
else
  echo "::error::missing src/toolkit/lib/require-armed.mjs — the fail-closed arming gate is what makes an unarmed device unusable rather than merely reported."
  fail=1
fi
if ! grep -q 'deviceHooksStatus' src/toolkit/verbs/doctor.mjs; then
  echo "::error::src/toolkit/verbs/doctor.mjs no longer resolves its hook status through deviceHooksStatus(); it would report a different answer than the gate enforces."
  fail=1
fi
# CI runs this script on a machine with no Claude settings at all, so the gate must be
# provably escapable. `--base HEAD` keeps this about the gate: CI checks out a PR merge ref
# with no origin/<default>, and `state` refuses to invent a base it does not have — so
# without it this fails for a reason that has nothing to do with the escape.
if ! escaped="$(MY_COMMAND_REQUIRE_HOOKS=0 node src/toolkit/cli.mjs state --compact --base HEAD 2>&1)"; then
  echo "::error::\`MY_COMMAND_REQUIRE_HOOKS=0 my-command-tools state\` failed; the documented escape does not work, which bricks CI and every fresh clone. It said: ${escaped}"
  fail=1
fi

# 15. The step marker makes a step attribution exact rather than inferred from prose. It is one
# include in every command, including a stepless one, so a command that gains a step is marked
# without an edit.
for f in src/commands/*.md; do
  if ! grep -Fq 'include-block: shared/step-marker.md' "$f"; then
    echo "::error::$(basename "$f") dropped the shared/step-marker.md include; its steps would be anchored by guessing at its prose instead of by the marker (docs/specs/run-markers.md)."
    fail=1
  fi
done

# The return marker ships inside the closing turn rather than as an include of its own, so this
# asserts its text rather than a directive check 6 already makes.
if ! grep -Fq 'RETURN /<command>' src/shared/closing-turn.md; then
  echo "::error::src/shared/closing-turn.md no longer states the return marker; a nested run's span would run on to the end of the transcript and be charged with its host's work (docs/specs/run-markers.md)."
  fail=1
fi

# 16. The diff-walking commands each carry the one-diff-call rule, and none of them teaches a
# second, path-narrowed diff. `scope --diff` already returns every hunk in one call, so a
# per-path `git diff -- <path>` / `gh pr diff` loop is the serial-discovery shape a PreToolUse
# gate now refuses; the prose has to agree with the gate or a run is told two different things.
for f in clean review fb; do
  if ! grep -Fq 'include-block: shared/one-diff-call.md' "src/commands/$f.md"; then
    echo "::error::$f.md dropped the shared/one-diff-call.md include; it would walk a branch diff one path per turn, which the PreToolUse gate refuses (docs/specs/workflow-gates.md)."
    fail=1
  fi
done

# 17. The prose flags that read stdin invite a heredoc, and a heredoc is refused wholesale
# inside an isolated worktree — mid-commit and mid-PR, which is where these run. The verbs take
# a path instead; no command may teach the stdin form.
for pair in commit:message-file pr:body-file; do
  verb="${pair%%:*}"
  flag="${pair##*:}"
  if ! grep -Fq -- "--$flag" "src/toolkit/verbs/$verb.mjs"; then
    echo "::error::src/toolkit/verbs/$verb.mjs no longer accepts --$flag; multi-line prose would have to come through a heredoc, which is refused in a worktree."
    fail=1
  fi
done
if grep -REn -- 'my-command-tools (commit|pr) [^`]*--(message|body) -' src/commands/ src/shared/; then
  echo "::error::the lines above teach prose on stdin; write the file and pass --message-file/--body-file, which is what the gate's refusal names."
  fail=1
fi

if [ "$fail" -eq 0 ]; then
  echo "check-commands: all command invariants satisfied ($(ls src/commands/*.md | wc -l | tr -d ' ') commands)."
fi
exit "$fail"
