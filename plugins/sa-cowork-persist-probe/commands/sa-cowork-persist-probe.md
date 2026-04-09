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
- If the user wants to inspect the companion extension config, prefer this MCP-native flow:
  - call `sa-cowork-persist-extension` `config_report`
  - optionally call `sa-cowork-persist-extension` `bridge_report`
  - call this plugin's `read_extension_bridge`
- Keep the bridge helper as a fallback debugger:

```bash
bash "${CLAUDE_PLUGIN_ROOT}/skills/sa-cowork-persist-probe/scripts/read-extension-bridge.sh"
```

## Run

```bash
CLAUDE_PLUGIN_DATA="${CLAUDE_PLUGIN_DATA}" \
  ${CLAUDE_PLUGIN_ROOT}/skills/sa-cowork-persist-probe/scripts/persist-probe.sh $ARGUMENTS
```
