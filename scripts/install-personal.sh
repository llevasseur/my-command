#!/usr/bin/env bash
# Symlink the bare commands into ~/.claude/commands so they run as /task, /pr, …
# (no namespace). The links point back into this clone, so `git pull` here updates
# every command on this device. Run once per device after cloning; safe to re-run.
#
# Path-agnostic: resolves this repo from the script's own location, so it doesn't
# matter where the repo is cloned.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SRC_DIR="$REPO_ROOT/src/commands"
DEST_DIR="${CLAUDE_COMMANDS_DIR:-$HOME/.claude/commands}"

[ -d "$SRC_DIR" ] || { echo "no source dir: $SRC_DIR" >&2; exit 1; }
mkdir -p "$DEST_DIR"

linked=0 skipped=0
for f in "$SRC_DIR"/*.md; do
  name="$(basename "$f")"
  target="$DEST_DIR/$name"
  if [ -L "$target" ]; then
    # Already a symlink — repoint it (handles the clone moving) and move on.
    ln -sf "$f" "$target"; linked=$((linked+1)); continue
  fi
  if [ -e "$target" ]; then
    echo "skip: $name already exists as a real file in $DEST_DIR (not overwriting)" >&2
    skipped=$((skipped+1)); continue
  fi
  ln -s "$f" "$target"; linked=$((linked+1))
done

echo "Linked $linked command(s) into $DEST_DIR (skipped $skipped)."
echo "They run as bare slash commands (e.g. /task). Run 'git pull' in $REPO_ROOT to update."

# Point the device-wide toolkit at this clone too, so the shared CLI tracks `git pull`
# the same way the commands do. Symlinked rather than copied for exactly that reason.
TOOLKIT_SRC="$REPO_ROOT/src/toolkit"
if [ -d "$TOOLKIT_SRC" ]; then
  TOOLKIT_ROOT="${CLAUDE_CONFIG_DIR:-$HOME/.claude}/my-command"
  mkdir -p "$TOOLKIT_ROOT/bin"
  ln -sfn "$TOOLKIT_SRC" "$TOOLKIT_ROOT/toolkit"
  ln -sf "$TOOLKIT_SRC/bin/my-command-tools" "$TOOLKIT_ROOT/bin/my-command-tools"
  echo "Linked the shared CLI into $TOOLKIT_ROOT/bin/my-command-tools (tracks this clone)."
fi
