---
name: sa-cowork-mcp-plugin-option
description: Call the MCP variant that only inspects inherited CLAUDE_PLUGIN_OPTION_* env vars
---

# SA Cowork MCP Plugin Option

Call the bundled `cowork-secret-plugin-option` MCP server and use its `status` tool.

Summarize whether `CLAUDE_PLUGIN_OPTION_SMOKE_LABEL` and `CLAUDE_PLUGIN_OPTION_SMOKE_TOKEN` were present for the MCP subprocess.

Never print the raw secret. Report hashes and redacted previews only.
