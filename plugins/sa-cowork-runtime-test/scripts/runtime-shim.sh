#!/bin/sh

set -eu

SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
PLUGIN_ROOT="$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd)"
TMP_DIR=''

if [ -n "${SA_COWORK_PLUGIN_ROOT:-}" ]; then
  PLUGIN_ROOT="$SA_COWORK_PLUGIN_ROOT"
fi

PLUGIN_DATA_DIR="${SA_COWORK_PLUGIN_DATA:-${CLAUDE_PLUGIN_DATA:-}}"
RUNTIME_ENV_PATH="${PLUGIN_ROOT}/deps/linux-arm64/runtime.env"
CACHE_ROOT="${PLUGIN_DATA_DIR}/cowork-runtime-test/linux-arm64"
CACHE_BIN_DIR="${CACHE_ROOT}/bin"
CACHE_RUNTIME_ENV="${CACHE_ROOT}/runtime.env"
INSTALL_MARKER="${CACHE_ROOT}/install-status.txt"

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
  if [ -n "${SA_COWORK_FORCE_PLATFORM:-}" ]; then
    printf '%s\n' "$SA_COWORK_FORCE_PLATFORM"
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

is_cowork() {
  if [ "${SA_COWORK_FORCE_COWORK:-0}" = "1" ]; then
    return 0
  fi

  case "$PLUGIN_ROOT" in
    *"/cowork_plugins/"*)
      return 0
      ;;
  esac

  [ -d /mnt/.claude/cowork_plugins ] || [ -d /mnt/.claude ]
}

ensure_plugin_data_dir() {
  if [ -z "$PLUGIN_DATA_DIR" ]; then
    fail 'CLAUDE_PLUGIN_DATA (or SA_COWORK_PLUGIN_DATA) is required for Cowork runtime caching.'
  fi

  mkdir -p "$PLUGIN_DATA_DIR"
}

load_runtime_env() {
  [ -f "$RUNTIME_ENV_PATH" ] || fail "Cowork runtime metadata missing: $RUNTIME_ENV_PATH"

  # shellcheck disable=SC1090
  . "$RUNTIME_ENV_PATH"

  for required_var in MISE_VERSION DENO_VERSION MISE_DOWNLOAD_URL DENO_DOWNLOAD_URL; do
    eval "required_value=\${$required_var:-}"
    [ -n "$required_value" ] || fail "Cowork runtime metadata missing $required_var in $RUNTIME_ENV_PATH"
  done
}

cached_binary_path() {
  printf '%s\n' "${CACHE_BIN_DIR}/$1"
}

cache_matches_runtime() {
  [ -f "$CACHE_RUNTIME_ENV" ] || return 1
  [ -x "$(cached_binary_path mise)" ] || return 1
  [ -x "$(cached_binary_path deno)" ] || return 1

  current_runtime="$(cat "$RUNTIME_ENV_PATH")"
  cached_runtime="$(cat "$CACHE_RUNTIME_ENV" 2>/dev/null || true)"
  [ "$current_runtime" = "$cached_runtime" ]
}

require_commands() {
  for required_command in curl tar unzip uname date rm mkdir cat cp mv chmod mktemp; do
    command -v "$required_command" >/dev/null 2>&1 || fail "$required_command is required for Cowork runtime bootstrap."
  done
}

download_public_binary() {
  source_url="$1"
  output_path="$2"
  curl --location --fail --silent --show-error --retry 3 --retry-all-errors -o "$output_path" "$source_url"
}

extract_mise_binary() {
  archive_path="$1"
  output_path="$2"
  extract_dir="$TMP_DIR/mise-extract"

  mkdir -p "$extract_dir"
  tar -xzf "$archive_path" -C "$extract_dir"

  if [ -x "$extract_dir/bin/mise" ]; then
    cp "$extract_dir/bin/mise" "$output_path"
    chmod +x "$output_path"
    return 0
  fi

  fail "Unable to locate extracted mise binary in $archive_path"
}

extract_deno_binary() {
  archive_path="$1"
  output_path="$2"
  extract_dir="$TMP_DIR/deno-extract"

  mkdir -p "$extract_dir"
  unzip -q "$archive_path" -d "$extract_dir"

  if [ -x "$extract_dir/deno" ]; then
    cp "$extract_dir/deno" "$output_path"
    chmod +x "$output_path"
    return 0
  fi

  fail "Unable to locate extracted deno binary in $archive_path"
}

write_install_marker() {
  timestamp="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
  {
    printf 'installed_at=%s\n' "$timestamp"
    printf 'cache_root=%s\n' "$CACHE_ROOT"
    printf 'mise_path=%s\n' "$(cached_binary_path mise)"
    printf 'deno_path=%s\n' "$(cached_binary_path deno)"
  } > "$INSTALL_MARKER"
}

refresh_cache() {
  TMP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/cowork-runtime-test.XXXXXX")"
  mkdir -p "$TMP_DIR/cache/bin"

  download_public_binary "$MISE_DOWNLOAD_URL" "$TMP_DIR/mise.tar.gz"
  extract_mise_binary "$TMP_DIR/mise.tar.gz" "$TMP_DIR/cache/bin/mise"

  download_public_binary "$DENO_DOWNLOAD_URL" "$TMP_DIR/deno.zip"
  extract_deno_binary "$TMP_DIR/deno.zip" "$TMP_DIR/cache/bin/deno"

  cp "$RUNTIME_ENV_PATH" "$TMP_DIR/cache/runtime.env"

  rm -rf "$CACHE_ROOT"
  mkdir -p "$(dirname "$CACHE_ROOT")"
  mv "$TMP_DIR/cache" "$CACHE_ROOT"
  TMP_DIR=''

  write_install_marker
}

ensure_runtime_cache() {
  if ! is_cowork; then
    fail 'sa-cowork-runtime-test only supports Claude Cowork guest shells.'
  fi

  platform="$(detect_platform)"
  if [ "$platform" != "linux-arm64" ]; then
    fail "Unsupported Cowork runtime platform: $platform (expected linux-arm64)"
  fi

  ensure_plugin_data_dir
  load_runtime_env
  require_commands

  if ! cache_matches_runtime; then
    refresh_cache
  elif [ ! -f "$INSTALL_MARKER" ]; then
    write_install_marker
  fi
}

usage() {
  cat <<'EOF' >&2
Usage:
  runtime-shim.sh exec <mise|deno> [args...]
  runtime-shim.sh resolve <mise|deno>
  runtime-shim.sh ensure
EOF
  exit 1
}

MODE="${1:-}"
TARGET="${2:-}"

case "$MODE" in
  exec)
    [ -n "$TARGET" ] || usage
    shift 2
    ensure_runtime_cache
    exec "$(cached_binary_path "$TARGET")" "$@"
    ;;
  resolve)
    [ -n "$TARGET" ] || usage
    ensure_runtime_cache
    printf '%s\n' "$(cached_binary_path "$TARGET")"
    ;;
  ensure)
    ensure_runtime_cache
    ;;
  *)
    usage
    ;;
esac
