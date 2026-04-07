---
name: sa-cowork-persist-probe
description: Minimal Cowork persistence probe for CLAUDE_PLUGIN_DATA.
---

# Cowork Persist Probe

Use this skill to test whether `CLAUDE_PLUGIN_DATA` persists across Cowork restarts.

## Steps

1. Run the bundled script:

```bash
CLAUDE_PLUGIN_DATA="${CLAUDE_PLUGIN_DATA}" \
  ${CLAUDE_PLUGIN_ROOT}/skills/sa-cowork-persist-probe/scripts/persist-probe.sh $ARGUMENTS
```

2. If the user supplied a value, tell them it was written successfully and show the file path.
3. If no value was supplied, return either:
   - the stored value, or
   - a message that no persisted value exists yet

## Expected File

`${CLAUDE_PLUGIN_DATA}/persist-probe/persisted-value.txt`
