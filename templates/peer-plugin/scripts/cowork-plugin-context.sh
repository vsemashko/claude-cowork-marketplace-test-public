#!/bin/sh

set -eu

plugin_root=''
plugin_name=''
resolved_plugin_data=''
resolved_source=''
resolved_state_file=''
resolved_shared_root=''

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

read_plugin_name() {
  plugin_json_path="${plugin_root}/.claude-plugin/plugin.json"
  [ -f "$plugin_json_path" ] || fail "Missing plugin metadata: $plugin_json_path"

  parsed_name="$(sed -n 's/^[[:space:]]*"name"[[:space:]]*:[[:space:]]*"\([^"]*\)".*$/\1/p' "$plugin_json_path" | head -n 1)"
  [ -n "$parsed_name" ] || fail "Unable to read plugin name from $plugin_json_path"
  printf '%s\n' "$parsed_name"
}

resolve_context() {
  resolved_shared_root="$(derive_base_root || true)"

  if [ -n "${CLAUDE_PLUGIN_DATA:-}" ]; then
    resolved_plugin_data="$CLAUDE_PLUGIN_DATA"
    resolved_source='live-env'
  else
    [ -n "$resolved_shared_root" ] || fail 'Unable to resolve Cowork plugin data from env or plugin layout.'
    plugin_name="$(read_plugin_name)"
    resolved_plugin_data="${resolved_shared_root}/.claude/plugins/data/${plugin_name}"
    resolved_source='layout-discovery'
  fi

  [ -n "$plugin_name" ] || plugin_name="$(read_plugin_name)"
  [ -n "$resolved_shared_root" ] || resolved_shared_root="$(derive_base_root || true)"
  resolved_state_file="${resolved_plugin_data}/state/cowork-plugin-context.env"
}

write_state_file() {
  mkdir -p "$(dirname "$resolved_state_file")"
  {
    printf 'COWORK_PLUGIN_DATA=%s\n' "$resolved_plugin_data"
    printf 'COWORK_PLUGIN_DATA_SOURCE=%s\n' "$resolved_source"
    printf 'COWORK_PLUGIN_NAME=%s\n' "$plugin_name"
    printf 'COWORK_SHARED_ROOT=%s\n' "$resolved_shared_root"
    printf 'CAPTURED_AT=%s\n' "$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
  } > "$resolved_state_file"
}

emit_shell() {
  printf 'export COWORK_PLUGIN_DATA=%s\n' "$(shell_quote "$resolved_plugin_data")"
  printf 'export COWORK_PLUGIN_DATA_SOURCE=%s\n' "$(shell_quote "$resolved_source")"
  printf 'export COWORK_PLUGIN_NAME=%s\n' "$(shell_quote "$plugin_name")"
  printf 'export COWORK_SHARED_ROOT=%s\n' "$(shell_quote "$resolved_shared_root")"
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
