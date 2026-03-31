---
name: sa-cowork-install
description: Downloads Cowork runtime dependencies into persistent plugin data and bootstraps stashaway-agents with the cached binaries.
---

# Cowork Install

Use this skill only inside Claude Cowork guest shells.

## When to Use

- Cowork guest shell is missing `stash`, `mise`, or `deno`
- `sa-core:sa-agent-setup` detects Cowork and points here
- You want the Cowork bootstrap path that reuses plugin-data cache instead of `curl -fsSL https://stash.rest`

## Steps

1. Confirm you are in a Cowork guest on supported Linux (`linux-arm64` or `linux-x64`).
2. Run the bundled installer:

```bash
SA_COWORK_PLUGIN_DATA="${CLAUDE_PLUGIN_DATA}" \
  ${CLAUDE_PLUGIN_ROOT}/skills/sa-cowork-install/scripts/bootstrap-cowork-runtime.sh
```

3. Verify the command reports:
   - `stash`, `mise`, and `deno` linked into the guest from the persistent plugin-data cache
   - `stashaway-agents` available after `stash --skip-update-check ai agents setup`

## Expected Behavior

- Uses `${CLAUDE_PLUGIN_ROOT}` as the bootstrap source and `${CLAUDE_PLUGIN_DATA}` as the durable cache location
- Downloads `stash`, `mise`, and `deno` into `${CLAUDE_PLUGIN_DATA}/cowork-runtime` on first use
- Resolves the initial `stash` version from the StashAway release pointer on cold start, then lets `stash` keep itself fresh via its own updater
- Records the detected platform in `${CLAUDE_PLUGIN_DATA}/cowork-runtime/runtime.env` and refreshes the cache if the platform or pinned metadata
  changes
- Reuses the cached binaries on later runs while the plugin data survives
- Installs or refreshes guest-local links for cached `stash`, `mise`, and `deno`
- Seeds `stash` automatic update frequency to daily only when the user has not configured an update policy yet
- Runs `stash --skip-update-check ai agents setup`
- Verifies `stashaway-agents` before returning success
- Safe to rerun when Cowork opens a fresh shell and the plugin data cache is still present

## Fallback

If this skill fails because the runtime metadata is missing, the release pointer cannot be resolved, or the platform is unsupported, explain the
reason clearly and then fall back to:

```bash
curl -fsSL https://stash.rest | sh -s -- --setup-agents
```
