# Temporary Cowork Marketplace

This repo is now intentionally minimal:

- `sa-tmp-core` — one Claude-style marketplace plugin
- `sa-extension` — one companion desktop extension packaged as `.mcpb`

`sa-tmp-core` includes:

- a `SessionStart` hook that writes the plugin user settings into `${CLAUDE_PLUGIN_DATA}/tmp-core/session-start.json`
- one local MCP server named `sa-local-mcp`
- two skills/commands: `sa-tmp-list` and `sa-tmp-set`

`sa-extension` includes:

- `set_value`
- `get_value`
- `get_all`

## Plugin Config

`sa-tmp-core` exposes these plugin `userConfig` values:

- `tmp_public_value`
- `tmp_secret_value`

The session-start hook writes both values into:

```text
${CLAUDE_PLUGIN_DATA}/tmp-core/session-start.json
```

The local MCP server `sa-local-mcp` also receives those same values through its env.

## Extension Config

`sa-extension` exposes these extension `user_config` values:

- `extension_public_value`
- `extension_secret_value`

Its `get_all` tool returns:

- the configured public value
- the configured secret value
- the last value written via `set_value`

## Install The Extension

`sa-extension` is not installed from the marketplace tab. Package it first, then install the resulting `.mcpb` file from Claude Desktop.

From the repo root:

```bash
npx -y @anthropic-ai/mcpb validate plugins/sa-extension/manifest.json
npx -y @anthropic-ai/mcpb pack plugins/sa-extension dist/sa-extension.mcpb
```

Then in Claude Desktop:

1. Open `Settings > Extensions`
2. Open `Advanced settings`
3. Click `Install Extension...`
4. Select `dist/sa-extension.mcpb`
5. Fill in `Extension Public Value` and `Extension Secret Value`

## Test Flow

### `sa-tmp-list`

Use:

```text
/sa-tmp-list
```

Expected behavior:

1. Read `${CLAUDE_PLUGIN_DATA}/tmp-core/session-start.json`
2. Call `sa-local-mcp` `get_all`
3. Call `sa-extension` `get_all` if the extension is installed
4. Print all three results

### `sa-tmp-set`

Use:

```text
/sa-tmp-set [value]
```

Expected behavior:

1. If a value is provided, use it
2. Otherwise default to the plugin `tmp_public_value`
3. Call `sa-extension` `set_value`
4. Call `sa-extension` `get_value`
5. Print the final extension value

## Notes

- This is a local test harness, so raw secret values are shown for simplicity.
- `sa-local-mcp` and `sa-extension` intentionally expose similar tool surfaces so their output can be compared side by side.
