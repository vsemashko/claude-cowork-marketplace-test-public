#!/bin/sh

set -eu

if [ -n "${CLAUDE_ENV_FILE:-}" ] && [ -f "${CLAUDE_ENV_FILE}" ]; then
  . "${CLAUDE_ENV_FILE}"
fi

mise exec deno@latest -- deno eval 'Deno.exit(0)' >/dev/null 2>&1
