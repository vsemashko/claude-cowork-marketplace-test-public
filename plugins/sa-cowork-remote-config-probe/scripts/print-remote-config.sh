#!/bin/sh
set -eu

resolve_option() {
  key="$1"
  prefixed="CLAUDE_PLUGIN_OPTION_${key}"
  eval "value=\${${prefixed}:-\${${key}:-}}"
  printf '%s' "$value"
}

endpoint="$(resolve_option REMOTE_PROBE_ENDPOINT)"
token="$(resolve_option REMOTE_PROBE_TOKEN)"
label="$(resolve_option REMOTE_PROBE_LABEL)"
report_path="${CLAUDE_PLUGIN_DATA}/remote-config-probe/session-start-report.json"

if [ "${1:-}" = "--write-report" ]; then
  report_path="${2:?expected report path}"
fi

token_present="no"
token_length="0"
if [ -n "${token}" ]; then
  token_present="yes"
  token_length="${#token}"
fi

if [ "${1:-}" = "--write-report" ]; then
  REPORT_PATH="${report_path}" \
  REMOTE_PROBE_ENDPOINT_VALUE="${endpoint}" \
  REMOTE_PROBE_LABEL_VALUE="${label}" \
  REMOTE_PROBE_TOKEN_PRESENT="${token_present}" \
  REMOTE_PROBE_TOKEN_LENGTH="${token_length}" \
  python3 - <<'PY'
import json
import os
from pathlib import Path

report_path = Path(os.environ["REPORT_PATH"])
report_path.parent.mkdir(parents=True, exist_ok=True)
report = {
    "endpoint": os.environ["REMOTE_PROBE_ENDPOINT_VALUE"],
    "label": os.environ["REMOTE_PROBE_LABEL_VALUE"],
    "token_present": os.environ["REMOTE_PROBE_TOKEN_PRESENT"],
    "token_length": int(os.environ["REMOTE_PROBE_TOKEN_LENGTH"]),
    "report_path": str(report_path),
    "source": "session-start-hook"
}
report_path.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
PY
  exit 0
fi

echo "remote_config_probe"
echo "endpoint=${endpoint}"
echo "label=${label}"
echo "token_present=${token_present}"
echo "token_length=${token_length}"
echo "report_path=${report_path}"
if [ -f "${report_path}" ]; then
  echo "report_exists=yes"
else
  echo "report_exists=no"
fi
