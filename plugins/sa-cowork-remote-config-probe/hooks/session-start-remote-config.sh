#!/bin/sh
set -eu

report_dir="${CLAUDE_PLUGIN_DATA}/remote-config-probe"
report_path="${report_dir}/session-start-report.json"

mkdir -p "${report_dir}"

bash "${CLAUDE_PLUGIN_ROOT}/scripts/print-remote-config.sh" --write-report "${report_path}" >/dev/null

echo "Remote config probe report written to ${report_path}"
