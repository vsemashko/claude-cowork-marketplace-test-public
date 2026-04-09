---
name: sa-tmp-list
description: List the configured plugin values, local MCP values, and companion extension values.
---

# Temporary List

Use this skill to inspect all three data sources in the simplified Cowork test setup.

## Flow

1. Run the helper script:

```bash
bash "${CLAUDE_PLUGIN_ROOT}/skills/sa-tmp-list/scripts/read-session-start.sh"
```

2. Use the `sa-local-mcp` connector and call `get_all`.
3. If `sa-extension` is installed, call `get_all` on it too.
4. Print the results grouped as:
   - plugin session-start file
   - local MCP
   - extension

## If The Extension Is Missing

If `sa-extension` is unavailable, say that clearly and point the user to the extension bundle install flow from the repo README.
