#!/usr/bin/env sh
set -eu

plugin_root="${CLAUDE_PLUGIN_ROOT:?CLAUDE_PLUGIN_ROOT is required}"
plugin_data="${CLAUDE_PLUGIN_DATA:?CLAUDE_PLUGIN_DATA is required}"
asset_path=$(cd "${plugin_root}/../_shared/cli-probe" && pwd)/cowork-probe-cli
cache_dir="${plugin_data}/bootstrap"
bin_dir="${cache_dir}/bin"
executable_path="${bin_dir}/cowork-probe-cli"
marker_path="${cache_dir}/install.json"
plugin_version="${CLAUDE_PLUGIN_VERSION:-1.0.0}"
plugin_name="sa-cowork-bootstrap-probe"

mkdir -p "$bin_dir"

reuse="false"
if [ -x "$executable_path" ] && [ -f "$marker_path" ]; then
  marker_version=$(sed -n 's/.*"pluginVersion": "\(.*\)".*/\1/p' "$marker_path" | head -n 1)
  marker_source=$(sed -n 's/.*"source": "\(.*\)".*/\1/p' "$marker_path" | head -n 1)
  if [ "$marker_version" = "$plugin_version" ] && [ "$marker_source" = "$asset_path" ]; then
    reuse="true"
  fi
fi

if [ "$reuse" != "true" ]; then
  cp "$asset_path" "$executable_path"
  chmod 755 "$executable_path"

  installed_at=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
  cat > "$marker_path" <<EOF
{
  "strategy": "bootstrap",
  "pluginName": "$plugin_name",
  "pluginVersion": "$plugin_version",
  "commandName": "cowork-probe-cli",
  "sourceType": "bundled",
  "source": "$asset_path",
  "installedAt": "$installed_at"
}
EOF
fi
