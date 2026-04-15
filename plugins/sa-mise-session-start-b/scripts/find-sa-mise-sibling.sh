#!/bin/sh

set -eu

plugin_root="${CLAUDE_PLUGIN_ROOT:-}"
[ -n "$plugin_root" ] || { echo "CLAUDE_PLUGIN_ROOT is required" >&2; exit 1; }

plugin_parent="$(dirname "$plugin_root")"
for sibling_plugin_root in "$plugin_parent"/*; do
  [ -d "$sibling_plugin_root" ] || continue
  sibling_metadata="$sibling_plugin_root/.claude-plugin/plugin.json"
  [ -f "$sibling_metadata" ] || continue
  sibling_name="$(sed -n 's/^[[:space:]]*"name"[[:space:]]*:[[:space:]]*"\([^"]*\)".*$/\1/p' "$sibling_metadata" | head -n 1)"
  if [ "$sibling_name" = "sa-mise" ]; then
    printf "%s\n" "$sibling_plugin_root"
    exit 0
  fi
done

echo "sa-mise plugin not found" >&2
exit 1
