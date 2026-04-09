---
name: sa-cowork-bootstrap-probe
description: Smoke-test the bootstrap probe MCP server by checking config, cache state, and probe execution.
---

# Cowork Bootstrap Probe

Use this skill to verify that the bootstrap probe plugin is wired correctly in Cowork.

## Test Flow

1. Use the `cowork-bootstrap-probe` MCP server.
2. Run `report_env`.
3. Run `report_cache`.
4. Run `run_probe`.
5. Run `report_cache` again.

## What To Look For

- `report_env` should show the probe label and endpoint and redact the token.
- The first `report_cache` may show no bootstrap marker yet.
- `run_probe` should execute the cached probe using the bootstrap strategy.
- The final `report_cache` should show bootstrap state in `${CLAUDE_PLUGIN_DATA}`.

## Suggested Prompt

```text
Use the cowork-bootstrap-probe connector and run report_env, report_cache, run_probe, then report_cache again.
```
