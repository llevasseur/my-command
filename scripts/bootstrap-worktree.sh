#!/usr/bin/env bash
# Make a fresh linked worktree behave like the main checkout. /task Step 1.5 runs this.
# node_modules/ and dist/ are gitignored; dist/ is what the `my-command` bin points at.
#
#   bootstrap-worktree.sh [all|deps|build]
set -euo pipefail

TARGET="${1:-all}"

WORKTREE_ROOT="$(git rev-parse --show-toplevel)"
# --git-common-dir resolves to the MAIN checkout's .git even from a linked worktree.
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

# --ignore-scripts holds back the `prepare` hook, which would otherwise run tsc here.
if [ "$TARGET" = "all" ] || [ "$TARGET" = "deps" ]; then
  echo "bootstrap-worktree: installing dependencies"
  pnpm install --frozen-lockfile --ignore-scripts
fi

# Built from this worktree's own src/ — never copied in from the main checkout, which
# would carry another branch's output.
if [ "$TARGET" = "all" ] || [ "$TARGET" = "build" ]; then
  echo "bootstrap-worktree: building dist/"
  pnpm build
fi

echo "bootstrap-worktree: ready ($TARGET)"
