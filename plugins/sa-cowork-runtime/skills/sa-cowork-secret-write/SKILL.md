---
name: sa-cowork-secret-write
description: Write a user-provided secret into a plain file under CLAUDE_PLUGIN_DATA so persistence across Cowork restarts is easy to verify.
argument-hint: '<secret>'
---

# Cowork Secret Write

Use this skill inside Claude Cowork when you want the simplest possible persistence test.

## Arguments

- `$1` - Secret value to persist

## Workflow

1. If the secret is missing, ask the user for it before running anything.
2. Run the bundled write script:

```bash
${CLAUDE_PLUGIN_ROOT}/skills/sa-cowork-secret-write/scripts/run.sh "$1"
```

3. Report the file path, whether it exists, and the redacted preview and hash.
4. Never echo the raw secret back to the user.
