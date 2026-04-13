# sa-mise Marketplace

This repository is a minimal, static Claude marketplace bundle for one job: ship
a plugin-local `mise` shim that bootstraps the latest `mise` binary into shared
Cowork plugin data.

The plugin intentionally does not package `stash`, `stashaway-agents`, a public
`deno` shim, or any StashAway-private download logic.

## Included Plugin

- `sa-mise`

## Install

Add this repo as a marketplace source in Claude:

- Repository: `vsemashko/claude-cowork-marketplace-test-public`
- Marketplace plugin: `sa-mise`

## What The Plugin Does

- ships a committed shim at `${CLAUDE_PLUGIN_ROOT}/bin/mise`
- resolves plugin root from the shim path itself
- resolves plugin data in this order:
  - live `CLAUDE_PLUGIN_DATA`
  - shared Cowork session state
  - deterministic session-layout discovery
- captures shared resolver diagnostics in
  `${CLAUDE_PLUGIN_DATA}/state/cowork-plugin-context/sa-mise.env`
- installs the latest official `mise` binary on first use
- caches the binary under `${CLAUDE_PLUGIN_DATA}/sa-mise/linux-arm64/bin/mise`
- reuses the cached binary until the plugin cache is deleted
- never writes runtime files into `${HOME}`
- includes a SessionStart hook sample that proves
  `#!/usr/bin/env -S mise exec deno@latest -- deno run` works for registered
  hooks too

## Skill

The plugin exposes one minimal skill: `sa-mise`.

If Claude has already put the plugin `bin/` directory on `PATH`, use `mise`
directly:

```bash
mise --version
```

Or any other `mise` command:

```bash
mise <args>
```

If `mise` is not yet on `PATH`, the fallback is the plugin-local shim path:

```bash
${CLAUDE_PLUGIN_ROOT}/bin/mise --version
```

## Manual Acceptance

1. Install the marketplace from this GitHub repo.
2. Open a Claude plugin shell on `linux-arm64`.
3. Run `mise --version`. If `mise` is not yet on `PATH`, use
   `${CLAUDE_PLUGIN_ROOT}/bin/mise --version`.
4. Verify the command succeeds and creates:
   - `${CLAUDE_PLUGIN_DATA}/sa-mise/linux-arm64/bin/mise`
   - `${CLAUDE_PLUGIN_DATA}/sa-mise/linux-arm64/install-status.txt`
   - `${CLAUDE_PLUGIN_DATA}/logs/sa-mise/session-start.log`
   - `${CLAUDE_PLUGIN_DATA}/state/cowork-plugin-context/sa-mise.env`

## Where To Check Hook Logs

The SessionStart hook writes:

- append-only hook log: `${CLAUDE_PLUGIN_DATA}/logs/sa-mise/session-start.log`

The log file includes the hook timestamp, resolver source, and sample output
from the shebang-driven Deno script. The shared resolver state is also captured
in:

- `${CLAUDE_PLUGIN_DATA}/state/cowork-plugin-context/sa-mise.env`

## Local Validation

This repo ships lightweight Deno tests for the static layout and `mise` shim
bootstrap behavior.

```bash
mise exec -- deno test --allow-all
```
