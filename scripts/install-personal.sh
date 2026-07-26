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
# One source of truth for where Claude's config lives, so the commands and the toolkit
# can never land under two different roots.
CLAUDE_DIR="${CLAUDE_CONFIG_DIR:-$HOME/.claude}"
DEST_DIR="${CLAUDE_COMMANDS_DIR:-$CLAUDE_DIR/commands}"

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
  TOOLKIT_ROOT="$CLAUDE_DIR/my-command"
  mkdir -p "$TOOLKIT_ROOT/bin"
  # A prior npx run leaves a real directory here. `ln -sfn` against one creates
  # toolkit/toolkit inside it instead of replacing it, silently leaving the stale copy
  # live — so remove it first.
  rm -rf "$TOOLKIT_ROOT/toolkit"
  ln -s "$TOOLKIT_SRC" "$TOOLKIT_ROOT/toolkit"
  ln -sf "$TOOLKIT_SRC/bin/my-command-tools" "$TOOLKIT_ROOT/bin/my-command-tools"

  # Report what is actually on disk, not what was attempted.
  if [ "$(readlink "$TOOLKIT_ROOT/toolkit")" = "$TOOLKIT_SRC" ]; then
    echo "Linked the shared CLI into $TOOLKIT_ROOT/bin/my-command-tools (tracks this clone)."
  else
    echo "failed to point $TOOLKIT_ROOT/toolkit at $TOOLKIT_SRC" >&2
    exit 1
  fi

  # The fixed path above is not enough on its own: commands spell the call as a bare
  # `my-command-tools` (and declare it as `Bash(my-command-tools:*)`), so it has to be on
  # PATH. Link it into a user bin dir the PATH already has — never edit a shell profile.
  # Keep the candidate list in step with linkDirs() in src/toolkit/lib/paths.mjs.
  SHIM="$TOOLKIT_ROOT/bin/my-command-tools"
  LINK_DIR=""
  for candidate in "$HOME/.local/bin" "$HOME/bin"; do
    case ":$PATH:" in *":$candidate:"*) LINK_DIR="$candidate"; break ;; esac
  done

  if [ -z "$LINK_DIR" ]; then
    echo "note: neither ~/.local/bin nor ~/bin is on PATH, so 'my-command-tools' is not callable by name." >&2
    echo "      add it with: export PATH=\"$TOOLKIT_ROOT/bin:\$PATH\"" >&2
  elif [ -e "$LINK_DIR/my-command-tools" ] && [ ! -L "$LINK_DIR/my-command-tools" ]; then
    # A real file under our name belongs to something else; clobbering it isn't ours to do.
    echo "note: $LINK_DIR/my-command-tools exists and is not a symlink — left untouched." >&2
  else
    mkdir -p "$LINK_DIR"
    # -n so an existing link to a directory is replaced rather than followed into.
    ln -sfn "$SHIM" "$LINK_DIR/my-command-tools"
    echo "On PATH as 'my-command-tools' via $LINK_DIR/my-command-tools (new shells only)."
  fi
fi
