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
  `${resolved_plugin_data}/sa-mise/linux-arm64/bin/mise`
- Plugin data is resolved in this order: `SA_MISE_PLUGIN_DATA`, live
  `CLAUDE_PLUGIN_DATA`, shared Cowork session state, then deterministic
  session-layout discovery.
- The SessionStart hook refreshes shared resolver diagnostics, but direct shim
  execution should work without manually passing `CLAUDE_PLUGIN_DATA`.
- Later runs reuse the cached binary until that cache directory is removed.
