#!/bin/sh

set -eu

PLUGIN_DATA_DIR="${CLAUDE_PLUGIN_DATA:-${SA_COWORK_PLUGIN_DATA:-}}"

if [ -z "$PLUGIN_DATA_DIR" ]; then
  echo "sa-cowork-runtime-test hook skipped: CLAUDE_PLUGIN_DATA is not set." >&2
  exit 0
fi

MARKER_DIR="${PLUGIN_DATA_DIR}/cowork-runtime-test"
MARKER_FILE="${MARKER_DIR}/session-start.log"
TIMESTAMP="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"

mkdir -p "$MARKER_DIR"
printf '%s session-start hook executed\n' "$TIMESTAMP" >> "$MARKER_FILE"
printf 'sa-cowork-runtime-test hook marker written to %s\n' "$MARKER_FILE"
