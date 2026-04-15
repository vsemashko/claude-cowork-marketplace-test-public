#!/bin/sh

set -eu

INSTALL_SCRIPT_URL="${SA_MISE_INSTALL_SCRIPT_URL:-https://mise.jdx.dev/install.sh}"

cowork_runtime_fail() {
  printf '%s\n' "$1" >&2
  exit 1
}

cowork_runtime_require_command() {
  command_name="$1"
  command -v "$command_name" >/dev/null 2>&1 || cowork_runtime_fail "$command_name is required for Cowork runtime bootstrap."
}

cowork_runtime_detect_platform() {
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
      cowork_runtime_fail "Unsupported sa-mise platform: ${os_raw}-${arch_raw}"
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
      cowork_runtime_fail "Unsupported sa-mise platform: ${os}-${arch_raw}"
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

cowork_runtime_validate_platform() {
  case "$1" in
    linux-x64|linux-x64-musl|linux-arm64|linux-arm64-musl|linux-armv7|linux-armv7-musl|macos-x64|macos-arm64)
      return 0
      ;;
    *)
      cowork_runtime_fail "Unsupported sa-mise platform: $1"
      ;;
  esac
}

cowork_runtime_tool_root() {
  plugin_data_dir="$1"
  tool_name="$2"
  platform="$3"
  printf '%s/runtime-mirror/%s/%s\n' "$plugin_data_dir" "$tool_name" "$platform"
}

cowork_runtime_tool_bin_path() {
  plugin_data_dir="$1"
  tool_name="$2"
  platform="$3"
  printf '%s/bin/%s\n' "$(cowork_runtime_tool_root "$plugin_data_dir" "$tool_name" "$platform")" "$tool_name"
}

cowork_runtime_tool_marker_path() {
  plugin_data_dir="$1"
  tool_name="$2"
  platform="$3"
  printf '%s/install-status.env\n' "$(cowork_runtime_tool_root "$plugin_data_dir" "$tool_name" "$platform")"
}

cowork_runtime_tool_home_dir() {
  plugin_data_dir="$1"
  tool_name="$2"
  platform="$3"
  printf '%s/home\n' "$(cowork_runtime_tool_root "$plugin_data_dir" "$tool_name" "$platform")"
}

cowork_runtime_tool_data_dir() {
  plugin_data_dir="$1"
  tool_name="$2"
  platform="$3"
  printf '%s/mise-data\n' "$(cowork_runtime_tool_root "$plugin_data_dir" "$tool_name" "$platform")"
}

cowork_runtime_tool_cache_dir() {
  plugin_data_dir="$1"
  tool_name="$2"
  platform="$3"
  printf '%s/mise-cache\n' "$(cowork_runtime_tool_root "$plugin_data_dir" "$tool_name" "$platform")"
}

cowork_runtime_tool_config_dir() {
  plugin_data_dir="$1"
  tool_name="$2"
  platform="$3"
  printf '%s/mise-config\n' "$(cowork_runtime_tool_root "$plugin_data_dir" "$tool_name" "$platform")"
}

cowork_runtime_tool_state_dir() {
  plugin_data_dir="$1"
  tool_name="$2"
  platform="$3"
  printf '%s/mise-state\n' "$(cowork_runtime_tool_root "$plugin_data_dir" "$tool_name" "$platform")"
}

cowork_runtime_prepare_runtime_dirs() {
  plugin_data_dir="$1"
  tool_name="$2"
  platform="$3"
  mkdir -p \
    "$(cowork_runtime_tool_home_dir "$plugin_data_dir" "$tool_name" "$platform")" \
    "$(cowork_runtime_tool_data_dir "$plugin_data_dir" "$tool_name" "$platform")" \
    "$(cowork_runtime_tool_cache_dir "$plugin_data_dir" "$tool_name" "$platform")" \
    "$(cowork_runtime_tool_config_dir "$plugin_data_dir" "$tool_name" "$platform")" \
    "$(cowork_runtime_tool_state_dir "$plugin_data_dir" "$tool_name" "$platform")"
}

cowork_runtime_shared_tool_root() {
  shared_root="$1"
  tool_name="$2"
  platform="$3"
  printf '%s/.claude/plugins/shared-runtime/%s/%s\n' "$shared_root" "$tool_name" "$platform"
}

