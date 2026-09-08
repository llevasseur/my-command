#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SRC_DIR="$REPO_ROOT/commands"
DEST_DIR="${CLAUDE_COMMANDS_DIR:-$HOME/.claude/commands}"
MANIFEST="$REPO_ROOT/.claude-plugin/plugin.json"

[ -d "$SRC_DIR" ] || { echo "no plugin commands dir: $SRC_DIR" >&2; exit 1; }
[ -f "$MANIFEST" ] || { echo "no plugin manifest: $MANIFEST" >&2; exit 1; }

NS="$(sed -n 's/.*"name"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' "$MANIFEST" | head -1)"
[ -n "$NS" ] || { echo "could not read plugin name from $MANIFEST" >&2; exit 1; }

mkdir -p "$DEST_DIR"

CMDS=$(cd "$SRC_DIR" && ls *.md | sed 's/\.md$//' | awk '{ print length, $0 }' | sort -rn | cut -d' ' -f2-)

installed=0
for source in "$SRC_DIR"/*.md; do
  name="$(basename "$source")"
  target="$DEST_DIR/$name"
  temp="$target.tmp.$$"

  cp "$source" "$temp"
  for cmd in $CMDS; do
    NS="$NS" CMD="$cmd" perl -0777 -pi -e '
      my $ns = quotemeta $ENV{NS}; my $c = quotemeta $ENV{CMD};
      s{(?<![\w./~-])/$ns:$c(?![\w-])}{/$ENV{CMD}}g;
    ' "$temp"
  done
  mv "$temp" "$target"
  installed=$((installed+1))
done

echo "Installed $installed marketplace command(s) into $DEST_DIR as bare commands."

# The subagent definitions every dispatch site names by subagent_type; a command naming one the
# device does not have silently takes the default agent instead. Symlinked rather than copied and
# rewritten like the commands above, because these carry no namespaced /command references.
AGENTS_SRC="$REPO_ROOT/agents"
AGENTS_DEST="${CLAUDE_AGENTS_DIR:-$HOME/.claude/agents}"
if [ -d "$AGENTS_SRC" ]; then
  mkdir -p "$AGENTS_DEST"
  agents_linked=0 agents_skipped=0
  for f in "$AGENTS_SRC"/*.md; do
    [ -e "$f" ] || continue
    name="$(basename "$f")"
    target="$AGENTS_DEST/$name"
    if [ -L "$target" ]; then
      # Repoint an existing link so a moved clone still resolves.
      ln -sf "$f" "$target"; agents_linked=$((agents_linked+1)); continue
    fi
    if [ -e "$target" ]; then
      echo "skip: $name already exists as a real file in $AGENTS_DEST (not overwriting)" >&2
      agents_skipped=$((agents_skipped+1)); continue
    fi
    ln -s "$f" "$target"; agents_linked=$((agents_linked+1))
  done
  echo "Linked $agents_linked subagent definition(s) into $AGENTS_DEST (skipped $agents_skipped)."
fi

# Playwright is a device-level fact, not something this installer provides: a closed-loop
# check reads it off `my-command-tools doctor` to pick a driver tier. It is *printed* when
# absent and never installed — neither the CLI nor a browser. Downloading a browser is not
# a side effect anyone asked for by installing command files, and a device without
# Playwright has not opted into that tier. Absent Playwright is therefore never a failure
# here: this block reports whatever it finds and exits successfully either way.
#
# The probe order and the printed command both live in src/toolkit/verbs/doctor.mjs
# (PLAYWRIGHT_PROBES, PLAYWRIGHT_INSTALL_HINT) and are read back off `doctor` rather than
# re-probed here, so there is one place a probe can change. doctor.test.mjs pins the
# command below to that export.
PLAYWRIGHT_HINT="npm i -g playwright"

playwright_state() {
  command -v node >/dev/null 2>&1 || { echo unknown; return 0; }
  [ -f "$REPO_ROOT/src/toolkit/cli.mjs" ] || { echo unknown; return 0; }
  # `--compact` prints the whole result on one line, so the nested field is greppable
  # without a JSON parser — the toolkit ships zero dependencies and jq is not a given.
  if node "$REPO_ROOT/src/toolkit/cli.mjs" doctor --compact 2>/dev/null |
    grep -q '"playwright":{"installed":true'; then
    echo present
  else
    echo absent
  fi
}

case "$(playwright_state)" in
present)
  echo "Playwright: present on this device."
  ;;
absent)
  echo "Playwright: not on this device, so a closed-loop check will use its HTTP tier."
  echo "To add it, run this yourself (this installer will not):"
  echo "  $PLAYWRIGHT_HINT"
  ;;
*)
  echo "Playwright: not checked (no node on PATH, or no toolkit source beside this script)."
  ;;
esac
