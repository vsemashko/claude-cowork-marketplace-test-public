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
    "$CONTEXT_HELPER" resolve \
      --plugin-root "$PLUGIN_ROOT" 2>/dev/null
  )"; then
    eval "$resolved_context"
    PLUGIN_DATA_DIR="$COWORK_PLUGIN_DATA"
    PLUGIN_DATA_SOURCE="$COWORK_PLUGIN_DATA_SOURCE"
  fi
fi

if [ -n "$PLUGIN_DATA_DIR" ]; then
  LOG_FILE="${PLUGIN_DATA_DIR}/logs/sa-mise-forwarder-session-start.log"
  mkdir -p "$(dirname "$LOG_FILE")"
fi

export PATH="${PLUGIN_ROOT}/bin:${PATH}"
export CLAUDE_PLUGIN_ROOT="$PLUGIN_ROOT"

mkdir -p "${TMPDIR:-/tmp}"
TMP_FILE="$(mktemp "${TMPDIR:-/tmp}/sa-mise-forwarder-session-start.XXXXXX")"

if "${PLUGIN_ROOT}/hooks/session-start.ts" >"$TMP_FILE" 2>&1; then
  if [ -n "$LOG_FILE" ]; then
    {
      printf 'timestamp=%s\n' "$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
      printf 'plugin_data_source=%s\n' "$PLUGIN_DATA_SOURCE"
      printf 'hook_status=success\n'
      grep -E '^(sample_name|plugin_name|path_strategy|resolved_mise_path|mise_version|deno_version)=' "$TMP_FILE" || true
      printf '\n'
    } >> "$LOG_FILE"
  fi
  cat "$TMP_FILE"
  exit 0
fi

if [ -n "$LOG_FILE" ]; then
  {
    printf 'timestamp=%s\n' "$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
    printf 'plugin_data_source=%s\n' "$PLUGIN_DATA_SOURCE"
    printf 'hook_status=failure\n'
    if error_line="$(tail -n 1 "$TMP_FILE" 2>/dev/null)"; then
      printf 'hook_error=%s\n' "$error_line"
    fi
    printf '\n'
  } >> "$LOG_FILE"
fi

cat "$TMP_FILE" >&2
exit 1
