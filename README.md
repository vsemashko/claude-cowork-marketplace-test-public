# Cowork Marketplace Test

This repo now keeps only three artifacts:

- `sa-cowork-bootstrap-probe`
- `sa-cowork-persist-probe`
- `sa-cowork-persist-extension`

The first two are Claude-style plugins exposed through the repo marketplace. The third is a desktop extension bundle source that should be packaged as an `.mcpb` file and installed directly in Claude Desktop.

## What Stays

| Artifact | Format | Purpose | Config path |
| --- | --- | --- | --- |
| `sa-cowork-bootstrap-probe` | `.claude-plugin` | Self-contained bootstrap probe that installs its own bundled CLI into `CLAUDE_PLUGIN_DATA` | `userConfig` |
| `sa-cowork-persist-probe` | `.claude-plugin` | Persists a value inside `CLAUDE_PLUGIN_DATA` and can read an explicit bridge file exported by the desktop extension | `userConfig` |
| `sa-cowork-persist-extension` | `manifest.json` / desktop extension | Persist probe for extension-format experiments | `user_config` |

The GitHub marketplace index only advertises the two `.claude-plugin` entries because that is the path Cowork currently ingests reliably from this repo.

## Install The Desktop Extension

`sa-cowork-persist-extension` is not installed through the marketplace tab. Package it first, then install the resulting `.mcpb` file from Claude Desktop.

### 1. Pack the extension

From the repo root:

```bash
npx -y @anthropic-ai/mcpb validate plugins/sa-cowork-persist-extension/manifest.json
npx -y @anthropic-ai/mcpb pack plugins/sa-cowork-persist-extension dist/sa-cowork-persist-extension.mcpb
```

### 2. Install it in Claude Desktop

1. Open `Settings > Extensions`.
2. Open `Advanced settings`.
3. Under the extension developer area, click `Install Extension...`.
4. Select `dist/sa-cowork-persist-extension.mcpb`.
5. Fill in `Probe Label` and `Probe Secret` when prompted.

Anthropic’s desktop extension docs describe the same flow:

- [Getting Started with Local MCP Servers on Claude Desktop](https://support.claude.com/en/articles/10949351-getting-started-with-local-mcp-servers-on-claude-desktop)

## Config Isolation

The main outcome from this repo is still:

- `.claude-plugin` `userConfig` values are injected into that plugin's own hooks, skills, and subprocesses
- desktop extension `user_config` values are injected into that extension server's own `mcp_config.env`
- there is no automatic cross-plugin or cross-format bridge between those two config systems

So if you configure `probe_label` in `sa-cowork-persist-extension`, the value does **not** magically appear in `sa-cowork-persist-probe` or `sa-cowork-bootstrap-probe`.

The only reliable bridge is an explicit shared storage path or another deliberate handoff.

## Explicit Bridge Experiment

`sa-cowork-persist-extension` exposes a `bridge_report` tool that writes a config summary to:

```text
~/.cowork-probe/persist-probe/config-bridge.json
```

`sa-cowork-persist-probe` includes a helper script that reads that file and reports what the extension exported.

This demonstrates:

- automatic config sharing: **no**
- explicit shared-file bridge: **yes**

## Testing In Cowork

Use the plugin skills or commands rather than the raw connector pane.

### Bootstrap Probe

Run:

```text
/sa-cowork-bootstrap-probe
```

Or prompt:

```text
Use the cowork-bootstrap-probe connector and run report_env, report_cache, run_probe, then report_cache again.
```

Expected result:

- the bundled CLI is copied into `${CLAUDE_PLUGIN_DATA}/bootstrap/bin`
- `run_probe` executes the cached CLI
- `report_cache` shows the install marker

### Persist Probe

Run:

```text
/sa-cowork-persist-probe
```

Expected result:

- writing without arguments persists a generated value into `${CLAUDE_PLUGIN_DATA}/persist-probe/persisted-value.txt`
- reading later returns the same value
- the helper script can read the explicit bridge file if `bridge_report` has been run first

### Desktop Extension Bridge

After installing and configuring `sa-cowork-persist-extension`, call:

- `persist_write`
- `persist_read`
- `bridge_report`

Then, from `sa-cowork-persist-probe`, run:

```bash
bash "${CLAUDE_PLUGIN_ROOT}/skills/sa-cowork-persist-probe/scripts/read-extension-bridge.sh"
```

If the bridge worked, the script prints:

- `source=sa-cowork-persist-extension`
- `probe_label=<configured value>`
- `probe_secret_present=true|false`
- `probe_secret_length=<number>`

## Notes

- The bootstrap plugin is fully self-contained; it no longer depends on `plugins/_shared/cli-probe`.
- The desktop extension stores data under `~/.cowork-probe/persist-probe/`.
- The Claude-style persist probe stores its own data under `${CLAUDE_PLUGIN_DATA}/persist-probe/`.
- Those two locations are intentionally different so the repo can show the difference between isolated plugin state and an explicit shared bridge.
