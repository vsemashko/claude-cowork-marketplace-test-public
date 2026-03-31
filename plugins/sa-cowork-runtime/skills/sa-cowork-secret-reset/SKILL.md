---
name: sa-cowork-secret-reset
description: Delete the simple persisted secret file from plugin data.
---

# Cowork Secret Reset

Use this skill inside Claude Cowork when you want to remove the persisted test secret.

## Workflow

1. Run the bundled reset script:

```bash
${CLAUDE_PLUGIN_ROOT}/skills/sa-cowork-secret-reset/scripts/run.sh
```

2. Report whether the file was removed and where it lived.
