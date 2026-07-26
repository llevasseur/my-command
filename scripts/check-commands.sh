#!/usr/bin/env bash
# Enforce the command-authoring invariants from docs/specs/adding-a-command.md so a
# new (or removed) command can't silently ship half-wired. Runs in PR CI.
#
#   1. commands/ is byte-in-sync with what build-plugin.sh generates from
#      src/commands/ (the generated namespaced copy was regenerated and committed).
#   2. every src/commands/<name>.md has a docs/features/<name>.md feature doc and a
#      generated commands/<name>.md.
#   3. the install wizard still enumerates src/commands/ dynamically, so new commands
#      are auto-included — guards against someone replacing the glob with a hardcoded
#      list (which is how a new command would silently drop out of the wizard).
#   4. the shared toolkit every command calls is still wired end to end: entrypoint and
#      shim present and runnable, every verb registered, and the wizard still installing
#      it device-wide (docs/specs/command-toolkit.md).
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"
fail=0

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

# 2. Each command has a feature doc and a generated copy.
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
done

# 3. Wizard still globs the command directory rather than a hardcoded list.
if ! grep -q 'readdirSync(SRC_DIR)' src/my-command.ts; then
  echo "::error::src/my-command.ts no longer enumerates src/commands/ with readdirSync(SRC_DIR); new commands may not auto-appear in the wizard."
  fail=1
fi

# 4. Shared toolkit wired end to end.
for required in src/toolkit/cli.mjs src/toolkit/bin/my-command-tools; do
  if [ ! -f "$required" ]; then
    echo "::error::missing $required — commands resolve their shared tooling through it (docs/specs/command-toolkit.md)."
    fail=1
  fi
done

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

# Both install modes must place the toolkit, or it exists only in this repo.
if ! grep -q 'installToolkit()' src/my-command.ts; then
  echo "::error::src/my-command.ts no longer calls installToolkit(); the npx install would ship commands without their tooling."
  fail=1
fi

# Commands spell the call bare, so the install has to put the shim on PATH or every toolkit
# call reads as "not installed". Grep the call site, not the bare name — the function's own
# definition contains `linkOnPath(` too, so a looser pattern would pass with the call gone.
if ! grep -q 'linkOnPath(bin)' src/my-command.ts; then
  echo "::error::src/my-command.ts no longer calls linkOnPath(); the installed shim would not be callable as a bare my-command-tools."
  fail=1
fi

if [ "$fail" -eq 0 ]; then
  echo "check-commands: all command invariants satisfied ($(ls src/commands/*.md | wc -l | tr -d ' ') commands)."
fi
exit "$fail"
