#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# Ignore the tooling's artifact directories once for this device, in the user's global git
# excludes file — never in a repository's own ignore file, which would leave a stray diff in
# every repository a workflow command ever touched.
#
# The pattern list lives in src/toolkit/verbs/doctor.mjs (DEVICE_IGNORE_PATTERNS);
# doctor.test.mjs pins these lines to that export.
DEVICE_IGNORE_PATTERNS=('.playwright-cli/' '.my-command/')

# git stores core.excludesFile as typed, so a ~/… path arrives unexpanded.
expand_tilde() {
  case "$1" in
  '~') printf '%s\n' "$HOME" ;;
  '~/'*) printf '%s\n' "$HOME/${1#\~/}" ;;
  *) printf '%s\n' "$1" ;;
  esac
}

# Every failure below returns 0: a read-only git config costs the ignore, not the install.
install_device_excludes() {
  local configured file dir pattern
  local -a missing=()

  configured="$(git config --global core.excludesFile 2>/dev/null || true)"
  if [ -n "$configured" ]; then
    file="$(expand_tilde "$configured")"
  else
    # git's own default location, which it reads whether or not the config names it.
    file="${XDG_CONFIG_HOME:-$HOME/.config}/git/ignore"
    if ! git config --global core.excludesFile "$file" 2>/dev/null; then
      echo "Device ignores: git config is not writable, so core.excludesFile was left unset." >&2
      return 0
    fi
  fi

  dir="$(dirname "$file")"
  if ! mkdir -p "$dir" 2>/dev/null; then
    echo "Device ignores: could not create $dir; left alone." >&2
    return 0
  fi
  if [ ! -e "$file" ] && ! : >"$file" 2>/dev/null; then
    echo "Device ignores: could not create $file; left alone." >&2
    return 0
  fi

  for pattern in "${DEVICE_IGNORE_PATTERNS[@]}"; do
    # -x matches a whole line, -F takes a dot literally. The slashless spelling counts too, so
    # a hand-written entry gets no near-duplicate. Matches `declares()` in doctor.mjs.
    grep -qxF -- "$pattern" "$file" 2>/dev/null && continue
    grep -qxF -- "${pattern%/}" "$file" 2>/dev/null && continue
    missing+=("$pattern")
  done

  if [ ${#missing[@]} -eq 0 ]; then
    echo "Device ignores: already in $file."
    return 0
  fi

  # Without this, a file not ending in a newline gets its last entry joined to ours. A
  # command substitution strips a trailing newline, so an empty result means one is there.
  if [ -s "$file" ] && [ -n "$(tail -c 1 "$file" 2>/dev/null)" ]; then
    printf '\n' >>"$file" 2>/dev/null || true
  fi

  # Appended, so the user's existing entries are neither rewritten nor reordered.
  if ! printf '%s\n' "${missing[@]}" >>"$file" 2>/dev/null; then
    echo "Device ignores: could not append to $file; left alone." >&2
    return 0
  fi
  echo "Device ignores: added ${missing[*]} to $file."
}

install_device_excludes

# Reachable on its own, so repairing a partial device ignore needs no command reinstall.
if [ "${1:-}" = "--excludes-only" ]; then
  exit 0
fi

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

# Report the device's Playwright and print the install command when it is absent. Never
# installs the CLI or a browser, and absence is not a failure — this block exits 0 either way.
# The probe order and this command live in src/toolkit/verbs/doctor.mjs
# (PLAYWRIGHT_PROBES, PLAYWRIGHT_INSTALL_HINT); doctor.test.mjs pins the two together.
PLAYWRIGHT_HINT="npm i -g playwright"

playwright_state() {
  command -v node >/dev/null 2>&1 || { echo unknown; return 0; }
  [ -f "$REPO_ROOT/src/toolkit/cli.mjs" ] || { echo unknown; return 0; }
  # `--compact` puts the result on one line, so the nested field is greppable without jq.
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
