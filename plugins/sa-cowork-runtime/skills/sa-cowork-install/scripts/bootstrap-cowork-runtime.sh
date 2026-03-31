#!/bin/sh

set -eu

SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
PLUGIN_ROOT="$(CDPATH= cd -- "$SCRIPT_DIR/../../.." && pwd)"
SHARED_READONLY_TOKEN="${SA_COWORK_SHARED_READONLY_TOKEN:-f2Fwoz7Izgk31BRgO0mehm86MQp1OjEzbgk.01.0z0ftcrs3}"
STASH_GITLAB_HOST='gitlab.stashaway.com'
STASH_GITLAB_PROJECT_ID='762'
BUNDLED_MISE_VERSION='2026.3.9'
TMP_DIR=''
LATEST_STASH_VERSION=''

if [ -n "${SA_COWORK_PLUGIN_ROOT:-}" ]; then
  PLUGIN_ROOT="$SA_COWORK_PLUGIN_ROOT"
fi

BIN_DIR="${SA_COWORK_INSTALL_BIN_DIR:-${HOME:-}/.local/bin}"
PLUGIN_DATA_DIR="${SA_COWORK_PLUGIN_DATA:-${CLAUDE_PLUGIN_DATA:-}}"
CACHE_ROOT="${PLUGIN_DATA_DIR}/cowork-runtime"
CACHE_BIN_DIR="$CACHE_ROOT/bin"
CACHE_RUNTIME_ENV="$CACHE_ROOT/runtime.env"
AGENTS_BIN="${SA_COWORK_AGENTS_BIN:-${HOME:-}/.stashaway-agents/bin/stashaway-agents}"
LEGACY_AGENTS_BIN="${HOME:-}/.stashaway-agent-recipes/bin/agent-recipes"
PLATFORM=''
MISE_VERSION=''
DENO_VERSION=''
MISE_DOWNLOAD_URL=''
DENO_DOWNLOAD_URL=''
RUNTIME_ENV_CONTENT=''

log() {
  printf '%s\n' "$1"
}

fail() {
  printf '%s\n' "$1" >&2
  exit 1
}

command_ok() {
  "$@" >/dev/null 2>&1
}

cleanup_temp() {
  if [ -n "$TMP_DIR" ] && [ -d "$TMP_DIR" ]; then
    rm -rf "$TMP_DIR"
  fi
}

trap cleanup_temp EXIT HUP INT TERM

require_command() {
  command_name="$1"
  command -v "$command_name" >/dev/null 2>&1 || fail "$command_name is required for Cowork runtime bootstrap."
}

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

parse_deno_version_from_tool_versions() {
  tool_versions_path="$1"

  [ -f "$tool_versions_path" ] || fail "Missing .tool-versions for Cowork runtime bootstrap: $tool_versions_path"

  while IFS= read -r raw_line || [ -n "$raw_line" ]; do
    line="$(printf '%s' "$raw_line" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')"
    [ -n "$line" ] || continue
    case "$line" in
      \#*)
        continue
        ;;
    esac

    set -- $line
    if [ "${1:-}" = 'deno' ] && [ -n "${2:-}" ]; then
      printf '%s\n' "$2"
      return 0
    fi
  done < "$tool_versions_path"

  fail "Could not find a pinned deno version in $tool_versions_path"
}

build_mise_download_url() {
  printf 'https://github.com/jdx/mise/releases/download/v%s/mise-v%s-%s.tar.gz\n' \
    "$MISE_VERSION" \
    "$MISE_VERSION" \
    "$platform"
}

build_deno_download_url() {
  case "$platform" in
    linux-arm64)
      deno_archive='deno-aarch64-unknown-linux-gnu.zip'
      ;;
    linux-x64)
      deno_archive='deno-x86_64-unknown-linux-gnu.zip'
      ;;
    *)
      fail "Unsupported Cowork runtime platform for Deno download: $platform"
      ;;
  esac

  printf 'https://github.com/denoland/deno/releases/download/v%s/%s\n' \
    "$DENO_VERSION" \
    "$deno_archive"
}

render_runtime_env() {
  cat <<EOF
PLATFORM="$platform"
MISE_VERSION="$MISE_VERSION"
DENO_VERSION="$DENO_VERSION"
MISE_DOWNLOAD_URL="$MISE_DOWNLOAD_URL"
DENO_DOWNLOAD_URL="$DENO_DOWNLOAD_URL"
EOF
}

