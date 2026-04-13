#!/bin/sh

set -eu

command_name=''
format='shell'
plugin_name=''
plugin_root=''
resolved_base_root=''
resolved_plugin_data=''
resolved_source=''
resolved_state_file=''
attempted_sources=''

usage() {
  cat >&2 <<'EOF'
Usage:
  cowork-plugin-context.sh resolve --plugin-root <path> --plugin-name <name> [--format shell]
  cowork-plugin-context.sh capture --plugin-root <path> --plugin-name <name> [--format shell]
EOF
  exit 1
}

fail() {
  printf '%s\n' "$1" >&2
  exit 1
}

record_attempt() {
  source_name="$1"
  if [ -z "$attempted_sources" ]; then
    attempted_sources="$source_name"
  else
    attempted_sources="${attempted_sources},$source_name"
  fi
}

shell_quote() {
  escaped="$(printf '%s' "$1" | sed "s/'/'\\\\''/g")"
  printf "'%s'" "$escaped"
}

derive_base_root() {
  derived=''

  derived="$(printf '%s\n' "$plugin_root" | sed -n 's#^\(.*\/sessions\/[^/][^/]*/mnt\)/.*#\1#p' | head -n 1)"
  if [ -n "$derived" ]; then
    printf '%s\n' "$derived"
    return 0
  fi

  derived="$(printf '%s\n' "$plugin_root" | sed -n 's#^\(.*\)/\.remote-plugins/.*#\1#p' | head -n 1)"
  if [ -n "$derived" ]; then
    printf '%s\n' "$derived"
    return 0
  fi

  derived="$(printf '%s\n' "$plugin_root" | sed -n 's#^\(.*\)/cowork_plugins/.*#\1#p' | head -n 1)"
  if [ -n "$derived" ]; then
    printf '%s\n' "$derived"
    return 0
  fi

  return 1
}

state_file_path() {
  plugin_data_root="$1"
  printf '%s/state/cowork-plugin-context/%s.env\n' "$plugin_data_root" "$plugin_name"
}

derived_plugin_data_path() {
  base_root="$1"
  printf '%s/.claude/plugins/data\n' "$base_root"
}

read_state_value() {
  state_file="$1"
  key_name="$2"

  [ -f "$state_file" ] || return 1

  while IFS='=' read -r key value; do
    if [ "$key" = "$key_name" ]; then
      printf '%s\n' "$value"
      return 0
    fi
  done < "$state_file"

  return 1
}

resolve_context() {
  derived_plugin_data=''

  record_attempt 'live-env'
  if [ -n "${CLAUDE_PLUGIN_DATA:-}" ]; then
    resolved_plugin_data="$CLAUDE_PLUGIN_DATA"
    resolved_source='live-env'
    resolved_state_file="$(state_file_path "$resolved_plugin_data")"
  fi

  resolved_base_root="$(derive_base_root || true)"
  if [ -n "$resolved_base_root" ]; then
    derived_plugin_data="$(derived_plugin_data_path "$resolved_base_root")"
    if [ -z "$resolved_state_file" ]; then
      resolved_state_file="$(state_file_path "$derived_plugin_data")"
    fi
  fi

  if [ -z "$resolved_plugin_data" ]; then
    record_attempt 'session-state'
    if [ -n "$resolved_state_file" ] && [ -f "$resolved_state_file" ]; then
      state_plugin_data="$(read_state_value "$resolved_state_file" 'COWORK_PLUGIN_DATA' || true)"
      if [ -n "$state_plugin_data" ]; then
        resolved_plugin_data="$state_plugin_data"
        resolved_source='session-state'
      fi
    fi
  fi

  if [ -z "$resolved_plugin_data" ]; then
    record_attempt 'layout-discovery'
    if [ -n "$derived_plugin_data" ]; then
      resolved_plugin_data="$derived_plugin_data"
      resolved_source='layout-discovery'
      resolved_state_file="$(state_file_path "$resolved_plugin_data")"
    fi
  fi

  if [ -z "$resolved_plugin_data" ]; then
    fail "Unable to resolve Cowork plugin data for ${plugin_name}. Tried: ${attempted_sources}."
  fi

  if [ -z "$resolved_state_file" ]; then
    resolved_state_file="$(state_file_path "$resolved_plugin_data")"
  fi
}

write_state_file() {
  [ -n "$resolved_state_file" ] || return 0

  mkdir -p "$(dirname "$resolved_state_file")"
  {
    printf 'COWORK_PLUGIN_NAME=%s\n' "$plugin_name"
    printf 'COWORK_PLUGIN_ROOT=%s\n' "$plugin_root"
    printf 'COWORK_PLUGIN_DATA=%s\n' "$resolved_plugin_data"
    printf 'COWORK_PLUGIN_DATA_SOURCE=%s\n' "$resolved_source"
    printf 'COWORK_PLUGIN_ATTEMPTS=%s\n' "$attempted_sources"
    if [ -n "$resolved_base_root" ]; then
      printf 'COWORK_PLUGIN_BASE_ROOT=%s\n' "$resolved_base_root"
    fi
    printf 'CAPTURED_AT=%s\n' "$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
  } > "$resolved_state_file"
}

emit_shell() {
  printf 'export COWORK_PLUGIN_ROOT=%s\n' "$(shell_quote "$plugin_root")"
  printf 'export COWORK_PLUGIN_NAME=%s\n' "$(shell_quote "$plugin_name")"
  printf 'export COWORK_PLUGIN_DATA=%s\n' "$(shell_quote "$resolved_plugin_data")"
  printf 'export COWORK_PLUGIN_DATA_SOURCE=%s\n' "$(shell_quote "$resolved_source")"
  printf 'export COWORK_PLUGIN_ATTEMPTS=%s\n' "$(shell_quote "$attempted_sources")"
  printf 'export COWORK_PLUGIN_STATE_FILE=%s\n' "$(shell_quote "$resolved_state_file")"
  printf 'export COWORK_PLUGIN_BASE_ROOT=%s\n' "$(shell_quote "$resolved_base_root")"
}

command_name="${1:-}"
[ -n "$command_name" ] || usage
shift

while [ $# -gt 0 ]; do
  case "$1" in
    --plugin-root)
      shift
      plugin_root="${1:-}"
      ;;
    --plugin-name)
      shift
      plugin_name="${1:-}"
      ;;
    --format)
      shift
      format="${1:-}"
      ;;
    *)
      usage
      ;;
  esac
  shift
done

[ -n "$plugin_root" ] || fail 'plugin root is required'
[ -n "$plugin_name" ] || fail 'plugin name is required'
[ "$format" = 'shell' ] || fail "unsupported format: $format"

resolve_context

case "$command_name" in
  resolve)
    write_state_file
    emit_shell
    ;;
  capture)
    write_state_file
    emit_shell
    ;;
  *)
    usage
    ;;
esac
