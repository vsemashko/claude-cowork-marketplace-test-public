---
name: sa-cowork-persist-probe
description: Write a value into CLAUDE_PLUGIN_DATA or read the stored value back
argument-hint: '[value]'
---

# Cowork Persist Probe

Use the **sa-cowork-persist-probe** skill.

## Behavior

- If the user provides a value, write it into the plugin data folder
- If the user provides no value, read the existing file and return its contents
- If no file exists yet, report that nothing has been persisted

## Run

```bash
CLAUDE_PLUGIN_DATA="${CLAUDE_PLUGIN_DATA}" \
  ${CLAUDE_PLUGIN_ROOT}/skills/sa-cowork-persist-probe/scripts/persist-probe.sh $ARGUMENTS
```
