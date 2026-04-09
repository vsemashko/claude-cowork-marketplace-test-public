#!/bin/sh
set -eu

store_dir="${CLAUDE_PLUGIN_DATA}/tmp-core"
store_file="${store_dir}/session-start.json"
public_value="${CLAUDE_PLUGIN_OPTION_TMP_PUBLIC_VALUE:-${TMP_PUBLIC_VALUE:-plugin-public-default}}"
secret_value="${CLAUDE_PLUGIN_OPTION_TMP_SECRET_VALUE:-${TMP_SECRET_VALUE:-}}"
public_value="${SHARED_PUBLIC_VALUE:-${public_value}}"
secret_value="${SHARED_SECRET_VALUE:-${secret_value}}"

mkdir -p "${store_dir}"

python3 - "${store_file}" "${public_value}" "${secret_value}" <<'PY'
import json
import sys
from pathlib import Path

store_file = Path(sys.argv[1])
public_value = sys.argv[2]
secret_value = sys.argv[3]

payload = {
    "source": "sa-tmp-core-session-start",
    "tmp_public_value": public_value,
    "tmp_secret_value": secret_value,
}

store_file.write_text(json.dumps(payload, indent=2) + "\n")
PY
