#!/bin/sh

set -eu

HOOK_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
PLUGIN_ROOT="$(CDPATH= cd -- "$HOOK_DIR/.." && pwd)"
CONTEXT_HELPER="${PLUGIN_ROOT}/scripts/cowork-plugin-context.sh"
PLUGIN_DATA_DIR=''
PLUGIN_DATA_SOURCE=''
LOG_FILE=''
TMP_FILE=''

fail() {
  printf '%s\n' "$1" >&2
  exit 1
}

cleanup() {
  rm -f "${TMP_FILE:-}"
}

trap cleanup EXIT HUP INT TERM

detect_platform() {
  if [ -n "${SA_MISE_FORCE_PLATFORM:-}" ]; then
    printf '%s\n' "$SA_MISE_FORCE_PLATFORM"
    return 0
  fi

  os_raw="$(uname -s 2>/dev/null)"
  arch_raw="$(uname -m 2>/dev/null)"
  os=''
  arch=''
  musl=''

  case "$os_raw" in
    Darwin)
      os='macos'
      ;;
    Linux)
      os='linux'
      ;;
    *)
      fail "Unsupported sa-mise-cross-plugin platform: ${os_raw}-${arch_raw}"
      ;;
  esac

  case "$arch_raw" in
    x86_64)
      arch='x64'
      ;;
    aarch64|arm64)
      arch='arm64'
      ;;
    armv7l)
      arch='armv7'
      ;;
    *)
      fail "Unsupported sa-mise-cross-plugin platform: ${os}-${arch_raw}"
      ;;
  esac

  if [ "$os" = 'linux' ] && command -v ldd >/dev/null 2>&1; then
    if [ "${MISE_INSTALL_MUSL:-}" = '1' ] || [ "${MISE_INSTALL_MUSL:-}" = 'true' ]; then
      musl='-musl'
    elif [ "$(uname -o 2>/dev/null || true)" = 'Android' ]; then
      musl='-musl'
    elif ldd /bin/ls 2>/dev/null | grep -q 'musl'; then
      musl='-musl'
    fi
  fi

  printf '%s-%s%s\n' "$os" "$arch" "$musl"
}

validate_supported_platform() {
  case "$1" in
    linux-x64|linux-x64-musl|linux-arm64|linux-arm64-musl|linux-armv7|linux-armv7-musl|macos-x64|macos-arm64)
      return 0
      ;;
    *)
      fail "Unsupported sa-mise-cross-plugin platform: $1"
      ;;
  esac
}

read_marker_value() {
  marker_path="$1"
  key_name="$2"

  while IFS='=' read -r key value; do
    if [ "$key" = "$key_name" ]; then
      printf '%s\n' "$value"
      return 0
    fi
  done < "$marker_path"

  return 1
}

[ -x "$CONTEXT_HELPER" ] || fail "Missing Cowork context helper: $CONTEXT_HELPER"

resolved_context="$(
  "$CONTEXT_HELPER" resolve \
    --plugin-root "$PLUGIN_ROOT" 2>&1
)" || fail "$resolved_context"
eval "$resolved_context"

PLUGIN_DATA_DIR="$COWORK_PLUGIN_DATA"
PLUGIN_DATA_SOURCE="$COWORK_PLUGIN_DATA_SOURCE"
LOG_FILE="${PLUGIN_DATA_DIR}/logs/sa-mise-cross-plugin-session-start.log"
mkdir -p "$(dirname "$LOG_FILE")"

export CLAUDE_PLUGIN_ROOT="$PLUGIN_ROOT"

path_strategy=''
resolved_mise_path=''

if existing_mise_path="$(command -v mise 2>/dev/null || true)"; then
  if [ -n "$existing_mise_path" ]; then
    path_strategy='path'
    resolved_mise_path="$existing_mise_path"
  fi
fi

if [ -z "$resolved_mise_path" ]; then
  PLATFORM="$(detect_platform)"
  validate_supported_platform "$PLATFORM"

  CACHE_ROOT="${PLUGIN_DATA_DIR}/${PLATFORM}"
  INSTALL_MARKER="${CACHE_ROOT}/install-status.txt"
  [ -f "$INSTALL_MARKER" ] || fail "sa-mise is not warmed yet. Install and run sa-mise before using sa-mise-cross-plugin."

  resolved_mise_path="$(read_marker_value "$INSTALL_MARKER" 'mise_path' 2>/dev/null || true)"
  [ -n "$resolved_mise_path" ] || fail "sa-mise install marker does not expose mise_path. Re-run sa-mise to rebuild the runtime."
  [ -x "$resolved_mise_path" ] || fail "sa-mise runtime is missing at $resolved_mise_path. Re-run sa-mise to rebuild the runtime."

  export SA_MISE_ORIGINAL_HOME="${HOME:-}"
  export HOME="${CACHE_ROOT}/home"
  export MISE_DATA_DIR="${CACHE_ROOT}/mise-data"
  export MISE_CACHE_DIR="${CACHE_ROOT}/mise-cache"
  export MISE_CONFIG_DIR="${CACHE_ROOT}/mise-config"
  export MISE_STATE_DIR="${CACHE_ROOT}/mise-state"
  export PATH="$(dirname "$resolved_mise_path"):${PATH}"
  path_strategy='install-marker'
fi

export SA_MISE_PATH_STRATEGY="$path_strategy"
export SA_MISE_RESOLVED_PATH="$resolved_mise_path"

mkdir -p "${TMPDIR:-/tmp}"
TMP_FILE="$(mktemp "${TMPDIR:-/tmp}/sa-mise-cross-plugin-session-start.XXXXXX")"

if "${PLUGIN_ROOT}/hooks/session-start.ts" >"$TMP_FILE" 2>&1; then
  {
    printf 'timestamp=%s\n' "$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
    printf 'plugin_data_source=%s\n' "$PLUGIN_DATA_SOURCE"
    printf 'hook_status=success\n'
    grep -E '^(sample_name|plugin_name|path_strategy|resolved_mise_path|mise_version|deno_version)=' "$TMP_FILE" || true
    printf '\n'
  } >> "$LOG_FILE"
  cat "$TMP_FILE"
  exit 0
fi

{
  printf 'timestamp=%s\n' "$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
  printf 'plugin_data_source=%s\n' "$PLUGIN_DATA_SOURCE"
  printf 'hook_status=failure\n'
  if error_line="$(tail -n 1 "$TMP_FILE" 2>/dev/null)"; then
    printf 'hook_error=%s\n' "$error_line"
  fi
  printf '\n'
} >> "$LOG_FILE"

cat "$TMP_FILE" >&2
exit 1