initialize_runtime_metadata() {
  MISE_VERSION="$BUNDLED_MISE_VERSION"
  DENO_VERSION="$(parse_deno_version_from_tool_versions "$PLUGIN_ROOT/.tool-versions")"
  MISE_DOWNLOAD_URL="$(build_mise_download_url)"
  DENO_DOWNLOAD_URL="$(build_deno_download_url)"
  RUNTIME_ENV_CONTENT="$(render_runtime_env)"
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

install_link() {
  src="$1"
  dest="$2"

  if ln -sf "$src" "$dest" 2>/dev/null; then
    chmod +x "$dest" 2>/dev/null || true
    return 0
  fi

  cp "$src" "$dest"
  chmod +x "$dest"
}

resolve_agents_bin() {
  if [ -x "$AGENTS_BIN" ] && command_ok "$AGENTS_BIN" --version; then
    printf '%s\n' "$AGENTS_BIN"
    return 0
  fi

  if [ -x "$LEGACY_AGENTS_BIN" ] && command_ok "$LEGACY_AGENTS_BIN" --version; then
    printf '%s\n' "$LEGACY_AGENTS_BIN"
    return 0
  fi

  return 1
}

ensure_plugin_data_dir() {
  if [ -z "$PLUGIN_DATA_DIR" ]; then
    fail 'CLAUDE_PLUGIN_DATA (or SA_COWORK_PLUGIN_DATA) is required for Cowork runtime caching.'
  fi

  mkdir -p "$PLUGIN_DATA_DIR"
}

cache_matches_runtime() {
  [ -f "$CACHE_RUNTIME_ENV" ] || return 1
  [ -x "$CACHE_BIN_DIR/mise" ] || return 1
  [ -x "$CACHE_BIN_DIR/deno" ] || return 1

  current_runtime="$RUNTIME_ENV_CONTENT"
  cached_runtime="$(cat "$CACHE_RUNTIME_ENV" 2>/dev/null || true)"
  [ "$current_runtime" = "$cached_runtime" ]
}

stash_cache_ready() {
  [ -x "$CACHE_BIN_DIR/stash" ]
}

cache_platform_matches() {
  [ -f "$CACHE_RUNTIME_ENV" ] || return 1
  cached_platform="$(sed -n 's/^PLATFORM=\"\(.*\)\"$/\1/p' "$CACHE_RUNTIME_ENV" | head -n 1)"
  [ -n "$cached_platform" ] || return 1
  [ "$cached_platform" = "$platform" ]
}

copy_cached_binary() {
  src="$1"
  dest="$2"

  cp "$src" "$dest"
  chmod +x "$dest"
}

build_stash_release_pointer_url() {
  printf 'https://%s/api/v4/projects/%s/repository/files/release-latest.txt/raw\n' \
    "$STASH_GITLAB_HOST" \
    "$STASH_GITLAB_PROJECT_ID"
}

build_stash_download_url() {
  stash_version="$1"
  printf 'https://%s/api/v4/projects/%s/packages/generic/stash/%s/stash-%s\n' \
    "$STASH_GITLAB_HOST" \
    "$STASH_GITLAB_PROJECT_ID" \
    "$stash_version" \
    "$platform"
}

get_glab_token() {
  if ! command -v glab >/dev/null 2>&1; then
    return 0
  fi

  glab config get token --host "$STASH_GITLAB_HOST" 2>/dev/null || true
}

curl_download() {
  header_name="$1"
  auth_token="$2"
  source_url="$3"
  output_path="$4"

  if [ -n "$header_name" ]; then
    curl --location --fail --silent --show-error --http1.1 \
      --retry 3 --retry-all-errors \
      -H "${header_name}: ${auth_token}" \
      -o "$output_path" \
      "$source_url"
    return $?
  fi

  curl --location --fail --silent --show-error --http1.1 \
    --retry 3 --retry-all-errors \
    -o "$output_path" \
    "$source_url"
  return $?
}

download_public_binary() {
  source_url="$1"
  output_path="$2"
  curl_download '' '' "$source_url" "$output_path"
}

download_gitlab_resource() {
  resource_label="$1"
  source_url="$2"
  output_path="$3"
  glab_token="$(get_glab_token)"

  if [ -n "${STASH_GITLAB_TOKEN:-}" ] && curl_download 'PRIVATE-TOKEN' "$STASH_GITLAB_TOKEN" "$source_url" "$output_path"; then
    return 0
  fi

  if [ -n "${GITLAB_TOKEN:-}" ] && curl_download 'PRIVATE-TOKEN' "$GITLAB_TOKEN" "$source_url" "$output_path"; then
    return 0
  fi

  if [ -n "${GITLAB_JOB_TOKEN:-}" ] && curl_download 'PRIVATE-TOKEN' "$GITLAB_JOB_TOKEN" "$source_url" "$output_path"; then
    return 0
  fi

  if [ -n "${CI_JOB_TOKEN:-}" ] && curl_download 'JOB-TOKEN' "$CI_JOB_TOKEN" "$source_url" "$output_path"; then
    return 0
  fi

  if [ -n "$glab_token" ] && curl_download 'PRIVATE-TOKEN' "$glab_token" "$source_url" "$output_path"; then
    return 0
  fi

  if curl_download 'PRIVATE-TOKEN' "$SHARED_READONLY_TOKEN" "$source_url" "$output_path"; then
    return 0
  fi

  fail "Failed to download $resource_label from $source_url with available GitLab auth candidates."
}

resolve_latest_stash_version() {
  latest_version_path="$TMP_DIR/stash-release-latest.txt"
  release_pointer_url="$(build_stash_release_pointer_url)"

  download_gitlab_resource 'stash release pointer' "$release_pointer_url" "$latest_version_path"

  LATEST_STASH_VERSION="$(tr -d '\r\n' < "$latest_version_path")"
  [ -n "$LATEST_STASH_VERSION" ] || fail "Resolved stash release pointer was empty: $release_pointer_url"
}

download_stash_binary() {
  stash_version="$1"
  output_path="$2"
  stash_download_url="$(build_stash_download_url "$stash_version")"

  download_gitlab_resource "stash ${stash_version}" "$stash_download_url" "$output_path"
}

extract_mise_binary() {
  archive_path="$1"
  output_path="$2"
  extract_dir="$TMP_DIR/mise-extract"

  mkdir -p "$extract_dir"
  tar -xzf "$archive_path" -C "$extract_dir"

  if [ -x "$extract_dir/bin/mise" ]; then
    cp "$extract_dir/bin/mise" "$output_path"
  elif [ -x "$extract_dir/mise" ]; then
    cp "$extract_dir/mise" "$output_path"
  else
    candidate="$(find "$extract_dir" -type f -name mise 2>/dev/null | head -n 1 || true)"
    [ -n "$candidate" ] || fail 'Downloaded mise archive did not contain a mise binary.'
    cp "$candidate" "$output_path"
  fi

  chmod +x "$output_path"
}

extract_deno_binary() {
  archive_path="$1"
  output_path="$2"
  extract_dir="$TMP_DIR/deno-extract"

  mkdir -p "$extract_dir"
  unzip -o "$archive_path" -d "$extract_dir" >/dev/null
  [ -f "$extract_dir/deno" ] || fail 'Downloaded Deno archive did not contain a deno binary.'

  cp "$extract_dir/deno" "$output_path"
  chmod +x "$output_path"
}

download_runtime_cache() {
  runtime_ready=0
  stash_ready=0

  if cache_matches_runtime; then
    runtime_ready=1
  fi

  if stash_cache_ready; then
    stash_ready=1
  fi

  if [ "$runtime_ready" != 1 ] && ! cache_platform_matches; then
    stash_ready=0
  fi

  if [ "$runtime_ready" = 1 ] && [ "$stash_ready" = 1 ]; then
    log "Reusing cached Cowork runtime from $CACHE_ROOT"
    return 0
  fi

  if [ "$runtime_ready" != 1 ] || [ "$stash_ready" != 1 ]; then
    require_command curl
  fi

  if [ "$runtime_ready" != 1 ]; then
    require_command tar
    require_command unzip
  fi

  TMP_DIR="$(mktemp -d "${PLUGIN_DATA_DIR%/}/cowork-runtime.XXXXXX")"
  tmp_bin_dir="$TMP_DIR/bin"
  mkdir -p "$tmp_bin_dir"

  if [ "$runtime_ready" = 1 ]; then
    copy_cached_binary "$CACHE_BIN_DIR/mise" "$tmp_bin_dir/mise"
    copy_cached_binary "$CACHE_BIN_DIR/deno" "$tmp_bin_dir/deno"
    cp "$CACHE_RUNTIME_ENV" "$TMP_DIR/runtime.env"
  else
    log 'Downloading pinned Cowork runtime dependencies into plugin data cache...'

    download_public_binary "$MISE_DOWNLOAD_URL" "$TMP_DIR/mise.tar.gz"
    extract_mise_binary "$TMP_DIR/mise.tar.gz" "$tmp_bin_dir/mise"

    download_public_binary "$DENO_DOWNLOAD_URL" "$TMP_DIR/deno.zip"
    extract_deno_binary "$TMP_DIR/deno.zip" "$tmp_bin_dir/deno"

    printf '%s\n' "$RUNTIME_ENV_CONTENT" > "$TMP_DIR/runtime.env"
  fi

  if [ "$stash_ready" = 1 ]; then
    copy_cached_binary "$CACHE_BIN_DIR/stash" "$tmp_bin_dir/stash"
  else
    log 'Resolving latest stash release for Cowork runtime cache...'
    resolve_latest_stash_version
    stash_version="$LATEST_STASH_VERSION"
    log "Downloading stash ${stash_version} into plugin data cache..."
    download_stash_binary "$stash_version" "$tmp_bin_dir/stash"
    chmod +x "$tmp_bin_dir/stash"
  fi

  old_cache=''
  mkdir -p "$(dirname "$CACHE_ROOT")"
  if [ -d "$CACHE_ROOT" ]; then
    old_cache="${CACHE_ROOT}.old"
    rm -rf "$old_cache"
    mv "$CACHE_ROOT" "$old_cache"
  fi

  if mv "$TMP_DIR" "$CACHE_ROOT"; then
    TMP_DIR=''
    rm -rf "$old_cache"
    return 0
  fi

  if [ -n "$old_cache" ] && [ -d "$old_cache" ]; then
    mv "$old_cache" "$CACHE_ROOT"
  fi

  fail "Failed to finalize Cowork runtime cache at $CACHE_ROOT"
}

seed_stash_update_frequency_if_unset() {
  update_frequency="$("$BIN_DIR/stash" --skip-update-check settings get updateFrequency 2>/dev/null || true)"

  case "$update_frequency" in
    *': null'*)
      log 'Seeding stash automatic update frequency to 1 day.'
      "$BIN_DIR/stash" --skip-update-check settings set updateFrequency 1 >/dev/null 2>&1 || \
        fail 'Failed to seed stash updateFrequency to 1 day.'
      ;;
  esac
}

