#!/bin/sh

set -eu

HOOK_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
PLUGIN_ROOT="$(CDPATH= cd -- "$HOOK_DIR/.." && pwd)"
CONTEXT_HELPER="${PLUGIN_ROOT}/scripts/cowork-plugin-context.sh"
PLUGIN_DATA_DIR=''
PLUGIN_DATA_SOURCE=''
PLUGIN_STATE_FILE=''
BASE_TMP_DIR="${TMPDIR:-/tmp}"
STATUS_FILE=''
LOG_FILE=''
TMP_OUTPUT=''
TMP_ERROR=''

cleanup() {
  rm -f "${TMP_OUTPUT:-}" "${TMP_ERROR:-}"
}

trap cleanup EXIT HUP INT TERM

write_status() {
  status="$1"
  if [ -z "$PLUGIN_DATA_DIR" ]; then
    return 0
  fi

  mkdir -p "$(dirname "$STATUS_FILE")"
  {
    printf 'status=%s\n' "$status"
    printf 'timestamp=%s\n' "$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
    printf 'plugin_root=%s\n' "$PLUGIN_ROOT"
    printf 'plugin_data=%s\n' "$PLUGIN_DATA_DIR"
    printf 'plugin_data_source=%s\n' "$PLUGIN_DATA_SOURCE"
    printf 'plugin_state_file=%s\n' "$PLUGIN_STATE_FILE"
    if [ -f "$TMP_OUTPUT" ]; then
      printf 'stdout<<EOF\n'
      cat "$TMP_OUTPUT"
      printf 'EOF\n'
    fi
    if [ -f "$TMP_ERROR" ]; then
      printf 'stderr<<EOF\n'
      cat "$TMP_ERROR"
      printf 'EOF\n'
    fi
  } > "$STATUS_FILE"
}

append_log() {
  status="$1"
  if [ -z "$LOG_FILE" ]; then
    return 0
  fi

  mkdir -p "$(dirname "$LOG_FILE")"
  {
    printf '=== %s status=%s ===\n' "$(date -u +"%Y-%m-%dT%H:%M:%SZ")" "$status"
    printf 'plugin_root=%s\n' "$PLUGIN_ROOT"
    printf 'plugin_data=%s\n' "$PLUGIN_DATA_DIR"
    printf 'plugin_data_source=%s\n' "$PLUGIN_DATA_SOURCE"
    printf 'plugin_state_file=%s\n' "$PLUGIN_STATE_FILE"
    if [ -f "$TMP_OUTPUT" ]; then
      printf -- '-- stdout --\n'
      cat "$TMP_OUTPUT"
    fi
    if [ -f "$TMP_ERROR" ]; then
      printf -- '-- stderr --\n'
      cat "$TMP_ERROR"
    fi
    printf '\n'
  } >> "$LOG_FILE"
}

mkdir -p "$BASE_TMP_DIR"
TMP_OUTPUT="$(mktemp "${BASE_TMP_DIR}/sa-mise-hook-stdout.XXXXXX")"
TMP_ERROR="$(mktemp "${BASE_TMP_DIR}/sa-mise-hook-stderr.XXXXXX")"

if [ -x "$CONTEXT_HELPER" ]; then
  if resolved_context="$(
    "$CONTEXT_HELPER" capture \
      --plugin-root "$PLUGIN_ROOT" \
      --plugin-name sa-mise \
      --override-env-var SA_MISE_PLUGIN_DATA \
      --format shell 2>"$TMP_ERROR"
  )"; then
    eval "$resolved_context"
    PLUGIN_DATA_DIR="$COWORK_PLUGIN_DATA"
    PLUGIN_DATA_SOURCE="$COWORK_PLUGIN_DATA_SOURCE"
    PLUGIN_STATE_FILE="$COWORK_PLUGIN_STATE_FILE"
  fi
fi

if [ -n "$PLUGIN_DATA_DIR" ]; then
  mkdir -p "${PLUGIN_DATA_DIR}/sa-mise/linux-arm64"
  STATUS_FILE="${PLUGIN_DATA_DIR}/sa-mise/linux-arm64/hook-sample-status.txt"
  LOG_FILE="${PLUGIN_DATA_DIR}/sa-mise/linux-arm64/hook-session-start.log"
fi

export PATH="${PLUGIN_ROOT}/bin:${PATH}"
export CLAUDE_PLUGIN_ROOT="$PLUGIN_ROOT"

if "${PLUGIN_ROOT}/scripts/examples/hook-sample.ts" >"$TMP_OUTPUT" 2>"$TMP_ERROR"; then
  write_status success
  append_log success
else
  write_status failure
  append_log failure
fi

exit 0
