#!/bin/sh
set -eu

STORE_FILE="${CLAUDE_PLUGIN_DATA}/persist-probe/persisted-value.txt"

# Only persist if no value exists yet
if [ -s "${STORE_FILE}" ]; then
  exit 0
fi

# Use the configured label or default to QWE
LABEL="${CLAUDE_PLUGIN_OPTION_PROBE_LABEL:-QWE}"
RANDOM_NUM=$(awk 'BEGIN{srand(); printf "%03d", int(rand()*900)+100}')
VALUE="${LABEL}${RANDOM_NUM}"

# Store using the persist-probe script
"${CLAUDE_PLUGIN_ROOT}/skills/sa-cowork-persist-probe/scripts/persist-probe.sh" "${VALUE}"
