#!/usr/bin/env bash
# Link Codex-native skills and the shared toolkit from this clone into device scopes.
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
skills_dir="${CODEX_SKILLS_DIR:-$HOME/.agents/skills}"
codex_dir="${CODEX_HOME:-$HOME/.codex}"
toolkit_root="$codex_dir/my-command"
toolkit_bin="$toolkit_root/bin/my-command-tools"

mkdir -p "$skills_dir" "$toolkit_root/bin"

installed=0
skipped=0
for source in "$repo_root"/skills/*; do
  [ -f "$source/SKILL.md" ] || continue
  name="$(basename "$source")"
  target="$skills_dir/$name"
  if [ -L "$target" ]; then
    ln -sfn "$source" "$target"
    installed=$((installed + 1))
  elif [ -e "$target" ]; then
    echo "skip $name: $target exists and is not a symlink"
    skipped=$((skipped + 1))
  else
    ln -s "$source" "$target"
    installed=$((installed + 1))
  fi
done

toolkit_target="$toolkit_root/toolkit"
if [ -L "$toolkit_target" ]; then
  ln -sfn "$repo_root/src/toolkit" "$toolkit_target"
elif [ -e "$toolkit_target" ]; then
  echo "skip toolkit: $toolkit_target exists and is not a symlink"
else
  ln -s "$repo_root/src/toolkit" "$toolkit_target"
fi

if [ -L "$toolkit_bin" ]; then
  ln -sfn "$repo_root/src/toolkit/bin/my-command-tools" "$toolkit_bin"
elif [ -e "$toolkit_bin" ]; then
  echo "skip shim: $toolkit_bin exists and is not a symlink"
else
  ln -s "$repo_root/src/toolkit/bin/my-command-tools" "$toolkit_bin"
fi

linked=''
for dir in "$HOME/.local/bin" "$HOME/bin"; do
  case ":${PATH:-}:" in
    *":$dir:"*)
      mkdir -p "$dir"
      path_link="$dir/my-command-tools"
      if [ -L "$path_link" ]; then
        ln -sfn "$toolkit_bin" "$path_link"
        linked="$path_link"
      elif [ ! -e "$path_link" ]; then
        ln -s "$toolkit_bin" "$path_link"
        linked="$path_link"
      fi
      break
      ;;
  esac
done

echo "Linked $installed Codex skill(s); skipped $skipped existing real path(s)."
echo "Skills: $skills_dir"
echo "Toolkit: $toolkit_target"
if [ -n "$linked" ]; then
  echo "PATH: $linked"
else
  echo "PATH: no ~/.local/bin or ~/bin entry found; link $toolkit_bin manually."
fi
