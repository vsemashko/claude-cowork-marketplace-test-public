#!/bin/sh
set -eu

STORE_FILE="${CLAUDE_PLUGIN_DATA}/persist-probe/persisted-value.txt"

# Only persist if no value exists yet
if [ -s "${STORE_FILE}" ]; then
  exit 0
fi

# Generate QWE + 3 random digits
RANDOM_NUM=$(awk 'BEGIN{srand(); printf "%03d", int(rand()*900)+100}')
VALUE="QWE${RANDOM_NUM}"

# Store using the persist-probe script
"${CLAUDE_PLUGIN_ROOT}/skills/sa-cowork-persist-probe/scripts/persist-probe.sh" "${VALUE}"
