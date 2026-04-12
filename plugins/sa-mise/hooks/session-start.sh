#!/bin/sh

set -eu

HOOK_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
PLUGIN_ROOT="$(CDPATH= cd -- "$HOOK_DIR/.." && pwd)"
PLUGIN_DATA_DIR="${CLAUDE_PLUGIN_DATA:-}"
BASE_TMP_DIR="${TMPDIR:-/tmp}"
SNAPSHOT_DIR="${BASE_TMP_DIR}/sa-mise"
SNAPSHOT_FILE=''
STATUS_FILE=''
TMP_OUTPUT=''
TMP_ERROR=''

cleanup() {
  rm -f "${TMP_OUTPUT:-}" "${TMP_ERROR:-}"
}

trap cleanup EXIT HUP INT TERM

snapshot_key() {
  set -- $(printf '%s' "$PLUGIN_ROOT" | cksum)
  printf '%s\n' "$1"
}

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

mkdir -p "$BASE_TMP_DIR" "$SNAPSHOT_DIR"
SNAPSHOT_FILE="${SNAPSHOT_DIR}/$(snapshot_key).env"
TMP_OUTPUT="$(mktemp "${BASE_TMP_DIR}/sa-mise-hook-stdout.XXXXXX")"
TMP_ERROR="$(mktemp "${BASE_TMP_DIR}/sa-mise-hook-stderr.XXXXXX")"

if [ -n "$PLUGIN_DATA_DIR" ]; then
  mkdir -p "${PLUGIN_DATA_DIR}/sa-mise/linux-arm64"
  STATUS_FILE="${PLUGIN_DATA_DIR}/sa-mise/linux-arm64/hook-sample-status.txt"

  {
    printf 'CLAUDE_PLUGIN_ROOT=%s\n' "$PLUGIN_ROOT"
    printf 'CLAUDE_PLUGIN_DATA=%s\n' "$PLUGIN_DATA_DIR"
  } > "$SNAPSHOT_FILE"
fi

export PATH="${PLUGIN_ROOT}/bin:${PATH}"
export CLAUDE_PLUGIN_ROOT="$PLUGIN_ROOT"

if "${PLUGIN_ROOT}/scripts/examples/hook-sample.ts" >"$TMP_OUTPUT" 2>"$TMP_ERROR"; then
  write_status success
else
  write_status failure
fi

exit 0
