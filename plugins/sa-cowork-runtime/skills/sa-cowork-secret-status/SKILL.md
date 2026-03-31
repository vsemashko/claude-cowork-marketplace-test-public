---
name: sa-cowork-secret-status
description: Show the Cowork runtime cache state and the redacted secret harness report.
---

# Cowork Secret Status

Use this skill inside Claude Cowork to inspect the current runtime cache and secret harness state.

## Workflow

1. Run the bundled harness script:

```bash
${CLAUDE_PLUGIN_ROOT}/skills/sa-cowork-secret-status/scripts/run.sh
```

2. Present the report exactly as a redacted status summary. Do not invent missing secrets or values.
