#!/bin/sh

set -eu

SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
PLUGIN_ROOT="$(CDPATH= cd -- "$SCRIPT_DIR/../../.." && pwd)"

if [ -n "${SA_COWORK_PLUGIN_ROOT:-}" ]; then
  PLUGIN_ROOT="$SA_COWORK_PLUGIN_ROOT"
fi

PLUGIN_DATA_DIR="${SA_COWORK_PLUGIN_DATA:-${CLAUDE_PLUGIN_DATA:-}}"
HOOK_MARKER="${PLUGIN_DATA_DIR}/cowork-runtime-test/session-start.log"
SHIM_MISE="${PLUGIN_ROOT}/bin/mise"
SHIM_DENO="${PLUGIN_ROOT}/bin/deno"
RUNTIME_HELPER="${PLUGIN_ROOT}/scripts/runtime-shim.sh"

"$RUNTIME_HELPER" ensure
MISE_CACHE_PATH="$("$RUNTIME_HELPER" resolve mise)"
DENO_CACHE_PATH="$("$RUNTIME_HELPER" resolve deno)"

printf 'hook marker: %s\n' "$HOOK_MARKER"
if [ -f "$HOOK_MARKER" ]; then
  printf 'hook marker present\n'
else
  printf 'hook marker missing (open a fresh Cowork shell to trigger SessionStart)\n'
fi

printf 'shim mise: %s\n' "$SHIM_MISE"
printf 'cached mise: %s\n' "$MISE_CACHE_PATH"
printf 'shim deno: %s\n' "$SHIM_DENO"
printf 'cached deno: %s\n' "$DENO_CACHE_PATH"
printf 'mise version: %s\n' "$("$SHIM_MISE" --version)"
printf 'deno version: %s\n' "$("$SHIM_DENO" --version)"

printf 'running hello-world Deno script...\n'
"$SHIM_DENO" run "$SCRIPT_DIR/hello-runtime.ts"