cowork_runtime_shared_binary_path() {
  shared_root="$1"
  tool_name="$2"
  platform="$3"
  printf '%s/current/%s\n' "$(cowork_runtime_shared_tool_root "$shared_root" "$tool_name" "$platform")" "$tool_name"
}

cowork_runtime_shared_registry_path() {
  shared_root="$1"
  tool_name="$2"
  platform="$3"
  printf '%s/registry.json\n' "$(cowork_runtime_shared_tool_root "$shared_root" "$tool_name" "$platform")"
}

cowork_runtime_shared_lock_dir() {
  shared_root="$1"
  tool_name="$2"
  platform="$3"
  printf '%s/.lock\n' "$(cowork_runtime_shared_tool_root "$shared_root" "$tool_name" "$platform")"
}

cowork_runtime_read_marker_value() {
  marker_path="$1"
  key_name="$2"

  [ -f "$marker_path" ] || return 1

  while IFS='=' read -r marker_key marker_value; do
    if [ "$marker_key" = "$key_name" ]; then
      printf '%s\n' "$marker_value"
      return 0
    fi
  done < "$marker_path"

  return 1
}

cowork_runtime_actual_binary_path() {
  binary_path="$1"

  if [ -L "$binary_path" ] && command -v readlink >/dev/null 2>&1; then
    resolved_path="$(readlink "$binary_path" 2>/dev/null || true)"
    if [ -n "$resolved_path" ]; then
      printf '%s\n' "$resolved_path"
      return 0
    fi
  fi

  printf '%s\n' "$binary_path"
}

cowork_runtime_binary_version() {
  tool_name="$1"
  binary_path="$2"

  [ -x "$binary_path" ] || return 1

  case "$tool_name" in
    mise)
      "$binary_path" --version 2>/dev/null | head -n 1
      ;;
    *)
      "$binary_path" --version 2>/dev/null | head -n 1
      ;;
  esac
}

cowork_runtime_local_binary_ready() {
  plugin_data_dir="$1"
  tool_name="$2"
  platform="$3"
  [ -x "$(cowork_runtime_tool_bin_path "$plugin_data_dir" "$tool_name" "$platform")" ]
}

cowork_runtime_shared_binary_ready() {
  shared_root="$1"
  tool_name="$2"
  platform="$3"

  shared_binary_path="$(cowork_runtime_shared_binary_path "$shared_root" "$tool_name" "$platform")"
  [ -x "$shared_binary_path" ] || return 1

  shared_target_path="$(cowork_runtime_actual_binary_path "$shared_binary_path")"
  [ -x "$shared_target_path" ]
}

cowork_runtime_escape_json_string() {
  printf '%s' "$1" | sed 's/\\/\\\\/g; s/"/\\"/g'
}

cowork_runtime_registry_paths() {
  shared_root="$1"
  tool_name="$2"
  platform="$3"
  registry_path="$(cowork_runtime_shared_registry_path "$shared_root" "$tool_name" "$platform")"

  [ -f "$registry_path" ] || return 0

  registry_compact="$(tr -d '\n\r' < "$registry_path" | tr -d ' ')"
  registry_inner="$(printf '%s' "$registry_compact" | sed -e 's/^{"mirrorPaths":\[//' -e 's/\]}$//')"
  [ -n "$registry_inner" ] || return 0

  printf '%s' "$registry_inner" | tr ',' '\n' | sed -e 's/^"//' -e 's/"$//' -e 's/\\"/"/g' -e 's/\\\\/\\/g' | \
    while IFS= read -r registry_entry; do
      [ -n "$registry_entry" ] || continue
      [ -x "$registry_entry" ] || continue
      printf '%s\n' "$registry_entry"
    done
}

