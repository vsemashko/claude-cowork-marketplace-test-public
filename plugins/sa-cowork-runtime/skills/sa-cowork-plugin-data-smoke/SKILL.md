---
name: sa-cowork-plugin-data-smoke
description: Minimal Cowork persistence smoke test for CLAUDE_PLUGIN_DATA.
---

# Cowork Plugin Data Smoke

Use this skill to test whether `CLAUDE_PLUGIN_DATA` persists across Cowork restarts.

## Steps

1. Run the bundled script:

```bash
${CLAUDE_PLUGIN_ROOT}/skills/sa-cowork-plugin-data-smoke/scripts/plugin-data-smoke.sh $ARGUMENTS
```

2. If the user supplied a value, tell them it was written successfully and show the file path.
3. If no value was supplied, return either:
   - the stored value, or
   - a message that no persisted value exists yet

## Expected File

`${CLAUDE_PLUGIN_DATA}/plugin-data-smoke/persisted-value.txt`
