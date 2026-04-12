#!/bin/sh

set -eu

SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
PLUGIN_ROOT="$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd)"
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
    linux/aarch64|linux/arm64)
      printf 'linux-arm64\n'
      ;;
    *)
      printf '%s-%s\n' "$os" "$arch"
      ;;
  esac
}

snapshot_key() {
  set -- $(printf '%s' "$PLUGIN_ROOT" | cksum)
  printf '%s\n' "$1"
}

snapshot_dir() {
  printf '%s\n' "${TMPDIR:-/tmp}/sa-mise"
}

snapshot_path() {
  printf '%s/%s.env\n' "$(snapshot_dir)" "$(snapshot_key)"
}

load_snapshot_plugin_data() {
  snapshot_file="$(snapshot_path)"
  [ -f "$snapshot_file" ] || return 1

  snapshot_root=''
  snapshot_data=''

  while IFS='=' read -r key value; do
    case "$key" in
      CLAUDE_PLUGIN_ROOT)
        snapshot_root="$value"
        ;;
      CLAUDE_PLUGIN_DATA)
        snapshot_data="$value"
        ;;
    esac
  done < "$snapshot_file"

  [ -n "$snapshot_root" ] || return 1
  [ -n "$snapshot_data" ] || return 1
  [ "$snapshot_root" = "$PLUGIN_ROOT" ] || return 1

  PLUGIN_DATA_DIR="$snapshot_data"
  return 0
}

resolve_plugin_context() {
  if [ -n "${CLAUDE_PLUGIN_ROOT:-}" ] && [ "$CLAUDE_PLUGIN_ROOT" != "$PLUGIN_ROOT" ]; then
    :
  fi

  if [ -n "${CLAUDE_PLUGIN_DATA:-}" ]; then
    PLUGIN_DATA_DIR="$CLAUDE_PLUGIN_DATA"
  elif ! load_snapshot_plugin_data; then
    fail 'CLAUDE_PLUGIN_DATA is unavailable for sa-mise. Start a fresh Claude session first so the hook can snapshot plugin env.'
  fi

  CACHE_ROOT="${PLUGIN_DATA_DIR}/sa-mise/linux-arm64"
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
  for required_command in curl sh uname date rm mkdir cat mv chmod mktemp dirname cksum; do
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

  ensure_cache_root
  write_install_marker
}

ensure_mise_cache() {
  platform="$(detect_platform)"
  if [ "$platform" != "linux-arm64" ]; then
    fail "Unsupported sa-mise platform: $platform (expected linux-arm64)"
  fi

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
  HOME="$MISE_HOME_DIR" \
  MISE_DATA_DIR="$MISE_DATA_DIR_PATH" \
  MISE_CACHE_DIR="$MISE_CACHE_DIR_PATH" \
  MISE_CONFIG_DIR="$MISE_CONFIG_DIR_PATH" \
  MISE_STATE_DIR="$MISE_STATE_DIR_PATH" \
  "$CACHE_BIN_PATH" "$@"
