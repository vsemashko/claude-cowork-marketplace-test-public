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
${CLAUDE_PLUGIN_ROOT}/bin/mise <args>
```

For a basic availability check:

```bash
${CLAUDE_PLUGIN_ROOT}/bin/mise --version
```

## Notes

- The shim requires `CLAUDE_PLUGIN_ROOT` and `CLAUDE_PLUGIN_DATA`.
- On first use it installs the latest official `mise` binary into:
  `${CLAUDE_PLUGIN_DATA}/sa-mise/linux-arm64/bin/mise`
- Later runs reuse the cached binary until that cache directory is removed.
