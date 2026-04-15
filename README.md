# sa-mise Marketplace

This repository is a minimal Claude/Cowork test bundle with two surfaces:

- three peer marketplace plugins that all ship the same generated `mise` shim:
  - `sa-mise`
  - `sa-mise-session-start-a`
  - `sa-mise-session-start-b`
  - `sa-mise-session-start-c`
- `sa-cowork-config-mcp`, a separately packaged MCPB extension for config
  handling tests

The plugin intentionally does not package `stash`, `stashaway-agents`, a public
`deno` shim, or any StashAway-private download logic.

## Included Plugins

- `sa-mise`
- `sa-mise-session-start-a`
- `sa-mise-session-start-b`
- `sa-mise-session-start-c`

## Included MCPB Bundle

- `sa-cowork-config-mcp`

## Install

Add this repo as a marketplace source in Claude:

- Repository: `vsemashko/claude-cowork-marketplace-test-public`
- Marketplace plugins:
  - `sa-mise`
  - `sa-mise-session-start-a`
  - `sa-mise-session-start-b`
  - `sa-mise-session-start-c`

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
- all three peer fixtures register minimal SessionStart hooks in
  `hooks/hooks.json`
- `sa-mise` also appends an idempotent PATH export to `CLAUDE_ENV_FILE` so later
  Bash commands in the session can discover its `bin/` directory
- the peer hooks intentionally exercise different lookup paths:
  - `sa-mise` invokes `${CLAUDE_PLUGIN_ROOT}/bin/mise` directly
  - `sa-mise-session-start-a` prepends `${CLAUDE_PLUGIN_ROOT}/bin` to `PATH` and
    then invokes bare `mise`
  - `sa-mise-session-start-b` resolves the sibling `sa-mise` plugin through a
    small helper script and invokes its `bin/mise` directly with no fallback
  - `sa-mise-session-start-c` invokes bare `mise` and relies on the PATH export
    written by `sa-mise` through `CLAUDE_ENV_FILE`
- the hooks are intentionally quiet now: they only execute the runtime probe and
  rely on the command exit status for success or failure

## Skill

Each plugin exposes one minimal skill matching its plugin name:

- `sa-mise`
- `sa-mise-session-start-a`
- `sa-mise-session-start-b`
- `sa-mise-session-start-c`

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
5. Trigger SessionStart and verify `sa-mise` writes a PATH export into
   `CLAUDE_ENV_FILE`.
6. Verify `sa-mise-session-start-c` can run bare `mise` after that session env
   export is available.

## Shared Resolver State

The shim still captures shared resolver state separately in:

- `${CLAUDE_PLUGIN_DATA}/state/cowork-plugin-context.env`

## Local Validation

This repo ships lightweight Deno tests for the static layout and shared `mise`
bootstrap behavior.

```bash
mise exec -- deno task generate
mise exec -- deno test --allow-all
```
