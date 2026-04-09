# Cowork Marketplace Test

This repo is intentionally small now. It keeps only the two Claude-style probes we still want to exercise in Cowork plus one MCPB persistence experiment:

- `sa-cowork-bootstrap-probe`
- `sa-cowork-persist-probe`
- `sa-cowork-persist-mcp`

## What Stays

| Artifact | Format | Purpose | Config path |
| --- | --- | --- | --- |
| `sa-cowork-bootstrap-probe` | `.claude-plugin` | Self-contained bootstrap probe that installs its own bundled CLI into `CLAUDE_PLUGIN_DATA` | `userConfig` |
| `sa-cowork-persist-probe` | `.claude-plugin` | Persists a value inside `CLAUDE_PLUGIN_DATA` and can read an explicit bridge file exported by the MCPB probe | `userConfig` |
| `sa-cowork-persist-mcp` | `manifest.json` / MCPB | Persist probe for Cowork extension-format experiments | `user_config` |

The GitHub marketplace index only advertises the two `.claude-plugin` entries because that is the path Cowork currently ingests reliably from this repo.

## Config Isolation

The main outcome from this repo is:

- `.claude-plugin` `userConfig` values are injected into that plugin's own hooks, skills, and subprocesses
- MCPB `user_config` values are injected into that MCPB server's own `mcp_config.env`
- there is no automatic cross-plugin or cross-format bridge between those two config systems

So if you configure `probe_label` in `sa-cowork-persist-mcp`, the value does **not** magically appear in `sa-cowork-persist-probe` or `sa-cowork-bootstrap-probe`.

The only reliable bridge is an explicit shared storage path or another deliberate handoff.

## Explicit Bridge Experiment

`sa-cowork-persist-mcp` exposes a `bridge_report` tool that writes a config summary to:

```text
~/.cowork-probe/persist-probe/config-bridge.json
```

`sa-cowork-persist-probe` includes a helper script that reads that file and reports what the MCPB probe exported.

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
- the helper script can read the explicit MCPB bridge file if `bridge_report` has been run first

### MCPB Bridge

After configuring and running `sa-cowork-persist-mcp`, call:

- `persist_write`
- `persist_read`
- `bridge_report`

Then, from `sa-cowork-persist-probe`, run the helper script described in the skill to confirm that the bridge file is visible.

## Notes

- The bootstrap plugin is now fully self-contained; it no longer depends on `plugins/_shared/cli-probe`.
- The persist MCPB stores data under `~/.cowork-probe/persist-probe/`.
- The Claude-style persist probe stores its own data under `${CLAUDE_PLUGIN_DATA}/persist-probe/`.
- Those two locations are intentionally different so the repo can show the difference between isolated plugin state and an explicit shared bridge.
