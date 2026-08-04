#!/usr/bin/env bash
# Symlink the bare commands into ~/.claude/commands so they run as /task, /pr, …
# (no namespace). The links point back into this clone, so `git pull` here updates
# every command on this device. Run once per device after cloning; safe to re-run.
#
# Path-agnostic: resolves this repo from the script's own location, so it doesn't
# matter where the repo is cloned.
set -euo pipefail

INSTALL_HOOKS=1
for arg in "$@"; do
  case "$arg" in
    --no-hooks) INSTALL_HOOKS=0 ;;
    -h|--help)
      echo "usage: install-personal.sh [--no-hooks]"
      echo
      echo "  --no-hooks   Link commands and the toolkit, but do not register the"
      echo "               PreToolUse/Stop gates in settings.json."
      echo
      echo "The gates can also be turned off after installation without uninstalling:"
      echo "  export MY_COMMAND_HOOKS=0"
      exit 0 ;;
    *) echo "unknown option: $arg" >&2; exit 2 ;;
  esac
done

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

  # Commands spell the call as a bare `my-command-tools` (declared as
  # `Bash(my-command-tools:*)`), so the fixed path above is not enough — link it into a user
  # bin dir already on PATH, never by editing a shell profile.
  # Keep the candidate list in step with linkDirs() in src/toolkit/lib/paths.mjs and
  # linkOnPath() in src/my-command.ts.
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

# The workflow gates. Symlinked like the toolkit, so `git pull` in this clone updates them;
# registered in settings.json, because a hook script the harness does not know about never
# runs. Both halves are required for the gates to exist at all.
HOOKS_SRC="$REPO_ROOT/src/hooks"
if [ "$INSTALL_HOOKS" -eq 1 ] && [ -d "$HOOKS_SRC" ]; then
  HOOKS_ROOT="$CLAUDE_DIR/my-command"
  mkdir -p "$HOOKS_ROOT"
  # Same reason as the toolkit above: a prior npx run can leave a real directory here, and
  # `ln -sfn` against one would nest inside it instead of replacing it.
  rm -rf "$HOOKS_ROOT/hooks"
  ln -s "$HOOKS_SRC" "$HOOKS_ROOT/hooks"

  if [ "$(readlink "$HOOKS_ROOT/hooks")" != "$HOOKS_SRC" ]; then
    echo "failed to point $HOOKS_ROOT/hooks at $HOOKS_SRC" >&2
    exit 1
  fi

  if node "$HOOKS_SRC/install-hooks.mjs" --hooks-dir "$HOOKS_ROOT/hooks" >/dev/null; then
    echo "Registered the PreToolUse and Stop gates in $CLAUDE_DIR/settings.json."
    echo "  Off switch (no uninstall needed):  export MY_COMMAND_HOOKS=0"
    echo "  Remove the registration entirely:  node $HOOKS_ROOT/hooks/install-hooks.mjs --uninstall"
  else
    echo "note: could not register the gates in $CLAUDE_DIR/settings.json — the hook scripts are" >&2
    echo "      linked but inert until they are registered. Re-run:" >&2
    echo "      node $HOOKS_ROOT/hooks/install-hooks.mjs" >&2
  fi
elif [ "$INSTALL_HOOKS" -eq 0 ]; then
  echo "Skipped the workflow gates (--no-hooks)."
fi
