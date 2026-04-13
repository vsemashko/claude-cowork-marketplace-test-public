---
name: sa-mise
description: Run the plugin-local mise shim exposed by this marketplace plugin.
---

# sa-mise

Use this skill when the user asks whether `mise` is available or wants to run a
`mise` command through the marketplace plugin.

## Command

If the plugin `bin/` directory is already on `PATH`, run `mise` directly:

```bash
mise <args>
```

For a basic availability check:

```bash
mise --version
```

If `mise` is not on `PATH`, fall back to the plugin-local shim path:

```bash
${CLAUDE_PLUGIN_ROOT}/bin/mise <args>
```

## Notes

- The shim resolves plugin root from its own path.
- On first use it installs the latest official `mise` binary into:
  `${CLAUDE_PLUGIN_DATA}/${platform}/bin/mise`
- Plugin data is resolved in this order: live `CLAUDE_PLUGIN_DATA`, shared
  Cowork session state, then deterministic session-layout discovery.
- The SessionStart hook refreshes shared resolver diagnostics, but direct shim
  execution should work without manually passing `CLAUDE_PLUGIN_DATA`.
- Registered hook logs are written here:
  `${CLAUDE_PLUGIN_DATA}/logs/session-start.log`
- Check shared resolver diagnostics here:
  `${CLAUDE_PLUGIN_DATA}/state/cowork-plugin-context.env`
- If the `sa-cowork-config-mcp` MCPB is installed, the SessionStart hook also
  appends sanitized MCP-derived config fields to the same log.
- During MCP diagnosis, expect extra `mcp_diag_*` lines in the hook log showing
  which Claude config paths, extension files, and process hints were visible.
- Later runs reuse the cached binary until that cache directory is removed.
