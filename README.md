# sa-mise Marketplace

This repository is a minimal Claude/Cowork test bundle with four surfaces:

- `sa-mise`, a marketplace plugin that ships a transparent `mise` shim
- `sa-mise-forwarder`, a consumer plugin with its own forwarding `mise` shim
- `sa-mise-cross-plugin`, an experimental consumer plugin that tries peer/PATH
  discovery before falling back to shared Cowork runtime state
- `sa-cowork-config-mcp`, a separately packaged MCPB extension for config
  handling tests

The plugin intentionally does not package `stash`, `stashaway-agents`, a public
`deno` shim, or any StashAway-private download logic.

## Included Plugin

- `sa-mise`
- `sa-mise-forwarder`
- `sa-mise-cross-plugin`

## Included MCPB Bundle

- `sa-cowork-config-mcp`

## Install

Add this repo as a marketplace source in Claude:

- Repository: `vsemashko/claude-cowork-marketplace-test-public`
- Marketplace plugins:
  - `sa-mise`
  - `sa-mise-forwarder`
  - `sa-mise-cross-plugin`

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

## Consumer Plugin Contract

Install `sa-mise` first, then add either or both consumer plugins manually.
There is no automatic marketplace dependency mechanism in this repo.

- `sa-mise-forwarder` is the reliable consumer path.
- `sa-mise-cross-plugin` is the experimental path-research consumer.

## PATH Strategy Matrix

This repo exercises three ways to make `mise` discoverable for shebang hooks:

- Documented Claude behavior: enabled plugin-local `bin/` directories are added
  to the Bash tool `PATH`
- Reliable hook approach: a launcher script mutates `PATH` before executing a
  TypeScript shebang hook
- Reliable reuse approach: `sa-mise-forwarder` ships a local `bin/mise` that
  forwards to the warmed `sa-mise` runtime in shared Cowork plugin data
- Experimental approach: `sa-mise-cross-plugin` first tries to find `mise` from
  another plugin already on `PATH`, then falls back to the shared install marker
- Official `mise` guidance: `mise exec` is the recommended scripted execution
  model; shell activation and shims are broader interactive PATH strategies

## Skill

The marketplace exposes these minimal skills:

- `sa-mise`
- `sa-mise-forwarder`
- `sa-mise-cross-plugin`

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

For the reliable consumer path, install `sa-mise-forwarder` and let its hook
launcher prepend the plugin-local `bin/` directory before running the shebang
script.

For the experimental consumer path, install `sa-mise-cross-plugin`. It records
whether it used:

- `path`
- `install-marker`

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
5. Install `sa-mise-forwarder` or `sa-mise-cross-plugin`.
6. Trigger the consumer hook and verify the log records:
   - `sample_name`
   - `path_strategy`
   - `resolved_mise_path`
   - `mise_version`
   - `deno_version`
   - `hook_status`

## Where To Check Hook Logs

The SessionStart hook writes:

- append-only hook log: `${CLAUDE_PLUGIN_DATA}/logs/session-start.log`
- forwarder hook log:
  `${CLAUDE_PLUGIN_DATA}/logs/sa-mise-forwarder-session-start.log`
- cross-plugin hook log:
  `${CLAUDE_PLUGIN_DATA}/logs/sa-mise-cross-plugin-session-start.log`

The log file is intentionally minimal. It records:

- `timestamp`
- `plugin_data_source`
- `hook_status`
- `sample_name`
- `path_strategy`
- `resolved_mise_path`
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
