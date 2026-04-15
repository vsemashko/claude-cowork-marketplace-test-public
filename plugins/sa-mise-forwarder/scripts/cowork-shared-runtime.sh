#!/bin/sh

set -eu

SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
PLUGIN_ROOT="$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd)"
CONTEXT_HELPER="${SCRIPT_DIR}/cowork-plugin-context.sh"
TOOL_NAME='mise'

. "$SCRIPT_DIR/cowork-runtime-common.sh"

[ -x "$CONTEXT_HELPER" ] || cowork_runtime_fail "Missing Cowork context helper: $CONTEXT_HELPER"

resolved_context="$(
  "$CONTEXT_HELPER" resolve \
    --plugin-root "$PLUGIN_ROOT" 2>&1
)" || cowork_runtime_fail "$resolved_context"
eval "$resolved_context"

PLUGIN_DATA_DIR="$COWORK_PLUGIN_DATA"
PLUGIN_DATA_SOURCE="$COWORK_PLUGIN_DATA_SOURCE"
SHARED_ROOT="$COWORK_SHARED_ROOT"

[ -n "$SHARED_ROOT" ] || cowork_runtime_fail 'Cowork shared root must resolve before starting the shared runtime.'

PLATFORM="$(cowork_runtime_detect_platform)"
cowork_runtime_validate_platform "$PLATFORM"

resolved_binary_path="$(cowork_runtime_ensure_tool_available "$PLUGIN_DATA_DIR" "$SHARED_ROOT" "$PLATFORM" "$TOOL_NAME" "$PLUGIN_DATA_SOURCE")"
cowork_runtime_prepare_runtime_dirs "$PLUGIN_DATA_DIR" "$TOOL_NAME" "$PLATFORM"

exec env \
  SA_MISE_ORIGINAL_HOME="${HOME:-}" \
  HOME="$(cowork_runtime_tool_home_dir "$PLUGIN_DATA_DIR" "$TOOL_NAME" "$PLATFORM")" \
  MISE_DATA_DIR="$(cowork_runtime_tool_data_dir "$PLUGIN_DATA_DIR" "$TOOL_NAME" "$PLATFORM")" \
  MISE_CACHE_DIR="$(cowork_runtime_tool_cache_dir "$PLUGIN_DATA_DIR" "$TOOL_NAME" "$PLATFORM")" \
  MISE_CONFIG_DIR="$(cowork_runtime_tool_config_dir "$PLUGIN_DATA_DIR" "$TOOL_NAME" "$PLATFORM")" \
  MISE_STATE_DIR="$(cowork_runtime_tool_state_dir "$PLUGIN_DATA_DIR" "$TOOL_NAME" "$PLATFORM")" \
  "$resolved_binary_path" "$@"
