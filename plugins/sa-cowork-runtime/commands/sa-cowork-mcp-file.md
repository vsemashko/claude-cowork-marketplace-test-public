---
name: sa-cowork-mcp-file
description: Call the MCP variant that reads the persisted secret file directly from CLAUDE_PLUGIN_DATA
---

# SA Cowork MCP File

Call the bundled `cowork-secret-file` MCP server and use its `status` tool.

Summarize whether the server could find and read `${CLAUDE_PLUGIN_DATA}/secret-smoke/persisted-secret.txt`.

Never print the raw secret. Report hashes and redacted previews only.
