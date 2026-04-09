#!/bin/sh
set -eu

bridge_file="${HOME}/.cowork-probe/persist-probe/config-bridge.json"

if [ ! -f "${bridge_file}" ]; then
  echo "No extension bridge file found at ${bridge_file}"
  exit 0
fi

python3 - "${bridge_file}" <<'PY'
import json
import sys
from pathlib import Path

bridge_file = Path(sys.argv[1])
data = json.loads(bridge_file.read_text())

print(f"bridge_file={bridge_file}")
print(f"source={data.get('source', 'unknown')}")
print(f"probe_label={data.get('probe_label', '')}")
print(f"probe_secret_present={str(data.get('probe_secret_present', False)).lower()}")
print(f"probe_secret_length={data.get('probe_secret_length', 0)}")
PY
