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
| `sa-cowork-remote-config-probe` | `.claude-plugin` | Hosted HTTP MCP + config report | `SessionStart` hook | No | Yes | `userConfig` | Hook writes a config report and the skill prints the configured endpoint, label, and token presence |
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
- `/sa-cowork-remote-config-probe`

Or paste one of these prompts into a Cowork session:

- `Use the cowork-bootstrap-probe connector and run report_env, report_cache, run_probe, then report_cache again.`
- `Use the cowork-download-probe connector and run report_env, report_cache, run_probe twice, then report_cache again.`
- `Run bash "${CLAUDE_PLUGIN_ROOT}/scripts/print-remote-config.sh" and summarize the resolved endpoint, label, token presence, and hook report path for the remote config probe.`

Expected outcomes:

- `report_env` echoes non-sensitive config and redacts the token
- bootstrap writes cache state into `${CLAUDE_PLUGIN_DATA}` during bootstrap/use
- download fetches the probe on first run and reuses it on the second run
- remote config writes a JSON report during `SessionStart` and the skill prints the same values from the hook/skill side

## Public References

Useful public plugin examples to compare against:

- `Rootly-AI-Labs/rootly-claude-plugin` is the closest public example of the exact pattern this repo now tests:
  top-level `userConfig`, a hosted HTTP MCP server in `.mcp.json`, and hook scripts that read the same token.
  [plugin.json](https://github.com/Rootly-AI-Labs/rootly-claude-plugin/blob/main/.claude-plugin/plugin.json)
  [.mcp.json](https://github.com/Rootly-AI-Labs/rootly-claude-plugin/blob/main/.mcp.json)
  [ARCHITECTURE.md](https://github.com/Rootly-AI-Labs/rootly-claude-plugin/blob/main/ARCHITECTURE.md)
- `attach-dev/attach-guard` shows a top-level `userConfig` token consumed by hook scripts:
  [plugin.json](https://github.com/attach-dev/attach-guard/blob/main/plugin/.claude-plugin/plugin.json)
- `libraz/claude-coverwise` shows `SessionStart` hooks plus local `mcpServers`:
  [plugin.json](https://github.com/libraz/claude-coverwise/blob/main/.claude-plugin/plugin.json)
- `trezero/telegram-per-project` shows `userConfig` plus MCP wiring in a simpler local plugin:
  [plugin.json](https://github.com/trezero/telegram-per-project/blob/main/.claude-plugin/plugin.json)
- `imgompanda/fireauto` is still useful as a reference for the external `.mcp.json` file shape Cowork expects, but it is not a `userConfig` example:
  [.mcp.json](https://github.com/imgompanda/fireauto/blob/main/plugin/.mcp.json)

## Notes

- The shared generic probe executable lives at `plugins/_shared/cli-probe/cowork-probe-cli`.
- The download plugins fetch that same script from the repo's raw GitHub URL by default.
- For local testing before the branch is published, override `PROBE_DOWNLOAD_URL` with a `file://` URL that points at the checked-in shared probe script.
- The marketplace index currently lists only the `.claude-plugin` entries. The `manifest.json` plugins remain in the repo for extension-format experiments outside the current Cowork marketplace sync path.
- The remote config probe intentionally focuses on config propagation. Its hosted MCP endpoint defaults to a harmless placeholder and the test signal comes from the hook report plus the skill output.
