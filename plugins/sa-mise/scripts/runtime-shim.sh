#!/bin/sh

set -eu

SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
PLUGIN_ROOT="$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd)"
CONTEXT_HELPER="${PLUGIN_ROOT}/scripts/cowork-plugin-context.sh"
TMP_DIR=''
INSTALL_SCRIPT_URL="${SA_MISE_INSTALL_SCRIPT_URL:-https://mise.jdx.dev/install.sh}"
PLATFORM=''

fail() {
  printf '%s\n' "$1" >&2
  exit 1
}

cleanup_temp() {
  if [ -n "$TMP_DIR" ] && [ -d "$TMP_DIR" ]; then
    rm -rf "$TMP_DIR"
  fi
}

trap cleanup_temp EXIT HUP INT TERM

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
      fail "Unsupported sa-mise platform: ${os_raw}-${arch_raw}"
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
      fail "Unsupported sa-mise platform: ${os}-${arch_raw}"
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
      fail "Unsupported sa-mise platform: $1"
      ;;
  esac
}

resolve_plugin_context() {
  [ -x "$CONTEXT_HELPER" ] || fail "Missing Cowork context helper: $CONTEXT_HELPER"

  resolved_context="$(
    "$CONTEXT_HELPER" resolve \
      --plugin-root "$PLUGIN_ROOT" 2>&1
  )" || fail "$resolved_context"
  eval "$resolved_context"

  PLUGIN_DATA_DIR="$COWORK_PLUGIN_DATA"
  PLUGIN_DATA_SOURCE="$COWORK_PLUGIN_DATA_SOURCE"

  CACHE_ROOT="${PLUGIN_DATA_DIR}/${PLATFORM}"
  CACHE_BIN_PATH="${CACHE_ROOT}/bin/mise"
  INSTALL_MARKER="${CACHE_ROOT}/install-status.txt"
  MISE_HOME_DIR="${CACHE_ROOT}/home"
  MISE_DATA_DIR_PATH="${CACHE_ROOT}/mise-data"
  MISE_CACHE_DIR_PATH="${CACHE_ROOT}/mise-cache"
  MISE_CONFIG_DIR_PATH="${CACHE_ROOT}/mise-config"
  MISE_STATE_DIR_PATH="${CACHE_ROOT}/mise-state"
}

ensure_cache_root() {
  mkdir -p "$PLUGIN_DATA_DIR"
  mkdir -p "$(dirname "$CACHE_BIN_PATH")"
  mkdir -p "$MISE_HOME_DIR" "$MISE_DATA_DIR_PATH" "$MISE_CACHE_DIR_PATH" "$MISE_CONFIG_DIR_PATH" "$MISE_STATE_DIR_PATH"
}

cache_ready() {
  [ -x "$CACHE_BIN_PATH" ]
}

require_commands() {
  for required_command in curl sh uname date rm mkdir mv chmod mktemp dirname; do
    command -v "$required_command" >/dev/null 2>&1 || fail "$required_command is required for sa-mise bootstrap."
  done
}

download_install_script() {
  output_path="$1"
  curl --location --fail --silent --show-error --retry 3 --retry-all-errors -o "$output_path" "$INSTALL_SCRIPT_URL"
}

write_install_marker() {
  timestamp="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
  {
    printf 'installed_at=%s\n' "$timestamp"
    printf 'mise_path=%s\n' "$CACHE_BIN_PATH"
    printf 'installer=%s\n' "$INSTALL_SCRIPT_URL"
    printf 'plugin_data_source=%s\n' "$PLUGIN_DATA_SOURCE"
  } > "$INSTALL_MARKER"
}

install_latest_mise() {
  TMP_DIR="$(mktemp -d "${PLUGIN_DATA_DIR}/tmp.XXXXXX")"
  installer_path="${TMP_DIR}/install.sh"
  staged_bin_path="${TMP_DIR}/mise"
  temp_home="${TMP_DIR}/home"

  mkdir -p "$temp_home"
  download_install_script "$installer_path"

  env \
    HOME="$temp_home" \
    MISE_INSTALL_PATH="$staged_bin_path" \
    MISE_INSTALL_HELP=0 \
    sh "$installer_path"

  [ -x "$staged_bin_path" ] || fail "Failed to install mise to $staged_bin_path"

  chmod +x "$staged_bin_path"
  rm -rf "$CACHE_ROOT"
  mkdir -p "$(dirname "$CACHE_BIN_PATH")"
  mv "$staged_bin_path" "$CACHE_BIN_PATH"
  TMP_DIR=''

  ensure_cache_root
  write_install_marker
}

ensure_mise_cache() {
  PLATFORM="$(detect_platform)"
  validate_supported_platform "$PLATFORM"

  resolve_plugin_context
  ensure_cache_root
  require_commands

  if ! cache_ready; then
    install_latest_mise
  elif [ ! -f "$INSTALL_MARKER" ]; then
    write_install_marker
  fi
}

ensure_mise_cache
exec env \
  SA_MISE_ORIGINAL_HOME="${HOME:-}" \
  HOME="$MISE_HOME_DIR" \
  MISE_DATA_DIR="$MISE_DATA_DIR_PATH" \
  MISE_CACHE_DIR="$MISE_CACHE_DIR_PATH" \
  MISE_CONFIG_DIR="$MISE_CONFIG_DIR_PATH" \
  MISE_STATE_DIR="$MISE_STATE_DIR_PATH" \
  "$CACHE_BIN_PATH" "$@"
