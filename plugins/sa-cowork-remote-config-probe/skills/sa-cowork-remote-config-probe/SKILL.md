---
name: sa-cowork-remote-config-probe
description: Inspect Rootly-style hosted MCP settings and show how userConfig reaches the connector, hook, and skill layer.
---

# Cowork Remote Config Probe

Use this skill to verify the Rootly-style remote MCP wiring in Cowork.

## Test Flow

1. Run:

```bash
bash "${CLAUDE_PLUGIN_ROOT}/scripts/print-remote-config.sh"
```

2. Summarize the resolved:
   - `endpoint`
   - `label`
   - `token_present`
   - `token_length`
   - `report_path`
   - `report_exists`

3. If `report_exists=no`, tell the user to reload plugins or start a fresh session so the `SessionStart` hook can run.

## What To Look For

- The connector is defined as a hosted HTTP MCP server in `.mcp.json`.
- The same `userConfig` values are available to the `SessionStart` hook via environment variables.
- The hook writes a JSON report into `${CLAUDE_PLUGIN_DATA}/remote-config-probe/session-start-report.json`.
- The skill prints the same resolved endpoint and label without leaking the token.

## Suggested Prompt

```text
Run bash "${CLAUDE_PLUGIN_ROOT}/scripts/print-remote-config.sh" and summarize the resolved endpoint, label, token presence, token length, and hook report path for the remote config probe.
```
