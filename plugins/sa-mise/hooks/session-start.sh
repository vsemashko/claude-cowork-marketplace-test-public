#!/bin/sh

set -eu

HOOK_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
PLUGIN_ROOT="$(CDPATH= cd -- "$HOOK_DIR/.." && pwd)"
PLUGIN_NAME="$(basename "$PLUGIN_ROOT")"
LOG_FILE="${HOME}/.sa-mise-session-start.log"
TMP_FILE=''

cleanup() {
  rm -f "${TMP_FILE:-}"
}

trap cleanup EXIT HUP INT TERM

export PATH="${PLUGIN_ROOT}/bin:${PATH}"
mkdir -p "$(dirname "$LOG_FILE")"

mkdir -p "${TMPDIR:-/tmp}"
TMP_FILE="$(mktemp "${TMPDIR:-/tmp}/sa-mise-session-start.XXXXXX")"

if "${PLUGIN_ROOT}/scripts/session-start-sample.ts" >"$TMP_FILE" 2>&1; then
  {
    printf 'timestamp=%s\n' "$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
    printf 'plugin_name=%s\n' "$PLUGIN_NAME"
    printf 'hook_status=success\n'
    cat "$TMP_FILE"
    printf '\n'
  } >> "$LOG_FILE"
else
  {
    printf 'timestamp=%s\n' "$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
    printf 'plugin_name=%s\n' "$PLUGIN_NAME"
    printf 'hook_status=failure\n'
    cat "$TMP_FILE"
    printf '\n'
  } >> "$LOG_FILE"
fi

exit 0
