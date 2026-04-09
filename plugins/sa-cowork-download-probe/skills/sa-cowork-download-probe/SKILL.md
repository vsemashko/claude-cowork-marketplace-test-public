---
name: sa-cowork-download-probe
description: Smoke-test the download probe MCP server by checking config, cache state, and first-run reuse behavior.
---

# Cowork Download Probe

Use this skill to verify that the download probe plugin is wired correctly in Cowork.

## Test Flow

1. Use the `cowork-download-probe` MCP server.
2. Run `report_env`.
3. Run `report_cache`.
4. Run `run_probe`.
5. Run `run_probe` a second time.
6. Run `report_cache`.

## What To Look For

- `report_env` should show the probe label and endpoint and redact the token.
- The first `run_probe` should download and cache the probe.
- The second `run_probe` should reuse the cached probe instead of downloading again.
- The final `report_cache` should show the cached marker under `${CLAUDE_PLUGIN_DATA}`.

## Suggested Prompt

```text
Use the cowork-download-probe connector and run report_env, report_cache, run_probe twice, then report_cache again.
```
