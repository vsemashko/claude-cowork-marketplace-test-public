---
name: sa-mise-user-2
description: Run bare mise commands through the sibling sa-mise plugin resolved at hook execution time.
---

# sa-mise-user-2

Use this skill when the user wants to run `mise` through the `sa-mise-user-2`
fixture.

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
- This fixture does not ship bin/mise. During generation, each command hook is
  rewritten to source scripts/resolve-env.sh before running the authored bare
  mise command, and the resolver caches the discovered sa-mise root under
  CLAUDE_PLUGIN_DATA/state.
- Shared resolver diagnostics are still captured here for the shim itself:
  `${CLAUDE_PLUGIN_DATA}/state/cowork-plugin-context.env`
