#!/bin/sh

set -eu

HOOK_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
PLUGIN_ROOT="$(CDPATH= cd -- "$HOOK_DIR/.." && pwd)"
CONTEXT_HELPER="${PLUGIN_ROOT}/scripts/cowork-plugin-context.sh"
PLUGIN_DATA_DIR=''
PLUGIN_DATA_SOURCE=''
PLUGIN_STATE_FILE=''
LOG_FILE=''

if [ -x "$CONTEXT_HELPER" ]; then
  if resolved_context="$(
    "$CONTEXT_HELPER" capture \
      --plugin-root "$PLUGIN_ROOT" \
      --plugin-name sa-mise \
      --override-env-var SA_MISE_PLUGIN_DATA \
      --format shell 2>/dev/null
  )"; then
    eval "$resolved_context"
    PLUGIN_DATA_DIR="$COWORK_PLUGIN_DATA"
    PLUGIN_DATA_SOURCE="$COWORK_PLUGIN_DATA_SOURCE"
    PLUGIN_STATE_FILE="$COWORK_PLUGIN_STATE_FILE"
  fi
fi

if [ -n "$PLUGIN_DATA_DIR" ]; then
  LOG_FILE="${PLUGIN_DATA_DIR}/logs/sa-mise/session-start.log"
  mkdir -p "$(dirname "$LOG_FILE")"
fi

export PATH="${PLUGIN_ROOT}/bin:${PATH}"
export CLAUDE_PLUGIN_ROOT="$PLUGIN_ROOT"

if [ -z "$LOG_FILE" ]; then
  exit 0
fi

{
  printf '=== %s SessionStart ===\n' "$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
  printf 'plugin_root=%s\n' "$PLUGIN_ROOT"
  printf 'plugin_data=%s\n' "$PLUGIN_DATA_DIR"
  printf 'plugin_data_source=%s\n' "$PLUGIN_DATA_SOURCE"
  printf 'plugin_state_file=%s\n' "$PLUGIN_STATE_FILE"
  printf -- '-- sample output --\n'
} >> "$LOG_FILE"

if "${PLUGIN_ROOT}/scripts/examples/hook-sample.ts" >>"$LOG_FILE" 2>&1; then
  printf 'hook_status=success\n\n' >> "$LOG_FILE"
else
  printf 'hook_status=failure\n\n' >> "$LOG_FILE"
fi

exit 0
