# Cowork Runtime Test Marketplace

This repository is a minimal, static Claude Cowork marketplace bundle for
testing one specific flow:

1. Cowork installs a marketplace plugin.
2. The plugin ships transparent `bin/mise` and `bin/deno` shims.
3. Those shims bootstrap the real `mise` and `deno` binaries into
   `CLAUDE_PLUGIN_DATA`.
4. The plugin exposes a skill that verifies the runtime by running a tiny Deno
   script through the plugin-local shims.
5. A lightweight `SessionStart` hook leaves a durable marker in plugin data so
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

- Ships committed plugin-local shims at:
  - `${CLAUDE_PLUGIN_ROOT}/bin/mise`
  - `${CLAUDE_PLUGIN_ROOT}/bin/deno`
- Caches the real `mise` and `deno` binaries under
  `${CLAUDE_PLUGIN_DATA}/cowork-runtime-test/linux-arm64/bin`
- Reuses the cache when `deps/linux-arm64/runtime.env` has not changed
- Exposes the `sa-cowork-runtime-test-install` skill, which:
  - verifies the hook marker
  - prints shim paths and cached runtime paths
  - runs `mise` and `deno` through the plugin-local shims
  - runs a hello-world Deno script through the shimmed `deno`
- Appends a marker to
  `${CLAUDE_PLUGIN_DATA}/cowork-runtime-test/session-start.log` on every session
  start
- Never writes runtime files into `${HOME}/.local/bin`

## Manual Acceptance

1. Install the marketplace from this GitHub repo.
2. Open a fresh Cowork shell on `linux-arm64`.
3. Confirm `${CLAUDE_PLUGIN_DATA}/cowork-runtime-test/session-start.log` exists.
4. Invoke the `sa-cowork-runtime-test-install` skill.
5. Verify the output shows:
   - the plugin-local `mise` and `deno` shim paths
   - the cached `mise` and `deno` binary paths under `CLAUDE_PLUGIN_DATA`
   - the resolved `mise` and `deno` versions
   - `Hello from Cowork runtime test`

## Local Validation

This repo ships lightweight Deno tests for the static layout, runtime bootstrap,
and hook behavior.

```bash
mise exec -- deno test --allow-all
```
