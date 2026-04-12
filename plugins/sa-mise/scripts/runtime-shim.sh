#!/bin/sh

set -eu

TMP_DIR=''
INSTALL_SCRIPT_URL="${SA_MISE_INSTALL_SCRIPT_URL:-https://mise.jdx.dev/install.sh}"

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

  os="$(uname -s 2>/dev/null | tr '[:upper:]' '[:lower:]')"
  arch="$(uname -m 2>/dev/null | tr '[:upper:]' '[:lower:]')"

  case "$os/$arch" in
    linux/aarch64 | linux/arm64)
      printf 'linux-arm64\n'
      ;;
    *)
      printf '%s-%s\n' "$os" "$arch"
      ;;
  esac
}

require_plugin_env() {
  PLUGIN_ROOT="${CLAUDE_PLUGIN_ROOT:-}"
  PLUGIN_DATA_DIR="${CLAUDE_PLUGIN_DATA:-}"

  [ -n "$PLUGIN_ROOT" ] || fail 'CLAUDE_PLUGIN_ROOT is required for sa-mise.'
  [ -n "$PLUGIN_DATA_DIR" ] || fail 'CLAUDE_PLUGIN_DATA is required for sa-mise.'

  CACHE_ROOT="${PLUGIN_DATA_DIR}/sa-mise/linux-arm64"
  CACHE_BIN_PATH="${CACHE_ROOT}/bin/mise"
  INSTALL_MARKER="${CACHE_ROOT}/install-status.txt"
}

ensure_cache_root() {
  mkdir -p "$PLUGIN_DATA_DIR"
  mkdir -p "$(dirname "$CACHE_BIN_PATH")"
}

cache_ready() {
  [ -x "$CACHE_BIN_PATH" ]
}

require_commands() {
  for required_command in curl sh uname date rm mkdir cat mv chmod mktemp dirname; do
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
    printf 'cache_root=%s\n' "$CACHE_ROOT"
    printf 'mise_path=%s\n' "$CACHE_BIN_PATH"
    printf 'installer=%s\n' "$INSTALL_SCRIPT_URL"
  } > "$INSTALL_MARKER"
}

install_latest_mise() {
  TMP_DIR="$(mktemp -d "${PLUGIN_DATA_DIR}/sa-mise/tmp.XXXXXX")"
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

  write_install_marker
}

ensure_mise_cache() {
  require_plugin_env

  platform="$(detect_platform)"
  if [ "$platform" != "linux-arm64" ]; then
    fail "Unsupported sa-mise platform: $platform (expected linux-arm64)"
  fi

  ensure_cache_root
  require_commands

  if ! cache_ready; then
    install_latest_mise
  elif [ ! -f "$INSTALL_MARKER" ]; then
    write_install_marker
  fi
}

ensure_mise_cache
exec "$CACHE_BIN_PATH" "$@"
