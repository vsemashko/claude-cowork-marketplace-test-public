# Cowork Marketplace Test

This repo contains a small Cowork plugin matrix for testing two things side by side:

- CLI availability strategies in Cowork plugins
- Config propagation for `user_config` and `userConfig`

The repo keeps the older control plugins in place and adds a comparable set of generic probe plugins so we can test PATH-only, bootstrap, and download flows without tying the experiment to `glab`, Playwright, or `pup`.

Today, the GitHub-backed Cowork marketplace path in Claude reliably loads the `.claude-plugin` entries in this repo. The `manifest.json` / MCPB-style plugins are kept in the repo as controls and reference implementations, but they are not currently advertised from the marketplace index because Cowork marketplace sync does not ingest them cleanly in this flow.

## Plugin Matrix

| Plugin | Format | Strategy | Install timing | Requires network | Uses plugin data | Uses config | Expected success signal |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `sa-cowork-path-mcp` | `manifest.json` | PATH-only baseline | Never installs | No | No reuse | `user_config` | `run_probe` succeeds only if `cowork-probe-cli` is already on `PATH` |
| `sa-cowork-bootstrap-mcp` | `manifest.json` | Bundled bootstrap | Server startup | No | Yes | `user_config` | `report_cache` shows a bootstrap marker and `run_probe` reports `fresh_install` then `reused` |
| `sa-cowork-download-mcp` | `manifest.json` | Download on first run | First `run_probe` | Yes | Yes | `user_config` | `run_probe` downloads the probe once, then reuses it from cache |
| `sa-cowork-bootstrap-probe` | `.claude-plugin` | Bundled bootstrap mirror | `SessionStart` hook | No | Yes | `userConfig` | Session start writes the same bootstrap marker layout used by the manifest plugin |
| `sa-cowork-download-probe` | `.claude-plugin` | Download mirror | First `run_probe` | Yes | Yes | `userConfig` | `run_probe` downloads once, then reports cache reuse on later runs |
| `sa-cowork-persist-probe` | `.claude-plugin` | Existing control for plugin-data persistence | `SessionStart` hook | No | Yes | `userConfig` | Skill and MCP server can write and read the persisted value |
| `sa-cowork-bin-probe` | `.claude-plugin` | Existing control for PATH and cross-plugin binaries | Never installs | No | No | None | Skill can find the probe binaries via bare command or relative fallback paths |
| `sa-cowork-persist-mcp` | `manifest.json` | Existing control for manifest config + persistence | Runtime-specific | No | No plugin-data usage | `user_config` | MCP tools write and read a persisted value while surfacing manifest config |
| `sa-cowork-config-mcp` | `manifest.json` | Existing control for env injection | Never installs | No | No | `user_config` | `check_config` and `check_binaries` expose injected config without leaking secrets |

## Shared Probe Contract

The new experiment plugins all expose the same three tools:

- `report_env`
- `run_probe`
- `report_cache`

The new manifest plugins use the same `user_config` keys:

- `probe_label`
- `probe_endpoint`
- `probe_token` (sensitive)

The two `.claude-plugin` mirrors use the same keys under top-level `userConfig`.

## How To Read The Matrix

- PATH-only baseline approximates "the CLI is already installed on the machine"
- Bootstrap approximates "install the runtime into plugin data at session start or server startup"
- Download approximates "fetch the binary or runtime on demand and reuse the cached copy later"
- The existing config controls approximate "pass tokens and endpoint-style values into the server or wrapper environment"

## Testing In Cowork

The `Connectors` view is mainly a raw MCP wiring preview. It is useful for confirming that Cowork discovered the server, but it is not the best place to exercise these plugins.

Use the plugin skill or command instead:

- `/sa-cowork-bootstrap-probe`
- `/sa-cowork-download-probe`

Or paste one of these prompts into a Cowork session:

- `Use the cowork-bootstrap-probe connector and run report_env, report_cache, run_probe, then report_cache again.`
- `Use the cowork-download-probe connector and run report_env, report_cache, run_probe twice, then report_cache again.`

Expected outcomes:

- `report_env` echoes non-sensitive config and redacts the token
- bootstrap writes cache state into `${CLAUDE_PLUGIN_DATA}` during bootstrap/use
- download fetches the probe on first run and reuses it on the second run

## Public References

Useful public plugin examples to compare against:

- `trezero/telegram-per-project` shows `userConfig` plus inline `mcpServers` in `plugin.json`:
  [plugin.json](https://github.com/trezero/telegram-per-project/blob/main/.claude-plugin/plugin.json)
- `libraz/claude-coverwise` shows a `SessionStart` hook plus inline `mcpServers`:
  [plugin.json](https://github.com/libraz/claude-coverwise/blob/main/.claude-plugin/plugin.json)
- `imgompanda/fireauto` shows the external `.mcp.json` shape Cowork expects:
  [.mcp.json](https://github.com/imgompanda/fireauto/blob/main/plugin/.mcp.json)
- `attach-dev/attach-guard` shows a top-level `userConfig` token pattern without MCP:
  [plugin.json](https://github.com/attach-dev/attach-guard/blob/main/plugin/.claude-plugin/plugin.json)
- `Rootly-AI-Labs/rootly-claude-plugin` shows a hosted-plugin `userConfig` token pattern:
  [plugin.json](https://github.com/Rootly-AI-Labs/rootly-claude-plugin/blob/main/.claude-plugin/plugin.json)

## Notes

- The shared generic probe executable lives at `plugins/_shared/cli-probe/cowork-probe-cli`.
- The download plugins fetch that same script from the repo's raw GitHub URL by default.
- For local testing before the branch is published, override `PROBE_DOWNLOAD_URL` with a `file://` URL that points at the checked-in shared probe script.
- The marketplace index currently lists only the `.claude-plugin` entries. The `manifest.json` plugins remain in the repo for extension-format experiments outside the current Cowork marketplace sync path.