cowork_runtime_sync_registry() {
  shared_root="$1"
  tool_name="$2"
  platform="$3"
  shift 3

  registry_path="$(cowork_runtime_shared_registry_path "$shared_root" "$tool_name" "$platform")"
  registry_dir="$(dirname "$registry_path")"
  registry_tmp_path="${registry_path}.tmp.$$"
  registry_list_tmp=''
  registry_unique_tmp=''

  mkdir -p "$registry_dir"
  registry_list_tmp="$(mktemp "${registry_dir}/registry-list.XXXXXX")"
  registry_unique_tmp="$(mktemp "${registry_dir}/registry-unique.XXXXXX")"

  cowork_runtime_registry_paths "$shared_root" "$tool_name" "$platform" > "$registry_list_tmp" || true

  for registry_extra_path in "$@"; do
    [ -n "$registry_extra_path" ] || continue
    resolved_registry_path="$(cowork_runtime_actual_binary_path "$registry_extra_path")"
    [ -x "$resolved_registry_path" ] || continue
    printf '%s\n' "$resolved_registry_path" >> "$registry_list_tmp"
  done

  awk 'NF && !seen[$0]++' "$registry_list_tmp" > "$registry_unique_tmp"

  {
    printf '{"mirrorPaths":['
    registry_first=1
    while IFS= read -r registry_path_entry; do
      [ -n "$registry_path_entry" ] || continue
      escaped_registry_path="$(cowork_runtime_escape_json_string "$registry_path_entry")"
      if [ "$registry_first" -eq 0 ]; then
        printf ','
      fi
      printf '"%s"' "$escaped_registry_path"
      registry_first=0
    done < "$registry_unique_tmp"
    printf ']}\n'
  } > "$registry_tmp_path"

  mv "$registry_tmp_path" "$registry_path"
  rm -f "$registry_list_tmp" "$registry_unique_tmp"
}

cowork_runtime_first_registry_candidate() {
  shared_root="$1"
  tool_name="$2"
  platform="$3"
  skip_path="$4"

  cowork_runtime_registry_paths "$shared_root" "$tool_name" "$platform" | while IFS= read -r registry_path_entry; do
    [ -n "$registry_path_entry" ] || continue
    if [ -n "$skip_path" ] && [ "$registry_path_entry" = "$skip_path" ]; then
      continue
    fi
    printf '%s\n' "$registry_path_entry"
    break
  done
}

cowork_runtime_replace_directory() {
  temp_root="$1"
  final_root="$2"
  old_root=''

  mkdir -p "$(dirname "$final_root")"

  if [ -d "$final_root" ]; then
    old_root="${final_root}.old.$$"
    rm -rf "$old_root"
    mv "$final_root" "$old_root"
  fi

  if mv "$temp_root" "$final_root"; then
    rm -rf "$old_root"
    return 0
  fi

  if [ -n "$old_root" ] && [ -d "$old_root" ]; then
    mv "$old_root" "$final_root"
  fi

  cowork_runtime_fail "Failed to update Cowork runtime directory $final_root"
}

cowork_runtime_publish_shared_binary() {
  shared_root="$1"
  tool_name="$2"
  platform="$3"
  target_binary="$4"
  shared_binary_path="$(cowork_runtime_shared_binary_path "$shared_root" "$tool_name" "$platform")"

  mkdir -p "$(dirname "$shared_binary_path")"
  tmp_link="${shared_binary_path}.tmp.$$"
  rm -f "$tmp_link"
  ln -s "$target_binary" "$tmp_link"
  mv -f "$tmp_link" "$shared_binary_path"
}

cowork_runtime_write_local_marker() {
  temp_root="$1"
  tool_name="$2"
  version_value="$3"
  source_value="$4"
  plugin_data_source="$5"
  final_binary_path="$6"
  marker_path="$temp_root/install-status.env"

  {
    printf 'tool=%s\n' "$tool_name"
    printf 'binary_path=%s\n' "$final_binary_path"
    printf 'version=%s\n' "$version_value"
    printf 'source=%s\n' "$source_value"
    printf 'plugin_data_source=%s\n' "$plugin_data_source"
    printf 'updated_at=%s\n' "$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
  } > "$marker_path"
}

