#!/bin/sh

set -eu

HOOK_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
PLUGIN_ROOT="$(CDPATH= cd -- "$HOOK_DIR/.." && pwd)"
CONTEXT_HELPER="${PLUGIN_ROOT}/scripts/cowork-plugin-context.sh"
PLUGIN_DATA_DIR=''
PLUGIN_DATA_SOURCE=''
LOG_FILE=''
TMP_FILE=''

cleanup() {
  rm -f "${TMP_FILE:-}"
}

trap cleanup EXIT HUP INT TERM

if [ -x "$CONTEXT_HELPER" ]; then
  if resolved_context="$(
    "$CONTEXT_HELPER" capture \
      --plugin-root "$PLUGIN_ROOT" \
      --plugin-name sa-mise \
      --format shell 2>/dev/null
  )"; then
    eval "$resolved_context"
    PLUGIN_DATA_DIR="$COWORK_PLUGIN_DATA"
    PLUGIN_DATA_SOURCE="$COWORK_PLUGIN_DATA_SOURCE"
  fi
fi

if [ -n "$PLUGIN_DATA_DIR" ]; then
  LOG_FILE="${PLUGIN_DATA_DIR}/logs/session-start.log"
  mkdir -p "$(dirname "$LOG_FILE")"
fi

export PATH="${PLUGIN_ROOT}/bin:${PATH}"
export CLAUDE_PLUGIN_ROOT="$PLUGIN_ROOT"

if [ -z "$LOG_FILE" ]; then
  exit 0
fi

{
  printf 'timestamp=%s\n' "$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
  printf 'plugin_data_source=%s\n' "$PLUGIN_DATA_SOURCE"
} >> "$LOG_FILE"

mkdir -p "${TMPDIR:-/tmp}"
TMP_FILE="$(mktemp "${TMPDIR:-/tmp}/sa-mise-session-start.XXXXXX")"

if "${PLUGIN_ROOT}/scripts/examples/hook-sample.ts" >"$TMP_FILE" 2>&1; then
  printf 'hook_status=success\n' >> "$LOG_FILE"
  grep -E '^(sample_name|mise_version|deno_version)=' "$TMP_FILE" >> "$LOG_FILE" || true
  printf '\n' >> "$LOG_FILE"
else
  printf 'hook_status=failure\n' >> "$LOG_FILE"
  if error_line="$(tail -n 1 "$TMP_FILE" 2>/dev/null)"; then
    printf 'hook_error=%s\n' "$error_line" >> "$LOG_FILE"
  fi
  printf '\n' >> "$LOG_FILE"
fi

exit 0
