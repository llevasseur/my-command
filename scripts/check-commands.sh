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

# 6. The closing turn is a step of every command, not a note at the end of one. It
# regressed twice: first as advisory prose, then as a step /task alone carried while the
# other commands kept it as a tail sentence. Both halves are asserted here — the terminal
# step that states the contract, and the opening anchor that survives a compaction, since a
# rule only in the prompt is gone the moment the run is summarized.
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
  # The skills are hard-wrapped prose, so the phrase can straddle a line break. Flatten
  # whitespace before matching rather than asserting a fragment short enough to survive wrapping.
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

if [ "$fail" -eq 0 ]; then
  echo "check-commands: all command invariants satisfied ($(ls src/commands/*.md | wc -l | tr -d ' ') commands)."
fi
exit "$fail"
