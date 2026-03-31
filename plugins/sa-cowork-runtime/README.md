# SA Cowork Runtime

`sa-cowork-runtime` is the single Cowork test plugin for:

1. Bootstrapping `stash`, `mise`, and `deno` into `${CLAUDE_PLUGIN_DATA}/cowork-runtime`
2. Reusing that cache across fresh Cowork shells
3. Testing the simplest possible persisted secret file under `${CLAUDE_PLUGIN_DATA}`
4. Comparing a few tiny MCP credential wiring variants without depending on plugin settings UI

## Expected Behavior by Install Path

### Local uploaded plugin

- Best place to validate runtime bootstrap and cache reuse
- Command-driven secret tests should work
- Optional `userConfig` may or may not be surfaced by the host; treat it as an observation only

### Org-managed Cowork plugin

- Do not rely on `userConfig` being visible or editable
- Use the command-driven secret tests as the primary path
- Prefer remote MCP/custom connectors for long-term org-managed secret handling

## Commands

- `/sa-cowork-install`
- `/sa-cowork-secret-write`
- `/sa-cowork-secret-status`
- `/sa-cowork-secret-reset`
- `/sa-cowork-mcp-user-config`
- `/sa-cowork-mcp-plugin-option`
- `/sa-cowork-mcp-file`
- `/sa-cowork-mcp-file-env`

Use the plain slash command names above in Cowork. Do not prefix them with `sa-cowork-runtime:`.

## Simple Secret File Test

`/sa-cowork-secret-write <secret>` stores the provided secret in:

`$CLAUDE_PLUGIN_DATA/secret-smoke/persisted-secret.txt`

`/sa-cowork-secret-status` reports:

- whether the file still exists
- where it lives
- a redacted preview and hash
- whether the Cowork runtime cache still exists

`/sa-cowork-secret-reset` removes that file.

## MCP Variants

The plugin ships four tiny MCP servers, each exposing the same `status` tool:

- `cowork-secret-user-config` Tests explicit env mapping from `${user_config.smoke_*}`
- `cowork-secret-plugin-option` Tests inherited `CLAUDE_PLUGIN_OPTION_*` env vars without explicit mapping
- `cowork-secret-file` Tests direct file reads from plugin data
- `cowork-secret-file-env` Tests passing the secret file path through `${CLAUDE_PLUGIN_DATA}` env interpolation

All MCP responses stay redacted. They never return the raw secret.

## Manual Validation Flow

1. Install `sa-cowork-runtime`
2. Run `/sa-cowork-install`
3. Optionally set `smoke_label` / `smoke_token` if the install path exposes plugin settings
4. Run `/sa-cowork-secret-write <secret>`
5. Run `/sa-cowork-secret-status`
6. Start a fresh Cowork session and rerun `/sa-cowork-secret-status`
7. Run each MCP command:
   - `/sa-cowork-mcp-user-config`
   - `/sa-cowork-mcp-plugin-option`
   - `/sa-cowork-mcp-file`
   - `/sa-cowork-mcp-file-env`
8. Run `/sa-cowork-secret-reset` when done
