# sa-mise Marketplace

This repository is a minimal Claude/Cowork test bundle with two marketplace
plugins and one separately packaged MCPB bundle:

- `sa-mise`: the canonical owner of the generated `mise` shim and shared runtime
  bootstrap logic
- `sa-mise-user`: a lightweight consumer plugin with no own `bin/mise`; its
  authored hooks use bare `mise`, and generation rewrites those hooks to resolve
  the sibling `sa-mise` plugin first
- `sa-cowork-config-mcp`: a separate MCPB extension for config handling tests

The plugin bundle intentionally does not package `stash`, `stashaway-agents`, a
public `deno` shim, or any StashAway-private download logic.

## Included Plugins

- `sa-mise`
- `sa-mise-user`

## Included MCPB Bundle

- `sa-cowork-config-mcp`

## Install

Add this repo as a marketplace source in Claude:

- Repository: `vsemashko/claude-cowork-marketplace-test-public`
- Marketplace plugins:
  - `sa-mise`
  - `sa-mise-user`

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

## What The Plugins Do

- `deno task generate` stamps the generated peer fixtures from one source
  script.
- `sa-mise` ships the canonical committed shim at
  `${CLAUDE_PLUGIN_ROOT}/bin/mise`.
- Cowork may provide `${CLAUDE_COWORK_SHARED_ROOT}` to pin the shared-runtime
  base path explicitly.
- `sa-mise` keeps a durable local mirror at:
  `${CLAUDE_PLUGIN_DATA}/runtime-mirror/mise/${platform}/`.
- The active session runtime is shared at:
  `<shared-root>/.claude/plugins/shared-runtime/mise/${platform}/current/mise`.
- Shared registry state is stored at:
  `<shared-root>/.claude/plugins/shared-runtime/mise/${platform}/registry.json`.
- Shared resolver diagnostics are captured in:
  `${CLAUDE_PLUGIN_DATA}/state/cowork-plugin-context.env`.
- The runtime installs the latest official `mise` binary on first use.
- Runtime files never write into `${HOME}`.
- `sa-mise` registers two `SessionStart` hooks:
  - a runtime hook that calls its own `${CLAUDE_PLUGIN_ROOT}/bin/mise`
  - a prompt/context hook that injects the instruction to always reply with
    `, sir`
- `sa-mise-user` does not ship `bin/mise`.
- `sa-mise-user` ships `scripts/resolve-env.sh`, whose only job is to:
  - find the sibling `sa-mise` plugin
  - prepend `<resolved-sa-mise>/bin` to `PATH`
  - export `SA_MISE_PLUGIN_ROOT`
  - fail clearly if the sibling owner plugin cannot be found
- The authored `sa-mise-user` hooks stay simple and assume bare `mise` is
  already available.
- During generation, every `sa-mise-user` command hook is rewritten to:
  - source `${CLAUDE_PLUGIN_ROOT}/scripts/resolve-env.sh`
  - run the original authored bare `mise` command in the enriched environment

## Skills

Each plugin exposes one minimal skill matching its plugin name:

- `sa-mise`
- `sa-mise-user`

For `sa-mise`, if the plugin `bin/` directory is already on `PATH`, run `mise`
directly:

```bash
mise --version
```

Or use the plugin-local shim explicitly:

```bash
${CLAUDE_PLUGIN_ROOT}/bin/mise --version
```

For `sa-mise-user`, the authored commands are just bare `mise`:

```bash
mise --version
```

The emitted hook commands source `scripts/resolve-env.sh` first so the sibling
`sa-mise` binary becomes available on `PATH`.

## Manual Acceptance

1. Install the marketplace from this GitHub repo.
2. Open a Claude plugin shell on a platform supported by the official `mise`
   installer.
3. Install both `sa-mise` and `sa-mise-user`.
4. Trigger `SessionStart` and verify `sa-mise`:
   - succeeds through `${CLAUDE_PLUGIN_ROOT}/bin/mise`
   - emits the prompt/context instruction to always reply with `, sir`
5. Trigger `SessionStart` for `sa-mise-user` and verify its hook succeeds even
   though the plugin does not ship `bin/mise`.
6. Confirm `sa-mise-user` resolves the sibling owner plugin and exposes bare
   `mise` by sourcing `scripts/resolve-env.sh`.
7. Verify the command succeeds and creates:
   - `${CLAUDE_PLUGIN_DATA}/runtime-mirror/mise/${platform}/bin/mise`
   - `<shared-root>/.claude/plugins/shared-runtime/mise/${platform}/current/mise`
   - `<shared-root>/.claude/plugins/shared-runtime/mise/${platform}/registry.json`
   - `${CLAUDE_PLUGIN_DATA}/runtime-mirror/mise/${platform}/install-status.env`
   - `${CLAUDE_PLUGIN_DATA}/state/cowork-plugin-context.env`

## Shared Resolver State

The shim still captures shared resolver state separately in:

- `${CLAUDE_PLUGIN_DATA}/state/cowork-plugin-context.env`

## Local Validation

This repo ships lightweight Deno tests for the static layout and shared `mise`
bootstrap behavior.

```bash
mise exec -- deno task generate
mise exec -- deno lint
mise exec -- deno test --allow-all
```
