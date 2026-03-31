---
name: sa-cowork-secret-test-connector
description: Inspect known MCP config files and report whether the remote connector path is already available.
---

# Cowork Secret Test Connector

Use this skill inside Claude Cowork to inspect the remote connector path.

## Workflow

1. Run the bundled harness script:

```bash
${CLAUDE_PLUGIN_ROOT}/skills/sa-cowork-secret-test-connector/scripts/run.sh
```

2. Report the discovered remote MCP/custom connectors, or state that none were found and point the user to the recommended org-managed remote
   connector path.
