---
name: sa-mise
description: Run the plugin-local mise shim exposed by this marketplace plugin.
---

# sa-mise

Use this skill when the user asks whether `mise` is available or wants to run a
`mise` command through the marketplace plugin.

## Command

Run the plugin-local shim directly:

```bash
/absolute/path/to/bin/mise <args>
```

For a basic availability check:

```bash
/absolute/path/to/bin/mise --version
```

## Notes

- The shim resolves plugin root from its own path.
- On first use it installs the latest official `mise` binary into:
  `${CLAUDE_PLUGIN_DATA}/sa-mise/linux-arm64/bin/mise`
- If `CLAUDE_PLUGIN_DATA` is missing at runtime, the shim falls back to a
  SessionStart hook snapshot for this plugin root.
- Later runs reuse the cached binary until that cache directory is removed.
