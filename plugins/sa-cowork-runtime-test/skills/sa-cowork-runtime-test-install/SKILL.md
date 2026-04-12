---
name: sa-cowork-runtime-test-install
description: Verify the Cowork runtime test plugin's hook marker and plugin-local mise/deno shims by running a tiny Deno script.
---

# Cowork Runtime Test Install

Use this skill inside Claude Cowork guest shells on `linux-arm64`.

## What It Verifies

- committed plugin-local `bin/mise` and `bin/deno` shims exist
- the shims download `mise` and `deno` into persistent plugin data on demand
- the plugin hook leaves a durable marker in `CLAUDE_PLUGIN_DATA`
- a tiny Deno script can run successfully through the shimmed `deno`

## Command

```bash
CLAUDE_PLUGIN_DATA="${CLAUDE_PLUGIN_DATA}" \
  ${CLAUDE_PLUGIN_ROOT}/skills/sa-cowork-runtime-test-install/scripts/verify-cowork-runtime.sh
```

## Expected Persistent Files

- `${CLAUDE_PLUGIN_DATA}/cowork-runtime-test/linux-arm64/bin/mise`
- `${CLAUDE_PLUGIN_DATA}/cowork-runtime-test/linux-arm64/bin/deno`
- `${CLAUDE_PLUGIN_DATA}/cowork-runtime-test/linux-arm64/runtime.env`
- `${CLAUDE_PLUGIN_DATA}/cowork-runtime-test/linux-arm64/install-status.txt`
- `${CLAUDE_PLUGIN_DATA}/cowork-runtime-test/session-start.log`

## Notes

- This plugin does not install `stash` or `stashaway-agents`.
- The committed shim entrypoints are:
  - `${CLAUDE_PLUGIN_ROOT}/bin/mise`
  - `${CLAUDE_PLUGIN_ROOT}/bin/deno`
- If you only want to ensure the runtime cache exists without running the
  verification flow, run:

```bash
${CLAUDE_PLUGIN_ROOT}/scripts/runtime-shim.sh ensure
```
