#!/bin/sh
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PLUGIN_ROOT="$(CDPATH= cd -- "$SCRIPT_DIR/../.." && pwd)"
TARGET_TS="$SCRIPT_DIR/run.ts"

if command -v mise >/dev/null 2>&1 && mise exec -C "$PLUGIN_ROOT" deno -- deno --version >/dev/null 2>&1; then
  exec mise exec -C "$PLUGIN_ROOT" deno -- deno run --allow-all "$TARGET_TS" "$@"
fi

if command -v deno >/dev/null 2>&1 && deno --version >/dev/null 2>&1; then
  exec deno run --allow-all "$TARGET_TS" "$@"
fi

echo "stashaway-agents runtime is missing. Run `stash ai agents setup` to install mise and deno." >&2
exit 1
