# sa-mise Marketplace

This repository is a minimal, static Claude marketplace bundle for one job: ship
a plugin-local `mise` shim that bootstraps the latest `mise` binary into
`CLAUDE_PLUGIN_DATA`.

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
- prefers live `CLAUDE_PLUGIN_DATA` and falls back to a SessionStart hook
  snapshot
- installs the latest official `mise` binary on first use
- caches the binary under `${CLAUDE_PLUGIN_DATA}/sa-mise/linux-arm64/bin/mise`
- reuses the cached binary until the plugin cache is deleted
- never writes runtime files into `${HOME}`
- includes an internal SessionStart hook sample that proves
  `#!/usr/bin/env -S mise exec deno@latest -- deno run` works end to end

## Skill

The plugin exposes one minimal skill: `sa-mise`.

Use it by running:

```bash
${CLAUDE_PLUGIN_ROOT}/bin/mise --version
```

Or any other `mise` command:

```bash
${CLAUDE_PLUGIN_ROOT}/bin/mise <args>
```

## Manual Acceptance

1. Install the marketplace from this GitHub repo.
2. Open a Claude plugin shell on `linux-arm64`.
3. Run `/absolute/path/to/bin/mise --version`.
4. Verify the command succeeds and creates:
   - `${CLAUDE_PLUGIN_DATA}/sa-mise/linux-arm64/bin/mise`
   - `${CLAUDE_PLUGIN_DATA}/sa-mise/linux-arm64/install-status.txt`
   - `${CLAUDE_PLUGIN_DATA}/sa-mise/linux-arm64/hook-sample-status.txt`

## Local Validation

This repo ships lightweight Deno tests for the static layout and `mise` shim
bootstrap behavior.

```bash
mise exec -- deno test --allow-all
```
