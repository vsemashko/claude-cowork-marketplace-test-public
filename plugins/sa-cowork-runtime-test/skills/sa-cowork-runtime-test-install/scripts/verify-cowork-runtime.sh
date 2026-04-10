#!/bin/sh

set -eu

SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
PLUGIN_ROOT="$(CDPATH= cd -- "$SCRIPT_DIR/../../.." && pwd)"

if [ -n "${SA_COWORK_PLUGIN_ROOT:-}" ]; then
  PLUGIN_ROOT="$SA_COWORK_PLUGIN_ROOT"
fi

BIN_DIR="${SA_COWORK_INSTALL_BIN_DIR:-${HOME:-}/.local/bin}"
PLUGIN_DATA_DIR="${SA_COWORK_PLUGIN_DATA:-${CLAUDE_PLUGIN_DATA:-}}"
HOOK_MARKER="${PLUGIN_DATA_DIR}/cowork-runtime-test/session-start.log"

"$SCRIPT_DIR/bootstrap-cowork-runtime.sh"

PATH="$BIN_DIR:$PATH"

printf 'hook marker: %s\n' "$HOOK_MARKER"
if [ -f "$HOOK_MARKER" ]; then
  printf 'hook marker present\n'
else
  printf 'hook marker missing (open a fresh Cowork shell to trigger SessionStart)\n'
fi

printf 'running hello-world Deno script...\n'
deno run "$SCRIPT_DIR/hello-runtime.ts"
