#!/bin/sh

set -eu

script_dir="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
plugin_root="$(CDPATH= cd -- "$script_dir/.." && pwd)"
export CLAUDE_PLUGIN_ROOT="$plugin_root"

. "$plugin_root/scripts/resolve-env.sh"
exec mise exec nodejs@22 -- npx -y @upstash/context7-mcp