if ! is_cowork; then
  fail 'sa-cowork-install only supports Claude Cowork guest shells.'
fi

platform="$(detect_platform)"
case "$platform" in
  linux-arm64|linux-x64)
    ;;
  *)
    fail "Unsupported Cowork runtime platform: $platform. Expected linux-arm64 or linux-x64."
    ;;
esac

ensure_plugin_data_dir
initialize_runtime_metadata

download_runtime_cache

mkdir -p "$BIN_DIR"

for dep in stash mise deno; do
  install_link "$CACHE_BIN_DIR/$dep" "$BIN_DIR/$dep"
done

export PATH="$BIN_DIR:$PATH"

command_ok "$BIN_DIR/stash" --version || fail "Cached stash is not executable: $BIN_DIR/stash"
command_ok "$BIN_DIR/mise" --version || fail "Cached mise is not executable: $BIN_DIR/mise"
command_ok "$BIN_DIR/deno" --version || fail "Cached deno is not executable: $BIN_DIR/deno"

seed_stash_update_frequency_if_unset

if existing_agents_bin="$(resolve_agents_bin)"; then
  log "stashaway-agents already available at $existing_agents_bin"
  log "stash: $BIN_DIR/stash"
  log "mise: $BIN_DIR/mise"
  log "deno: $BIN_DIR/deno"
  exit 0
fi

require_command git

log 'Bootstrapping stashaway-agents with cached Cowork dependencies...'
"$BIN_DIR/stash" --skip-update-check ai agents setup

if installed_agents_bin="$(resolve_agents_bin)"; then
  log "stash: $BIN_DIR/stash"
  log "mise: $BIN_DIR/mise"
  log "deno: $BIN_DIR/deno"
  log "stashaway-agents: $installed_agents_bin"
  exit 0
fi

fail 'stashaway-agents was not available after Cowork runtime bootstrap.'
