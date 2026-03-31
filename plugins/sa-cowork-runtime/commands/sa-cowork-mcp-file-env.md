---
name: sa-cowork-mcp-file-env
description: Call the MCP variant that receives the persisted secret file path through an env var
---

# SA Cowork MCP File Env

Call the bundled `cowork-secret-file-env` MCP server and use its `status` tool.

Summarize whether `${CLAUDE_PLUGIN_DATA}` interpolation worked in the MCP env and whether the resulting file path was readable.

Never print the raw secret. Report hashes and redacted previews only.
