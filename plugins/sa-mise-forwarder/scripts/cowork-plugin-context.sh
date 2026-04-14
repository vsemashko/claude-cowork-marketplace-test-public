#!/bin/sh

set -eu

plugin_root=''
resolved_plugin_data=''
resolved_source=''
resolved_state_file=''
attempted_sources=''

usage() {
  cat >&2 <<'EOF'
Usage:
  cowork-plugin-context.sh resolve --plugin-root <path>
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
  printf '%s/state/cowork-plugin-context.env\n' "$plugin_data_root"
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
  resolved_base_root="$(derive_base_root || true)"
  derived_plugin_data=''

  record_attempt 'live-env'
  if [ -n "${CLAUDE_PLUGIN_DATA:-}" ]; then
    resolved_plugin_data="$CLAUDE_PLUGIN_DATA"
    resolved_source='live-env'
    resolved_state_file="$(state_file_path "$resolved_plugin_data")"
  fi

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
    fail "Unable to resolve Cowork plugin data. Tried: ${attempted_sources}."
  fi

  if [ -z "$resolved_state_file" ]; then
    resolved_state_file="$(state_file_path "$resolved_plugin_data")"
  fi
}

write_state_file() {
  mkdir -p "$(dirname "$resolved_state_file")"
  {
    printf 'COWORK_PLUGIN_DATA=%s\n' "$resolved_plugin_data"
    printf 'COWORK_PLUGIN_DATA_SOURCE=%s\n' "$resolved_source"
    printf 'CAPTURED_AT=%s\n' "$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
  } > "$resolved_state_file"
}

emit_shell() {
  printf 'export COWORK_PLUGIN_DATA=%s\n' "$(shell_quote "$resolved_plugin_data")"
  printf 'export COWORK_PLUGIN_DATA_SOURCE=%s\n' "$(shell_quote "$resolved_source")"
  printf 'export COWORK_PLUGIN_STATE_FILE=%s\n' "$(shell_quote "$resolved_state_file")"
}

command_name="${1:-}"
[ "$command_name" = 'resolve' ] || usage
shift

while [ $# -gt 0 ]; do
  case "$1" in
    --plugin-root)
      shift
      plugin_root="${1:-}"
      ;;
    *)
      usage
      ;;
  esac
  shift
done

[ -n "$plugin_root" ] || fail 'plugin root is required'

resolve_context
write_state_file
emit_shell