cowork_runtime_create_local_mirror_from_binary() {
  plugin_data_dir="$1"
  tool_name="$2"
  platform="$3"
  source_binary_path="$4"
  source_label="$5"
  plugin_data_source="$6"

  final_root="$(cowork_runtime_tool_root "$plugin_data_dir" "$tool_name" "$platform")"
  final_binary_path="$(cowork_runtime_tool_bin_path "$plugin_data_dir" "$tool_name" "$platform")"
  temp_root="$(mktemp -d "${plugin_data_dir%/}/${tool_name}-mirror.XXXXXX")"
  source_mirror_root="$(dirname "$(dirname "$source_binary_path")")"
  source_marker_path="$source_mirror_root/install-status.env"
  source_version="$(cowork_runtime_read_marker_value "$source_marker_path" 'version' 2>/dev/null || true)"

  mkdir -p "$temp_root/bin"
  cp "$source_binary_path" "$temp_root/bin/$tool_name"
  chmod +x "$temp_root/bin/$tool_name"
  mkdir -p "$temp_root/home" "$temp_root/mise-data" "$temp_root/mise-cache" "$temp_root/mise-config" "$temp_root/mise-state"

  if [ -z "$source_version" ]; then
    source_version="$(cowork_runtime_binary_version "$tool_name" "$source_binary_path" || true)"
  fi

  cowork_runtime_write_local_marker "$temp_root" "$tool_name" "${source_version:-unknown}" "$source_label" "$plugin_data_source" "$final_binary_path"
  cowork_runtime_replace_directory "$temp_root" "$final_root"
}

cowork_runtime_lock_is_stale() {
  lock_dir="$1"
  owner_path="$lock_dir/owner.env"
  stale_after="${SA_COWORK_LOCK_STALE_SECONDS:-300}"

  [ -d "$lock_dir" ] || return 1
  [ -f "$owner_path" ] || return 0

  created_at="$(cowork_runtime_read_marker_value "$owner_path" 'created_at' 2>/dev/null || true)"
  [ -n "$created_at" ] || return 0

  now_epoch="$(date +%s 2>/dev/null || printf '0')"
  [ "$now_epoch" -gt 0 ] || return 1

  age="$((now_epoch - created_at))"
  [ "$age" -ge "$stale_after" ]
}

cowork_runtime_acquire_lock() {
  lock_dir="$1"
  tool_name="$2"
  platform="$3"
  plugin_data_dir="$4"
  wait_seconds="${SA_COWORK_LOCK_WAIT_SECONDS:-30}"
  start_epoch="$(date +%s 2>/dev/null || printf '0')"

  mkdir -p "$(dirname "$lock_dir")"

  while ! mkdir "$lock_dir" 2>/dev/null; do
    if cowork_runtime_lock_is_stale "$lock_dir"; then
      rm -rf "$lock_dir"
      continue
    fi

    now_epoch="$(date +%s 2>/dev/null || printf '0')"
    if [ "$start_epoch" -gt 0 ] && [ "$now_epoch" -gt 0 ] && [ "$((now_epoch - start_epoch))" -ge "$wait_seconds" ]; then
      cowork_runtime_fail "Timed out waiting for Cowork runtime lock: $lock_dir"
    fi

    sleep 1
  done

  {
    printf 'created_at=%s\n' "$(date +%s 2>/dev/null || printf '0')"
    printf 'tool=%s\n' "$tool_name"
    printf 'platform=%s\n' "$platform"
    printf 'plugin_data=%s\n' "$plugin_data_dir"
  } > "$lock_dir/owner.env"
}

cowork_runtime_release_lock() {
  lock_dir="$1"
  rm -rf "$lock_dir"
}

cowork_runtime_bootstrap_local_tool() {
  plugin_data_dir="$1"
  tool_name="$2"
  platform="$3"
  plugin_data_source="$4"

  cowork_runtime_require_command curl
  cowork_runtime_require_command sh
  cowork_runtime_require_command mktemp
  cowork_runtime_require_command mv

  final_root="$(cowork_runtime_tool_root "$plugin_data_dir" "$tool_name" "$platform")"
  final_binary_path="$(cowork_runtime_tool_bin_path "$plugin_data_dir" "$tool_name" "$platform")"
  temp_root="$(mktemp -d "${plugin_data_dir%/}/${tool_name}-bootstrap.XXXXXX")"
  installer_path="$temp_root/install.sh"
  staged_binary_path="$temp_root/bin/$tool_name"
  temp_home="$temp_root/home"

  mkdir -p "$temp_root/bin" "$temp_home" "$temp_root/mise-data" "$temp_root/mise-cache" "$temp_root/mise-config" "$temp_root/mise-state"
  curl --location --fail --silent --show-error --retry 3 --retry-all-errors -o "$installer_path" "$INSTALL_SCRIPT_URL"

  env \
    HOME="$temp_home" \
    MISE_INSTALL_PATH="$staged_binary_path" \
    MISE_INSTALL_HELP=0 \
    sh "$installer_path"

  [ -x "$staged_binary_path" ] || cowork_runtime_fail "Failed to install mise to $staged_binary_path"

  tool_version="$(cowork_runtime_binary_version "$tool_name" "$staged_binary_path" || true)"
  cowork_runtime_write_local_marker "$temp_root" "$tool_name" "${tool_version:-unknown}" 'download' "$plugin_data_source" "$final_binary_path"
  cowork_runtime_replace_directory "$temp_root" "$final_root"
}

