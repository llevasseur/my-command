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
