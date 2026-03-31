---
name: sa-cowork-secret-test-mcp
description: Call the bundled cowork-secret-probe MCP server and summarize whether plugin config values reached the MCP subprocess
---

# SA Cowork Secret Test MCP

Use the bundled `cowork-secret-probe` MCP server and call its `status` tool.

Summarize:

- whether mapped `userConfig` values were present in the MCP environment
- whether inherited `CLAUDE_PLUGIN_OPTION_*` values were present
- whether the Cowork runtime cache exists under `${CLAUDE_PLUGIN_DATA}/cowork-runtime`

Never repeat raw secrets. Report hashes and presence only.
