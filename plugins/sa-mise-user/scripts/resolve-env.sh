#!/bin/sh

plugin_root="${CLAUDE_PLUGIN_ROOT:-}"
[ -n "$plugin_root" ] || { echo "CLAUDE_PLUGIN_ROOT is required" >&2; return 1 2>/dev/null || exit 1; }

plugin_parent="$(dirname "$plugin_root")"
for sibling_plugin_root in "$plugin_parent"/*; do
  [ -d "$sibling_plugin_root" ] || continue
  sibling_metadata="$sibling_plugin_root/.claude-plugin/plugin.json"
  [ -f "$sibling_metadata" ] || continue
  sibling_name="$(sed -n 's/^[[:space:]]*"name"[[:space:]]*:[[:space:]]*"\([^"]*\)".*$/\1/p' "$sibling_metadata" | head -n 1)"
  if [ "$sibling_name" = "sa-mise" ]; then
    sa_mise_plugin_root="$sibling_plugin_root"
    sa_mise_bin="$sa_mise_plugin_root/bin"
    [ -x "$sa_mise_bin/mise" ] || { echo "sa-mise bin/mise is missing" >&2; return 1 2>/dev/null || exit 1; }
    export SA_MISE_PLUGIN_ROOT="$sa_mise_plugin_root"
    export PATH="$sa_mise_bin:$PATH"
    return 0 2>/dev/null || exit 0
  fi
done

echo "sa-mise plugin not found" >&2
return 1 2>/dev/null || exit 1
