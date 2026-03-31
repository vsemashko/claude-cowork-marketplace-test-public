---
name: sa-cowork-secret-reset
description: Remove test-owned secret targets and report any manual cleanup still needed.
---

# Cowork Secret Reset

Use this skill inside Claude Cowork when you want to clean up test-owned secret targets.

## Workflow

1. Run the bundled harness script:

```bash
${CLAUDE_PLUGIN_ROOT}/skills/sa-cowork-secret-reset/scripts/run.sh
```

2. Report which file targets or MCP test entries were removed.
3. If the script reports pending stash-setting cleanup, relay the manual cleanup hint without guessing how `stash settings` should be reset.
