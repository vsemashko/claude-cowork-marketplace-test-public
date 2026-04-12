#!/bin/sh

set -eu

SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
PLUGIN_ROOT="$(CDPATH= cd -- "$SCRIPT_DIR/../../.." && pwd)"
"${PLUGIN_ROOT}/scripts/runtime-shim.sh" ensure
printf 'Cowork runtime cache is ready under %s\n' "${SA_COWORK_PLUGIN_DATA:-${CLAUDE_PLUGIN_DATA:-}}/cowork-runtime-test/linux-arm64"
