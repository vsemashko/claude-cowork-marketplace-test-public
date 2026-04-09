#!/bin/sh
set -eu

session_file="${CLAUDE_PLUGIN_DATA}/tmp-core/session-start.json"

if [ ! -f "${session_file}" ]; then
  echo "source=sa-tmp-core-session-start"
  echo "session_file=${session_file}"
  echo "session_found=false"
  exit 0
fi

python3 - "${session_file}" <<'PY'
import json
import sys
from pathlib import Path

session_file = Path(sys.argv[1])
data = json.loads(session_file.read_text())

print("source=sa-tmp-core-session-start")
print(f"session_file={session_file}")
print("session_found=true")
print(f"tmp_public_value={data.get('tmp_public_value', '')}")
print(f"tmp_secret_value={data.get('tmp_secret_value', '')}")
PY
