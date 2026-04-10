# Cowork Runtime Test Marketplace

This repository is a minimal, static Claude Cowork marketplace bundle for
testing one specific flow:

1. Cowork installs a marketplace plugin.
2. The plugin bootstraps `mise` and `deno` into `CLAUDE_PLUGIN_DATA`.
3. The plugin exposes a skill that verifies the runtime by running a tiny Deno
   script.
4. A lightweight `SessionStart` hook leaves a durable marker in plugin data so
   hook execution is easy to confirm.

This repo intentionally does not package `stash`, `stashaway-agents`, provider
sync logic, or any StashAway-private download flow.

## Included Plugin

- `sa-cowork-runtime-test`

## Install

Add this repo as a marketplace source in Claude/Cowork:

- Repository: `vsemashko/claude-cowork-marketplace-test-public`
- Marketplace plugin: `sa-cowork-runtime-test`

## What The Plugin Does

- Caches `mise` and `deno` under
  `${CLAUDE_PLUGIN_DATA}/cowork-runtime-test/linux-arm64`
- Reuses the cache when `deps/linux-arm64/runtime.env` has not changed
- Links the cached binaries into `${HOME}/.local/bin` by default
- Exposes the `sa-cowork-runtime-test-install` skill, which:
  - bootstraps the runtime if needed
  - prints `mise` and `deno` versions and resolved paths
  - runs a hello-world Deno script
- Appends a marker to
  `${CLAUDE_PLUGIN_DATA}/cowork-runtime-test/session-start.log` on every session
  start

## Manual Acceptance

1. Install the marketplace from this GitHub repo.
2. Open a fresh Cowork shell on `linux-arm64`.
3. Confirm `${CLAUDE_PLUGIN_DATA}/cowork-runtime-test/session-start.log` exists.
4. Invoke the `sa-cowork-runtime-test-install` skill.
5. Verify the output shows:
   - the resolved `mise` path and version
   - the resolved `deno` path and version
   - `Hello from Cowork runtime test`

## Local Validation

This repo ships lightweight Deno tests for the static layout, runtime bootstrap,
and hook behavior.

```bash
mise exec -- deno test --allow-all
```
