#!/bin/sh

plugin_root="${CLAUDE_PLUGIN_ROOT:-}"
[ -n "$plugin_root" ] || { echo "CLAUDE_PLUGIN_ROOT is required" >&2; return 1 2>/dev/null || exit 1; }

plugin_metadata="$plugin_root/.claude-plugin/plugin.json"
current_plugin_name="$(sed -n 's/^[[:space:]]*"name"[[:space:]]*:[[:space:]]*"\([^"]*\)".*$/\1/p' "$plugin_metadata" 2>/dev/null | head -n 1)"
current_plugin_name="${current_plugin_name:-unknown}"
plugin_parent="$(dirname "$plugin_root")"
resolve_log="${CLAUDE_PROJECT_DIR:-${PWD:-.}}/.sa-mise-resolve-env.log"
cache_file=""
if [ -n "${CLAUDE_PLUGIN_DATA:-}" ]; then
  cache_file="${CLAUDE_PLUGIN_DATA}/state/sa-mise-plugin-root"
  mkdir -p "$(dirname "$cache_file")"
fi
if [ -n "${XDG_RUNTIME_DIR:-}" ]; then
  export XDG_RUNTIME_DIR
else
  if [ -n "${CLAUDE_PLUGIN_DATA:-}" ]; then
    xdg_runtime_dir="${CLAUDE_PLUGIN_DATA}/runtime/xdg"
  else
    xdg_runtime_dir="/tmp/runtime-$(id -u)"
  fi
  mkdir -p "$xdg_runtime_dir" || { echo "Failed to create XDG_RUNTIME_DIR at $xdg_runtime_dir" >&2; return 1 2>/dev/null || exit 1; }
  chmod 700 "$xdg_runtime_dir" || { echo "Failed to secure XDG_RUNTIME_DIR at $xdg_runtime_dir" >&2; return 1 2>/dev/null || exit 1; }
  export XDG_RUNTIME_DIR="$xdg_runtime_dir"
fi
mkdir -p "$(dirname "$resolve_log")"

log_resolution() {
  source_label="$1"
  status_label="$2"
  resolved_root="$3"
  cache_state="$4"
  ts="$(date -u +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || date)"
  printf 'ts=%s plugin=%s source=%s status=%s cache=%s resolved_root=%s\n' "$ts" "$current_plugin_name" "$source_label" "$status_label" "$cache_state" "$resolved_root" >> "$resolve_log"
}

use_resolved_root() {
  resolved_root="$1"
  source_label="$2"
  cache_state="$3"
  sa_mise_bin="$resolved_root/bin"
  [ -x "$sa_mise_bin/mise" ] || return 1
  export SA_MISE_PLUGIN_ROOT="$resolved_root"
  export PATH="$sa_mise_bin:$PATH"
  log_resolution "$source_label" success "$resolved_root" "$cache_state"
  return 0
}

if [ -n "$cache_file" ] && [ -f "$cache_file" ]; then
  cached_root="$(sed -n '1p' "$cache_file")"
  if [ -n "$cached_root" ] && [ -f "$cached_root/.claude-plugin/plugin.json" ]; then
    cached_name="$(sed -n 's/^[[:space:]]*"name"[[:space:]]*:[[:space:]]*"\([^"]*\)".*$/\1/p' "$cached_root/.claude-plugin/plugin.json" | head -n 1)"
    if [ "$cached_name" = "sa-mise" ] && use_resolved_root "$cached_root" cache hit; then
      return 0 2>/dev/null || exit 0
    fi
  fi
  log_resolution cache invalid "${cached_root:-}" stale
fi

for sibling_plugin_root in "$plugin_parent"/*; do
  [ -d "$sibling_plugin_root" ] || continue
  sibling_metadata="$sibling_plugin_root/.claude-plugin/plugin.json"
  [ -f "$sibling_metadata" ] || continue
  sibling_name="$(sed -n 's/^[[:space:]]*"name"[[:space:]]*:[[:space:]]*"\([^"]*\)".*$/\1/p' "$sibling_metadata" | head -n 1)"
  if [ "$sibling_name" = "sa-mise" ]; then
    if [ -n "$cache_file" ]; then
      printf '%s\n' "$sibling_plugin_root" > "$cache_file"
    fi
    if use_resolved_root "$sibling_plugin_root" scan written; then
      return 0 2>/dev/null || exit 0
    fi
    echo "sa-mise bin/mise is missing" >&2
    return 1 2>/dev/null || exit 1
  fi
done

log_resolution scan failure "" miss
echo "sa-mise plugin not found" >&2
return 1 2>/dev/null || exit 1
