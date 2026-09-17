#!/usr/bin/env bash
# Make a fresh linked worktree behave like the main checkout. /task Step 1.5 runs this
# after creating one. Two things are gitignored and so absent from a new worktree:
# node_modules/ and dist/ — the latter is what the `my-command` bin points at.
#
#   bootstrap-worktree.sh [all|deps|build]
#
# There is no env leg: this repo has no gitignored .env files to link from the main
# checkout. There is no --print-verify-contract either — nothing here boots, so /verify
# has no app to exercise and skips the repo.
set -euo pipefail

TARGET="${1:-all}"

WORKTREE_ROOT="$(git rev-parse --show-toplevel)"
# --git-common-dir resolves to the MAIN checkout's .git even from a linked worktree,
# so its parent is the main checkout — no absolute path is ever hardcoded here, and
# nothing below depends on which branch either checkout sits on.
GIT_COMMON_DIR="$(cd "$WORKTREE_ROOT" && cd "$(git rev-parse --git-common-dir)" && pwd)"
MAIN_CHECKOUT="$(dirname "$GIT_COMMON_DIR")"
cd "$WORKTREE_ROOT"

if [ "$MAIN_CHECKOUT" = "$WORKTREE_ROOT" ]; then
  echo "bootstrap-worktree: run this from a linked worktree, not the main checkout" >&2
  exit 1
fi

case "$TARGET" in
  all | deps | build) ;;
  *)
    echo "bootstrap-worktree: unknown target '$TARGET' (expected all, deps or build)" >&2
    exit 1
    ;;
esac

# --ignore-scripts holds back the `prepare` hook so `deps` means deps and `build` stays
# the one thing that writes dist/.
if [ "$TARGET" = "all" ] || [ "$TARGET" = "deps" ]; then
  echo "bootstrap-worktree: installing dependencies"
  pnpm install --frozen-lockfile --ignore-scripts
fi

# Built from this worktree's own src/, never copied in from the main checkout: a copy
# would carry the other branch's output and hide the drift it was meant to surface.
if [ "$TARGET" = "all" ] || [ "$TARGET" = "build" ]; then
  echo "bootstrap-worktree: building dist/"
  pnpm build
fi

echo "bootstrap-worktree: ready ($TARGET)"
