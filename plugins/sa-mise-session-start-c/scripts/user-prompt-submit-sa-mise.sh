#!/bin/sh

set -eu

test "${SA_MISE_SESSION_ENV_PROBE:-}" = "visible-from-session-start"

mise exec deno@latest -- deno eval 'Deno.exit(0)' >/dev/null 2>&1
