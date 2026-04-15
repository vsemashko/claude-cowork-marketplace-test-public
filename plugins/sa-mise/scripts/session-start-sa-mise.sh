#!/bin/sh

set -eu

"${CLAUDE_PLUGIN_ROOT:-}/bin/mise" exec deno@latest -- deno eval 'Deno.exit(0)' >/dev/null 2>&1
