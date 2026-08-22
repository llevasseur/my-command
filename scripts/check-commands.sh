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
#  18. every fenced shell snippet the docs tell an agent to run is a shape the gates accept —
#      the repo may not prescribe a command its own harness refuses.
#  19. the closing turn distinguishes a nested inline handback from a run close, on all three
#      surfaces, and the Stop gate reads the same distinction — a nested run that spends a
#      text-only turn strands its parent's remaining steps (docs/specs/run-markers.md).
#  20. every subagent definition declares a model and a tool list, every command that dispatches
#      one names it by subagent_type, and both Claude install surfaces place the definitions —
#      an unnamed dispatch silently takes the default agent, and a definition that never reaches
#      the device makes a named one do the same. Each declared model matches the tier the spec's
#      table assigns it, and the one site that departs from its definition's tier still says so
#      (docs/specs/subagent-definitions.md).
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
    # A here-string rather than a pipe: `grep -q` exits at the first match and closes the
    # pipe under it, and with `pipefail` on that SIGPIPE becomes the pipeline's status — so
    # the alphabetically first verb reported itself unregistered while being registered.
    if ! grep -qx "  $name" <<<"$registered"; then
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
  src/commands/improve.md src/commands/work.md src/commands/judge.md src/commands/ideate.md \
  src/commands/dev.md; do
  if ! grep -Fq 'include-block: shared/batched-discovery.md' "$f"; then
    echo "::error::$f dropped the shared/batched-discovery.md include; its discovery phase would go back to one read per turn and to re-reading files already in context."
    fail=1
  fi
done

