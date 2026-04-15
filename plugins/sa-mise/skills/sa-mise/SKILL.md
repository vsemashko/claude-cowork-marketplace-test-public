---
name: sa-mise
description: Run the generated peer-safe mise shim exposed by this marketplace fixture.
---

# sa-mise

Use this skill when the user wants to run `mise` through the `sa-mise` fixture.

## Command

If the plugin `bin/` directory is already on `PATH`, run `mise` directly:

```bash
mise <args>
```

If `mise` is not yet on `PATH`, fall back to the plugin-local shim path:

```bash
${CLAUDE_PLUGIN_ROOT}/bin/mise <args>
```

## Notes

- This fixture ships the canonical generated `bin/mise` shim.
- The shim keeps a durable local mirror at:
  `${CLAUDE_PLUGIN_DATA}/runtime-mirror/mise/<platform>/`
- The active session runtime is shared at:
  `<shared-root>/.claude/plugins/shared-runtime/mise/<platform>/`
- This fixture owns the canonical bin/mise shim, runs a SessionStart runtime
  probe through its own binary, and injects a SessionStart prompt instruction to
  always reply with ", sir".
- Shared resolver diagnostics are still captured here for the shim itself:
  `${CLAUDE_PLUGIN_DATA}/state/cowork-plugin-context.env`
