# sa-mise Marketplace

This repository is a minimal Claude/Cowork test bundle with two surfaces:

- three peer marketplace plugins that all ship the same generated `mise` shim:
  - `sa-mise`
  - `sa-mise-forwarder`
  - `sa-mise-cross-plugin`
- `sa-cowork-config-mcp`, a separately packaged MCPB extension for config
  handling tests

The plugin intentionally does not package `stash`, `stashaway-agents`, a public
`deno` shim, or any StashAway-private download logic.

## Included Plugins

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

## What The Peer Plugins Do

- `deno task generate` stamps identical shared shim assets into all three peer
  plugins from one source template
- every peer ships the same committed shim at `${CLAUDE_PLUGIN_ROOT}/bin/mise`
- Cowork may provide `${CLAUDE_COWORK_SHARED_ROOT}` to pin the shared-runtime
  base path explicitly
- each plugin keeps a durable local mirror at:
  `${CLAUDE_PLUGIN_DATA}/runtime-mirror/mise/${platform}/`
- all peers converge on the same shared session runtime at:
  `<shared-root>/.claude/plugins/shared-runtime/mise/${platform}/current/mise`
- any plugin may execute first, recreate the shared symlink, or backfill its own
  local mirror from the shared runtime
- shared registry state is stored at:
  `<shared-root>/.claude/plugins/shared-runtime/mise/${platform}/registry.json`
- shared resolver diagnostics are captured in:
  `${CLAUDE_PLUGIN_DATA}/state/cowork-plugin-context.env`
- the runtime installs the latest official `mise` binary on first use
- runtime files never write into `${HOME}`
- `sa-mise` is the direct shim fixture with no SessionStart hook sample
- `sa-mise-forwarder` and `sa-mise-cross-plugin` each include a SessionStart
  hook sample that proves `#!/usr/bin/env -S mise exec deno@latest -- deno run`
  works for registered hooks too
- the hook samples emit a random number plus runtime details so trace logs are
  easy to inspect

## Skill

Each plugin exposes one minimal skill matching its plugin name:

- `sa-mise`
- `sa-mise-forwarder`
- `sa-mise-cross-plugin`

If Claude has already put the active plugin `bin/` directory on `PATH`, use
`mise` directly:

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
   - `${CLAUDE_PLUGIN_DATA}/runtime-mirror/mise/${platform}/bin/mise`
   - `<shared-root>/.claude/plugins/shared-runtime/mise/${platform}/current/mise`
   - `<shared-root>/.claude/plugins/shared-runtime/mise/${platform}/registry.json`
   - `${CLAUDE_PLUGIN_DATA}/runtime-mirror/mise/${platform}/install-status.env`
   - `${CLAUDE_PLUGIN_DATA}/state/cowork-plugin-context.env`
5. For `sa-mise-forwarder` or `sa-mise-cross-plugin`, trigger SessionStart and
   verify `${CLAUDE_PLUGIN_DATA}/logs/session-start.log` is written too.

## Where To Check Hook Logs

The SessionStart hook writes:

- append-only hook log: `${CLAUDE_PLUGIN_DATA}/logs/session-start.log`

The log file is intentionally minimal. It records:

- `timestamp`
- `plugin_name`
- `plugin_data_source`
- `shared_root`
- `shared_root_source`
- `hook_status`
- `sample_name`
- `random_value`
- `resolved_mise_path`
- `mise_version`
- `deno_version`

The shared resolver state is also captured in:

- `${CLAUDE_PLUGIN_DATA}/state/cowork-plugin-context.env`

## Local Validation

This repo ships lightweight Deno tests for the static layout and shared `mise`
bootstrap behavior.

```bash
mise exec -- deno task generate
mise exec -- deno test --allow-all
```
