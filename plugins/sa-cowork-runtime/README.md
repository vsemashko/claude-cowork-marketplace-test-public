# SA Cowork Runtime

`sa-cowork-runtime` is the single Cowork test plugin for:

1. Bootstrapping `stash`, `mise`, and `deno` into `${CLAUDE_PLUGIN_DATA}/cowork-runtime`
2. Reusing that cache across fresh Cowork shells
3. Comparing multiple secret-management paths without depending on plugin settings UI

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
- `/sa-cowork-secret-test-mcp`
- `/sa-cowork-secret-test-form`
- `/sa-cowork-secret-test-config`
- `/sa-cowork-secret-test-connector`
- `/sa-cowork-secret-status`
- `/sa-cowork-secret-reset`

## Bundled MCP Probe

The plugin also ships a bundled `cowork-secret-probe` MCP server for the native credential-provisioning path.

- It maps optional `userConfig` values into MCP env vars
- It reports whether those mapped vars were present in the MCP subprocess
- It also reports whether inherited `CLAUDE_PLUGIN_OPTION_*` env vars were present
- It never returns raw secrets, only presence and hashes

Use `/sa-cowork-secret-test-mcp` to tell Claude to call that MCP probe and summarize the redacted result.

## Secret Test Targets

### Form bridge

Writes a user-provided secret into a removable file target under `${HOME}/.sa-cowork-secret-harness`.

- `env-file`
- `json-file`

### Config bridge

Writes a user-provided secret into a config surface that can be inspected later.

- `claude-settings-mcp` writes a test-owned `mcpServers` entry into `~/.claude/settings.json`
- `stash-setting` writes a namespaced test setting through `stash settings set` and is tracked as manual-cleanup only

Plugin data keeps only hashes and redacted metadata for these tests.

## Manual Validation Flow

1. Install `sa-cowork-runtime`
2. Run `/sa-cowork-install`
3. Optionally set `smoke_label` / `smoke_token` if the install path exposes plugin settings
4. Run `/sa-cowork-secret-test-mcp`
5. Run `/sa-cowork-secret-test-form`
6. Run `/sa-cowork-secret-test-config`
7. Run `/sa-cowork-secret-test-connector`
8. Run `/sa-cowork-secret-status`
9. Start a fresh Cowork session and rerun `/sa-cowork-secret-status`
10. Run `/sa-cowork-secret-reset` when done
