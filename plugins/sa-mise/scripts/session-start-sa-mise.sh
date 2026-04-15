#!/bin/sh

set -eu

sa_mise_bin="${CLAUDE_PLUGIN_ROOT:-}/bin"
if [ -n "${CLAUDE_ENV_FILE:-}" ]; then
  mkdir -p "$(dirname "$CLAUDE_ENV_FILE")"
  printf 'case ":$PATH:" in
*:%s:*) ;;
*) export PATH="%s:$PATH" ;;
esac
' "$sa_mise_bin" "$sa_mise_bin" >> "$CLAUDE_ENV_FILE"
fi

"${CLAUDE_PLUGIN_ROOT:-}/bin/mise" exec deno@latest -- deno eval 'Deno.exit(0)'