# 9. The merge commands state the working command forms at the step that runs them. Bash
# supplied over 90% of this pipeline's failed calls, concentrated in a rejected merge re-issued
# verbatim and in `cd <path> &&` where the toolkit takes a `--cwd` flag.
for f in src/commands/mc.md src/commands/god.md src/commands/merge-deps.md src/commands/wayfinder.md \
  src/commands/dev.md; do
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

    # A gate aimed at a tool the matcher does not name is a file nobody executes. The
    # closing-turn anchor gate shipped against `TodoWrite` while the matcher listed only the
    # read and editor tools, so it never fired once — the same failure as an unregistered
    # event, and invisible in exactly the same way.
    missing_matcher=$(node -e '
      const f = JSON.parse(require("node:fs").readFileSync("src/hooks/settings-fragment.json", "utf8"));
      const matchers = (f.hooks?.PreToolUse ?? []).map((e) => String(e.matcher ?? "")).join("|");
      const named = new Set(matchers.split("|").filter(Boolean));
      const wanted = [
        "Read", "Grep", "Glob", "Bash", "Edit", "Write", "NotebookEdit", "MultiEdit",
        "TodoWrite", "TaskCreate", "EnterWorktree",
      ];
      console.log(wanted.filter((tool) => !named.has(tool)).join(" "));
    ')
    if [ -n "$missing_matcher" ]; then
      echo "::error::src/hooks/settings-fragment.json PreToolUse matcher does not name: $missing_matcher — a gate judging one of those tools would never be invoked."
      fail=1
    fi

    # An unallowlisted store hook still runs, at one approval round-trip per call. Nothing else
    # catches that: the event loop above and hooks-status.mjs both read only `hooks`.
    missing_allow=$(node -e '
      const f = JSON.parse(require("node:fs").readFileSync("src/hooks/settings-fragment.json", "utf8"));
      const allow = new Set(f.permissions?.allow ?? []);
      const scripts = ["ideas-read", "ideas-add", "ideas-claim", "ideas-mark"];
      const wanted = scripts.flatMap((s) => [
        `Bash({{HOOKS_DIR}}/${s}.mjs:*)`,
        `Bash(~/.claude/my-command/hooks/${s}.mjs:*)`,
      ]);
      console.log(wanted.filter((entry) => !allow.has(entry)).join(" "));
    ')
    if [ -n "$missing_allow" ]; then
      echo "::error::src/hooks/settings-fragment.json is missing permissions.allow entries: $missing_allow — each of those store hook calls would cost an approval prompt."
      fail=1
    fi
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
  echo "::error::a command or shared snippet still prescribes 'gh pr merge … --delete-branch'; its local cleanup fails wherever the default branch is checked out, reporting a failure for a merge that succeeded. Merge without the flag and delete the branch separately, with 'my-command-tools cleanup --branch <branch>'."
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

# 16. The diff-walking commands each carry the one-diff-call rule, and the copy each of them
# ships carries the expanded rule rather than an include marker that never resolved.
# `scope --diff` already returns every hunk in one call, so a per-path `git diff -- <path>` /
# `gh pr diff` walk is the serial-discovery shape a PreToolUse gate now refuses.
#
# That the *prescribed* form is one the gate leaves alone is asserted where it can be checked
# exactly rather than grepped for: prose has to be able to name the shape it forbids, so no
# pattern here can tell a prescription from a prohibition. `src/hooks/hooks.test.mjs` runs the
# gate itself over the line `src/shared/batched-discovery.md` prescribes.
for f in clean review fb; do
  if ! grep -Fq 'include-block: shared/one-diff-call.md' "src/commands/$f.md"; then
    echo "::error::$f.md dropped the shared/one-diff-call.md include; it would walk a branch diff one path per turn, which the PreToolUse gate refuses (docs/specs/workflow-gates.md)."
    fail=1
  fi
  if ! grep -Fq 'There is no second diff call' "commands/$f.md"; then
    echo "::error::commands/$f.md does not carry the expanded one-diff-call rule; the include never reached the copy the plugin ships, so the command states nothing the gate enforces (docs/specs/workflow-gates.md)."
    fail=1
  fi
done

# 17. The prose flags that read stdin invite a heredoc, and a heredoc is refused wholesale
# inside an isolated worktree — mid-commit and mid-PR, which is where these run. The verbs take
# a path instead; no command, shared snippet, or shipped skill may teach the stdin form. The
# skills are the Codex half of the paired bundle and are authored alongside the commands, so
# leaving them out of the sweep leaves a surface that can reintroduce `--body -` unchecked.
for pair in commit:message-file pr:body-file; do
  verb="${pair%%:*}"
  flag="${pair##*:}"
  if ! grep -Fq -- "--$flag" "src/toolkit/verbs/$verb.mjs"; then
    echo "::error::src/toolkit/verbs/$verb.mjs no longer accepts --$flag; multi-line prose would have to come through a heredoc, which is refused in a worktree."
    fail=1
  fi
done
if grep -REn -- 'my-command-tools (commit|pr) [^`]*--(message|body) -' src/commands/ src/shared/ skills/; then
  echo "::error::the lines above teach prose on stdin; write the file and pass --message-file/--body-file, which is what the gate's refusal names."
  fail=1
fi

# 18. The docs may not prescribe a command the harness refuses. `/cp` step 3 told every run to
# rotate its stash ring with a `for i in 3 2 1` loop over `$((i + 1))` paths, and a
# worktree-isolated session refused it every time — on shape, not on substance, since every
# path in it was under ~/.claude. One bad snippet is a bug; a repo that can grow another one
# silently is the defect, so every fenced shell block in src/commands/, src/shared/ and skills/
# goes through the same shape checker the gate uses. A block nobody is told to run declares
# itself with `<!-- not-run: <reason> -->`.
if ! node scripts/check-doc-snippets.mjs; then
  fail=1
fi

# 19. Only the outermost run closes in a text-only turn. A text-only assistant message ends the
# assistant's turn, so a command invoked inline by another strands its parent's remaining steps
# by closing — observed on PR #90, where /task's teardown and closing report were both stranded
# by /clean's and /pr's closes. This is gated on all three surfaces the way 6 and 15 gate the
# closing turn and the return marker: the canonical snippet, the generated copy the plugin
# ships, and the hand-written Codex translation that cannot inherit an include.
NESTED='hands back without spending a text-only turn'
if ! grep -Fq "$NESTED" src/shared/closing-turn.md; then
  echo "::error::src/shared/closing-turn.md no longer distinguishes a nested inline handback from a run close; every nested command would end its parent's turn and strand the rest of the parent's pipeline (docs/specs/run-markers.md)."
  fail=1
fi
# The three cases have to be tellable apart by the run itself, or the rule is unactionable.
for needle in 'Skill` tool' 'Agent` tool'; do
  if ! grep -Fq "$needle" src/shared/closing-turn.md; then
    echo "::error::src/shared/closing-turn.md no longer names '$needle' as how a run tells which of the three invocation cases it is in; the handback rule would be unactionable (docs/specs/run-markers.md)."
    fail=1
  fi
done
for f in commands/*.md; do
  if ! grep -Fq "$NESTED" "$f"; then
    echo "::error::$f does not carry the expanded nested-handback rule; the include never reached the copy the plugin ships, so the command states nothing about it (docs/specs/run-markers.md)."
    fail=1
  fi
done
for f in skills/*/SKILL.md; do
  # Hard-wrapped prose, so the phrase can straddle a line break — flatten whitespace first.
  if ! tr '\n' ' ' <"$f" | tr -s ' ' | grep -Fq "$NESTED"; then
    echo "::error::$f no longer mirrors the nested-handback rule; the Codex translation would tell a nested run to close and strand its invoker's remaining steps (docs/specs/run-markers.md)."
    fail=1
  fi
done
# The gate has to agree with the prose beside it, so both exemptions must still be read from
# the transcript rather than removed (docs/specs/workflow-gates.md).
for needle in returnMarker nestedRunOpen; do
  if ! grep -q "$needle" src/hooks/stop.mjs; then
    echo "::error::src/hooks/stop.mjs no longer reads $needle(); the outcome gate would demand a text-only turn from a nested handback or from a pipeline still mid-flight, which is what strands the parent's steps (docs/specs/workflow-gates.md)."
    fail=1
  fi
done

# 20. Post-merge branch deletion goes through the verb, not through the raw pair. Both halves
# fail in a way that is decided by the merge method rather than by anything the caller did — a
# squash merge makes `git branch -d` call the branch unmerged, and GitHub's auto-delete makes
# `git push origin --delete` exit 1 on a ref that is already gone. Prescribing the raw calls is
# prescribing those errors. The remote half is the checkable one: `git branch -d` appears in
# prose *about* the failure, and `git branch -D <b>` also has an unrelated legitimate use
# (`/merge-deps` drops a stale local branch so `/mc` can recreate it from origin), so matching
# on it would flag the explanation along with the prescription. A line that already names the
# verb is describing it rather than routing around it, and `shared/refusal-final.md` names the
# remote deletion only as what a `gh api` retry is equivalent to.
if grep -REn -- '`git push [a-z]+ --delete' src/commands/ src/shared/ |
  grep -v 'my-command-tools cleanup' | grep -v 'gh api'; then
  echo "::error::a command or shared snippet still prescribes a raw post-merge branch deletion; a squash merge makes 'git branch -d' refuse and an auto-deleted remote ref makes 'git push … --delete' exit 1. Prescribe 'my-command-tools cleanup --branch <branch>', which settles both halves from the PR (docs/specs/workflow-gates.md)."
  fail=1
fi

# 21. The dispatching commands make each unit's workspace and hand over the path. Siblings in a
# wave run concurrently, so one unit's refusal teaches the other four nothing — the fix cannot
# live at the callee, and a note it reads only after being dispatched into the repo root is the
# same fix in a worse place.
for f in src/commands/manage.md src/commands/work.md; do
  if ! grep -Fq 'include-block: shared/dispatch-worktree.md' "$f"; then
    echo "::error::$f no longer carries shared/dispatch-worktree.md; its units would create or enter their own worktrees from the repo root, which is the refusal every sibling in a wave hits at once (docs/specs/workflow-gates.md)."
    fail=1
  fi
done
for f in src/commands/task.md src/commands/fb.md; do
  if ! grep -Fq '`--worktree <path>`' "$f"; then
    echo "::error::$f no longer documents --worktree <path>; the dispatch-site handover has nothing to hand over to (docs/specs/workflow-gates.md)."
    fail=1
  fi
done

# 22. The Stop gate judges the closing turn's shape. Keying on a tool name put the previous fix
# on TodoWrite while the recorded runs ended on batches of TaskUpdate, which PreToolUse cannot
# tell apart from any other row and Stop does not have to.
for needle in BOOKKEEPING TaskUpdate TEARDOWN_BASH; do
  if ! grep -q "$needle" src/hooks/stop.mjs; then
    echo "::error::src/hooks/stop.mjs no longer names $needle; a closing turn made only of task-list bookkeeping would end the run with no outcome recorded, which is the shape the gate exists to refuse (docs/specs/workflow-gates.md)."
    fail=1
  fi
done

# 23. Refusing the poll only helps if the wait has somewhere to go. Without the affordance the
# recorded sessions re-issued the watch and then read the file by hand anyway.
if ! grep -q "bool(ctx.flags.background)" src/toolkit/verbs/verify.mjs; then
  echo "::error::src/toolkit/verbs/verify.mjs no longer implements --background; the watched-condition gates would refuse a poll while offering nothing in its place (docs/specs/workflow-gates.md)."
  fail=1
fi
if ! grep -q 'verify --background' src/hooks/pre-tool-use.mjs; then
  echo "::error::src/hooks/pre-tool-use.mjs no longer names 'verify --background' in its watched-condition denials; the refusal would state no alternative (docs/specs/workflow-gates.md)."
  fail=1
fi

# 23a. `--background` alone was still not somewhere to go: it hands back a *notified* wait, so a
# run that has nothing else to do arms a watch and then reads the report anyway — recorded at
# twenty reads in one session and fifteen in another, with two sessions ending inside the loop.
# The blocking wait is the affordance, so it has to exist, the denials have to name it, and the
# commands that prescribe verify have to prescribe it.
if ! grep -q "ctx.flags.wait" src/toolkit/verbs/verify.mjs; then
  echo "::error::src/toolkit/verbs/verify.mjs no longer implements --wait; a run with nothing else to do would have no blocking wait and would poll the report instead (docs/specs/workflow-gates.md)."
  fail=1
fi
if ! grep -q 'verify --wait' src/hooks/pre-tool-use.mjs; then
  echo "::error::src/hooks/pre-tool-use.mjs no longer names 'verify --wait' in its watched-condition denials; the refusal would offer only a wait that still has to be polled (docs/specs/workflow-gates.md)."
  fail=1
fi
if ! grep -Fq 'include-block: shared/verify-wait.md' src/commands/task.md; then
  echo "::error::src/commands/task.md dropped the shared/verify-wait.md include; its verify step would prescribe a call it never says how to wait on."
  fail=1
fi
if ! grep -Fq 'verify --wait' src/commands/review.md; then
  echo "::error::src/commands/review.md no longer names 'verify --wait'; its verification step would leave the run polling a report that does not exist until the run is over."
  fail=1
fi

# 23b. A dispatched run's working directory is a repository root, which is exactly where
# EnterWorktree refuses — so a command that tells one to call it prescribes a certain refusal.
# Ten recorded runs across five buckets took it and then worked by absolute path anyway. The
# reported path is the working root; the verb has to say so, and the prose must not frame the
# absolute-path form as the fallback after a refusal.
if ! grep -q 'workingRoot' src/toolkit/verbs/worktree.mjs; then
  echo "::error::src/toolkit/verbs/worktree.mjs no longer reports workingRoot from 'worktree begin'; the path would again read as somewhere to move the session to (docs/specs/workflow-gates.md)."
  fail=1
fi
if grep -Fq 'fall back to working through absolute paths' src/shared/enter-worktree.md; then
  echo "::error::src/shared/enter-worktree.md again frames absolute paths as a fallback after a refusal; for a dispatched run that refusal is certain, so the absolute-path form is the normal mode and must be stated as such."
  fail=1
fi
if ! grep -Fq 'working root' src/shared/enter-worktree.md; then
  echo "::error::src/shared/enter-worktree.md no longer names the reported path as the run's working root; entering the worktree would read as the prescribed step again."
  fail=1
fi

# 24. The subagent definitions are the single statement of each delegate's role, which holds only
# while three things are true together: each definition declares a model and a tool list, each
# dispatch site names one, and every Claude install surface puts them where Claude reads them.
# Miss the last and a named dispatch silently falls back to the default agent, reporting nothing.
# The model each one declares is a tier the spec's table decides, checked here in both directions.
AGENT_SPEC=docs/specs/subagent-definitions.md
if [ ! -f "$AGENT_SPEC" ]; then
  echo "::error::missing $AGENT_SPEC — the tier table it holds is the single source of truth for every definition's model."
  fail=1
fi
if [ ! -d agents ]; then
  echo "::error::missing agents/ — the subagent definitions every dispatch site names by subagent_type (docs/specs/subagent-definitions.md)."
  fail=1
else
  for f in agents/*.md; do
    name="$(basename "$f" .md)"
    for field in name description tools model; do
      if ! grep -Eq "^${field}:" "$f"; then
        echo "::error::agents/$name.md declares no '$field:' in its frontmatter; a definition states a model, a tool list, and what it is for."
        fail=1
      fi
    done
    # The frontmatter name is what `subagent_type` resolves; a mismatch with the filename makes
    # the dispatch name one thing and the device install another.
    if ! grep -Eq "^name: ${name}\$" "$f"; then
      echo "::error::agents/$name.md declares a 'name:' other than '$name'; subagent_type resolves the frontmatter name, so it must match the filename the installer places."
      fail=1
    fi
    # Named nowhere, it is a file the device carries and nothing invokes.
    if ! grep -Rql "subagent_type: \"$name\"" src/commands/; then
      echo "::error::no command in src/commands/ names 'subagent_type: \"$name\"'; a definition no dispatch site names is dead weight on every device."
      fail=1
    fi
    # The spec's tier table decides a definition's model; assert the two agree both ways.
    # Matched on the tier column, not on the name alone: the spec opens with a shape table
    # keyed by the same names, and a looser pattern reads a row out of both.
    row="$(grep -E "^\| \`$name\` \| (strong|cheap) \|" "$AGENT_SPEC" || true)"
    if [ -z "$row" ]; then
      echo "::error::agents/$name.md has no row in $AGENT_SPEC's tier table; the table is where a definition's tier is decided, so a definition missing from it carries a model nothing chose."
      fail=1
    else
      want="$(printf '%s\n' "$row" | awk -F'|' '{ gsub(/[ `]/, "", $4); print $4 }')"
      have="$(sed -n 's/^model:[[:space:]]*//p' "$f" | head -1)"
      if [ "$want" != "$have" ]; then
        echo "::error::agents/$name.md declares 'model: $have' but $AGENT_SPEC's tier table says '$want'; the table decides the tier and the frontmatter only carries it."
        fail=1
      fi
    fi
  done

  # One definition serves both /docs and /truncate, whose work sits in different tiers, so the
  # difference lives at the dispatch site. Unchecked, a later edit drops it silently.
  if ! grep -Fq 'model: "opus"' src/commands/truncate.md; then
    echo "::error::src/commands/truncate.md no longer overrides mycommand-doc-auditor's declared tier; its every-claim-survives rewrite would run on the cheap tier the audit shape chose ($AGENT_SPEC)."
    fail=1
  fi
  if grep -Fq 'model: "opus"' src/commands/docs.md; then
    echo "::error::src/commands/docs.md pins a model on its mycommand-doc-auditor dispatch; that site takes the definition's declared default, and only the site departing from the tier states one ($AGENT_SPEC)."
    fail=1
  fi

  # Each site that dispatches with the Agent tool must say which definition, checked per command
  # rather than in total.
  for f in src/commands/task.md src/commands/review.md src/commands/docs.md \
    src/commands/truncate.md src/commands/dev.md src/commands/work.md \
    src/commands/manage.md src/commands/improve.md; do
    if ! grep -Fq 'subagent_type:' "$f"; then
      echo "::error::$f dispatches a subagent without naming a subagent_type; that dispatch takes the default agent and says nothing about it (docs/specs/subagent-definitions.md)."
      fail=1
    fi
  done

  # Every name a command dispatches has to exist as a definition, or the dispatch resolves to
  # nothing. Reads the names out of the commands rather than assuming the set.
  for named in $(grep -rhoE 'subagent_type: "[a-z0-9-]+"' src/commands/ | sed -E 's/.*"(.*)"/\1/' | sort -u); do
    if [ ! -f "agents/$named.md" ]; then
      echo "::error::a command names subagent_type \"$named\" but agents/$named.md does not exist; that dispatch resolves to no definition."
      fail=1
    fi
  done

  # Both Claude install surfaces: a definition that never reaches the device makes a correctly
  # named dispatch behave exactly like an unnamed one.
  if ! grep -q 'installAgents(' src/my-command.ts; then
    echo "::error::src/my-command.ts no longer calls installAgents(); an npx install would ship commands naming definitions the device does not have."
    fail=1
  fi
  wired_agents="$(grep -c 'reportAgents(installAgents())' src/my-command.ts || true)"
  if [ "$wired_agents" -ne 2 ]; then
    echo "::error::src/my-command.ts wires the subagent definitions into $wired_agents of the 2 Claude install paths; both the plugin and personal choices must place them."
    fail=1
  fi
  if ! grep -q 'AGENTS_DEST' scripts/install-personal.sh; then
    echo "::error::scripts/install-personal.sh no longer links agents/ into the Claude agents directory; the dev install would name definitions it never placed."
    fail=1
  fi
  # The plugin install path places nothing itself — the manifest is what points Claude at them.
  if ! grep -q '"agents"' .claude-plugin/plugin.json; then
    echo "::error::.claude-plugin/plugin.json no longer declares its 'agents' directory; a plugin install would carry no definitions."
    fail=1
  fi
fi

if [ "$fail" -eq 0 ]; then
  echo "check-commands: all command invariants satisfied ($(ls src/commands/*.md | wc -l | tr -d ' ') commands, $(ls agents/*.md | wc -l | tr -d ' ') subagent definitions)."
fi
exit "$fail"