cowork_runtime_ensure_tool_available() (
  set -eu

  plugin_data_dir="$1"
  shared_root="$2"
  platform="$3"
  tool_name="$4"
  plugin_data_source="$5"

  mkdir -p "$plugin_data_dir"
  local_binary_path="$(cowork_runtime_tool_bin_path "$plugin_data_dir" "$tool_name" "$platform")"
  shared_binary_path="$(cowork_runtime_shared_binary_path "$shared_root" "$tool_name" "$platform")"

  if cowork_runtime_shared_binary_ready "$shared_root" "$tool_name" "$platform" && \
    cowork_runtime_local_binary_ready "$plugin_data_dir" "$tool_name" "$platform"; then
    printf '%s\n' "$shared_binary_path"
    exit 0
  fi

  lock_dir="$(cowork_runtime_shared_lock_dir "$shared_root" "$tool_name" "$platform")"
  cowork_runtime_acquire_lock "$lock_dir" "$tool_name" "$platform" "$plugin_data_dir"
  trap 'cowork_runtime_release_lock "$lock_dir"' EXIT HUP INT TERM

  if cowork_runtime_shared_binary_ready "$shared_root" "$tool_name" "$platform"; then
    shared_target_path="$(cowork_runtime_actual_binary_path "$shared_binary_path")"
    if ! cowork_runtime_local_binary_ready "$plugin_data_dir" "$tool_name" "$platform"; then
      cowork_runtime_create_local_mirror_from_binary "$plugin_data_dir" "$tool_name" "$platform" "$shared_target_path" 'shared' "$plugin_data_source"
    fi
    local_binary_path="$(cowork_runtime_tool_bin_path "$plugin_data_dir" "$tool_name" "$platform")"
    cowork_runtime_sync_registry "$shared_root" "$tool_name" "$platform" "$local_binary_path" "$shared_target_path"
    printf '%s\n' "$shared_binary_path"
    exit 0
  fi

  if cowork_runtime_local_binary_ready "$plugin_data_dir" "$tool_name" "$platform"; then
    cowork_runtime_prepare_runtime_dirs "$plugin_data_dir" "$tool_name" "$platform"
    cowork_runtime_publish_shared_binary "$shared_root" "$tool_name" "$platform" "$local_binary_path"
    cowork_runtime_sync_registry "$shared_root" "$tool_name" "$platform" "$local_binary_path"
    printf '%s\n' "$shared_binary_path"
    exit 0
  fi

  peer_binary_path="$(cowork_runtime_first_registry_candidate "$shared_root" "$tool_name" "$platform" "$local_binary_path")"
  if [ -n "$peer_binary_path" ]; then
    cowork_runtime_create_local_mirror_from_binary "$plugin_data_dir" "$tool_name" "$platform" "$peer_binary_path" 'peer' "$plugin_data_source"
    local_binary_path="$(cowork_runtime_tool_bin_path "$plugin_data_dir" "$tool_name" "$platform")"
    cowork_runtime_publish_shared_binary "$shared_root" "$tool_name" "$platform" "$peer_binary_path"
    cowork_runtime_sync_registry "$shared_root" "$tool_name" "$platform" "$local_binary_path" "$peer_binary_path"
    printf '%s\n' "$shared_binary_path"
    exit 0
  fi

  cowork_runtime_bootstrap_local_tool "$plugin_data_dir" "$tool_name" "$platform" "$plugin_data_source"
  local_binary_path="$(cowork_runtime_tool_bin_path "$plugin_data_dir" "$tool_name" "$platform")"
  cowork_runtime_prepare_runtime_dirs "$plugin_data_dir" "$tool_name" "$platform"
  cowork_runtime_publish_shared_binary "$shared_root" "$tool_name" "$platform" "$local_binary_path"
  cowork_runtime_sync_registry "$shared_root" "$tool_name" "$platform" "$local_binary_path"
  printf '%s\n' "$shared_binary_path"
)
