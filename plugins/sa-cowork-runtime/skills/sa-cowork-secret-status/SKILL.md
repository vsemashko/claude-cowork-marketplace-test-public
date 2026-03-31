---
name: sa-cowork-secret-status
description: Show whether the persisted Cowork secret file exists and whether the runtime cache survived restarts.
---

# Cowork Secret Status

Use this skill inside Claude Cowork to inspect the simplest possible persistence test.

## Workflow

1. Run the bundled status script:

```bash
${CLAUDE_PLUGIN_ROOT}/skills/sa-cowork-secret-status/scripts/run.sh
```

2. Report whether the persisted secret file exists, where it lives under `${CLAUDE_PLUGIN_DATA}`, and whether the cached runtime binaries are present.
3. Never print the raw secret back to the user. Report the redacted preview and hash only.
