---
name: sa-cowork-runtime-test-install
description: Install the Cowork runtime test plugin's cached mise/deno pair, verify the hook marker, and run a hello-world Deno script.
---

# Cowork Runtime Test Install

Use this skill inside Claude Cowork guest shells on `linux-arm64`.

## What It Verifies

- `mise` is downloaded into persistent plugin data and linked into the guest
- `deno` is downloaded into persistent plugin data and linked into the guest
- the plugin hook leaves a durable marker in `CLAUDE_PLUGIN_DATA`
- a tiny Deno script can run successfully after bootstrap

## Command

```bash
CLAUDE_PLUGIN_DATA="${CLAUDE_PLUGIN_DATA}" \
  ${CLAUDE_PLUGIN_ROOT}/skills/sa-cowork-runtime-test-install/scripts/verify-cowork-runtime.sh
```

## Expected Persistent Files

- `${CLAUDE_PLUGIN_DATA}/cowork-runtime-test/linux-arm64/bin/mise`
- `${CLAUDE_PLUGIN_DATA}/cowork-runtime-test/linux-arm64/bin/deno`
- `${CLAUDE_PLUGIN_DATA}/cowork-runtime-test/linux-arm64/runtime.env`
- `${CLAUDE_PLUGIN_DATA}/cowork-runtime-test/session-start.log`

## Notes

- This plugin does not install `stash` or `stashaway-agents`.
- If you only want to bootstrap the runtime without running the Deno hello-world
  check, run:

```bash
${CLAUDE_PLUGIN_ROOT}/skills/sa-cowork-runtime-test-install/scripts/bootstrap-cowork-runtime.sh
```
