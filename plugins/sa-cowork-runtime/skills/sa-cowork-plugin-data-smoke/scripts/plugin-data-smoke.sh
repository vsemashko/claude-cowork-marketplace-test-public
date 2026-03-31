#!/bin/sh
set -eu

PLUGIN_DATA="${CLAUDE_PLUGIN_DATA:-${SA_COWORK_PLUGIN_DATA:-}}"

if [ -z "${PLUGIN_DATA}" ]; then
  echo "CLAUDE_PLUGIN_DATA is not set" >&2
  exit 1
fi

STORE_DIR="${PLUGIN_DATA}/plugin-data-smoke"
STORE_FILE="${STORE_DIR}/persisted-value.txt"

mkdir -p "${STORE_DIR}"

if [ "$#" -gt 0 ]; then
  VALUE="$*"
  printf '%s' "${VALUE}" > "${STORE_FILE}"
  printf 'Stored value in %s\n' "${STORE_FILE}"
  exit 0
fi

if [ -s "${STORE_FILE}" ]; then
  printf 'Stored value: %s\n' "$(cat "${STORE_FILE}")"
else
  printf 'No stored value found in %s\n' "${STORE_FILE}"
fi
