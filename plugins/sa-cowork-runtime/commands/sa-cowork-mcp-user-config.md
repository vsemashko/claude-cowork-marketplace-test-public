---
name: sa-cowork-mcp-user-config
description: Call the MCP variant that maps userConfig into env before launching the server
---

# SA Cowork MCP User Config

Call the bundled `cowork-secret-user-config` MCP server and use its `status` tool.

Summarize:

- whether `${user_config.smoke_label}` and `${user_config.smoke_token}` reached the server through mapped env vars
- whether inherited `CLAUDE_PLUGIN_OPTION_*` env vars were also present
- whether the persisted secret file exists

Never print the raw secret. Report hashes and redacted previews only.
