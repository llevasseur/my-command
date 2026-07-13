#!/usr/bin/env bash
# Generate the namespaced plugin commands/ from the bare source in src/commands/.
# Bare source is the canonical form (edit there). This rewrites each sibling
# command reference (/task, /clean, …) to its namespaced form (/my-command:task)
# so the published plugin is self-contained. Run before committing a command change.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SRC_DIR="$REPO_ROOT/src/commands"
OUT_DIR="$REPO_ROOT/commands"
MANIFEST="$REPO_ROOT/.claude-plugin/plugin.json"

[ -d "$SRC_DIR" ] || { echo "no source dir: $SRC_DIR" >&2; exit 1; }

# Namespace = the plugin's name field; commands invoke as /<namespace>:<command>.
NS="$(sed -n 's/.*"name"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' "$MANIFEST" | head -1)"
[ -n "$NS" ] || { echo "could not read plugin name from $MANIFEST" >&2; exit 1; }

# Command set = source basenames, longest first so /task-bootstrap is rewritten
# before /task and never partially matched.
CMDS=$(cd "$SRC_DIR" && ls *.md | sed 's/\.md$//' | awk '{ print length, $0 }' | sort -rn | cut -d' ' -f2-)

rm -rf "$OUT_DIR"
mkdir -p "$OUT_DIR"

for f in "$SRC_DIR"/*.md; do
  name="$(basename "$f")"
  cp "$f" "$OUT_DIR/$name"
  for cmd in $CMDS; do
    # Rewrite /<cmd> to /<ns>:<cmd> only when not followed by a word char or hyphen,
    # so /task never eats /task-bootstrap and prefixes like /prisma are left alone.
    # The lookbehind keeps it from touching /cmd inside a file path (e.g.
    # ~/.claude/commands/sync.md) — only bare slash-command invocations are rewritten.
    NS="$NS" CMD="$cmd" perl -0777 -pi -e '
      my $ns = $ENV{NS}; my $c = quotemeta $ENV{CMD};
      s{(?<![\w./~-])/$c(?![\w-])}{/$ns:$ENV{CMD}}g;
    ' "$OUT_DIR/$name"
  done
done

echo "Built $(ls "$OUT_DIR" | wc -l | tr -d ' ') command(s) into commands/ with namespace \"$NS:\""
