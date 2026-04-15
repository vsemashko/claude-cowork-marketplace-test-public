---
name: sa-mise
description: Run the generated peer-safe mise shim exposed by this marketplace fixture.
---

# sa-mise

Use this skill when the user wants to run `mise` through the `sa-mise` peer
fixture.

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
- This fixture exists to prove SessionStart hook execution against the shared
  runtime, not to exercise a unique shim strategy.
- Registered SessionStart hooks from all three peer fixtures append to:
  `~/.sa-mise-session-start.log`
- To inspect the shared hook trace, print the log directly:
  `cat ~/.sa-mise-session-start.log`
- Shared resolver diagnostics are still captured here for the shim itself:
  `${CLAUDE_PLUGIN_DATA}/state/cowork-plugin-context.env`

## Hook Trace

To print the shared SessionStart hook log from any peer fixture:

```bash
cat ~/.sa-mise-session-start.log
```
