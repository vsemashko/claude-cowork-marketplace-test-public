# sa-mise Marketplace

This repository is a minimal Claude/Cowork test bundle with two surfaces:

- `sa-mise`, a marketplace plugin that ships a transparent `mise` shim
- `sa-cowork-config-mcp`, a separately packaged MCPB extension for config
  handling tests

The plugin intentionally does not package `stash`, `stashaway-agents`, a public
`deno` shim, or any StashAway-private download logic.

## Included Plugin

- `sa-mise`

## Included MCPB Bundle

- `sa-cowork-config-mcp`

## Install

Add this repo as a marketplace source in Claude:

- Repository: `vsemashko/claude-cowork-marketplace-test-public`
- Marketplace plugin: `sa-mise`

The config MCPB is packaged separately and is not installed through the
marketplace manifest.

## Install The Config MCPB

From the repo root:

```bash
npm --prefix plugins/sa-cowork-config-mcp/server install
npm --prefix plugins/sa-cowork-config-mcp/server run build
npx -y @anthropic-ai/mcpb validate plugins/sa-cowork-config-mcp/manifest.json
npx -y @anthropic-ai/mcpb pack plugins/sa-cowork-config-mcp dist/sa-cowork-config-mcp.mcpb
```

Then install `dist/sa-cowork-config-mcp.mcpb` in Claude Desktop and configure:

- `dd_api_key`
- `dd_site`
- `gitlab_token`

## What The Plugin Does

- ships a committed shim at `${CLAUDE_PLUGIN_ROOT}/bin/mise`
- resolves plugin root from the shim path itself
- resolves plugin data in this order:
  - live `CLAUDE_PLUGIN_DATA`
  - shared Cowork session state
  - deterministic session-layout discovery
- captures shared resolver diagnostics in
  `${CLAUDE_PLUGIN_DATA}/state/cowork-plugin-context.env`
- installs the latest official `mise` binary on first use
- caches the binary under `${CLAUDE_PLUGIN_DATA}/${platform}/bin/mise`
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
2. Open a Claude plugin shell on a platform supported by the official `mise`
   installer.
3. Run `mise --version`. If `mise` is not yet on `PATH`, use
   `${CLAUDE_PLUGIN_ROOT}/bin/mise --version`.
4. Verify the command succeeds and creates:
   - `${CLAUDE_PLUGIN_DATA}/${platform}/bin/mise`
   - `${CLAUDE_PLUGIN_DATA}/${platform}/install-status.txt`
   - `${CLAUDE_PLUGIN_DATA}/logs/session-start.log`
   - `${CLAUDE_PLUGIN_DATA}/state/cowork-plugin-context.env`

## Where To Check Hook Logs

The SessionStart hook writes:

- append-only hook log: `${CLAUDE_PLUGIN_DATA}/logs/session-start.log`

The log file is intentionally minimal. It records:

- `timestamp`
- `plugin_data_source`
- `hook_status`
- `sample_name`
- `mise_version`
- `deno_version`

The shared resolver state is also captured in:

- `${CLAUDE_PLUGIN_DATA}/state/cowork-plugin-context.env`

## Local Validation

This repo ships lightweight Deno tests for the static layout and `mise` shim
bootstrap behavior.

```bash
mise exec -- deno test --allow-all
```
