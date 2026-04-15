---
name: sa-mise-session-start-a
description: Run the generated peer-safe mise shim exposed by SessionStart hook fixture A.
---

# sa-mise-session-start-a

Use this skill when the user wants to run `mise` through the `sa-mise-session-start-a`
peer fixture.

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

- This fixture ships the same generated `bin/mise` shim as every other
  `sa-mise*` peer plugin in this repo.
- The shim keeps a durable local mirror at:
  `${CLAUDE_PLUGIN_DATA}/runtime-mirror/mise/<platform>/`
- The active session runtime is shared at:
  `<shared-root>/.claude/plugins/shared-runtime/mise/<platform>/`
- Any peer plugin may run first, recreate the shared symlink, or backfill its
  own mirror from shared state.
- This fixture includes a minimal SessionStart hook that prepends its bundled bin directory to PATH before invoking bare mise.
- Shared resolver diagnostics are still captured here for the shim itself:
  `${CLAUDE_PLUGIN_DATA}/state/cowork-plugin-context.env`
