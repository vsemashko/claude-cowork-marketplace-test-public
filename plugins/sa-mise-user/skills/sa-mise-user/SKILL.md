---
name: sa-mise-user
description: Run bare mise commands through the sibling sa-mise plugin resolved at hook execution time.
---

# sa-mise-user

Use this skill when the user wants to run `mise` through the `sa-mise-user`
fixture.

## Command

The authored hook commands assume `mise` is already on `PATH`:

```bash
mise <args>
```

During generation, the emitted hooks first source:

```bash
${CLAUDE_PLUGIN_ROOT}/scripts/resolve-env.sh
```

and then run the bare `mise` command in the enriched environment with `&&`
chaining.

## Notes

- This fixture does not ship `bin/mise`.
- Its authored hooks call bare `mise`, and generation rewrites them to source
  `scripts/resolve-env.sh` first.
- `scripts/resolve-env.sh` resolves the sibling `sa-mise` plugin, exports
  `SA_MISE_PLUGIN_ROOT`, prepends `<resolved-sa-mise>/bin` to `PATH`, and caches
  the discovered owner path under
  `${CLAUDE_PLUGIN_DATA}/state/sa-mise-plugin-root`.
- Resolution attempts append compact cache hit/scan logs to
  `${CLAUDE_PROJECT_DIR}/.sa-mise-resolve-env.log`.
- This fixture does not ship bin/mise. During generation, each command hook is
  rewritten to source scripts/resolve-env.sh before running the authored bare
  mise command, and the resolver caches the discovered sa-mise root under
  CLAUDE_PLUGIN_DATA/state.
- Shared resolver diagnostics are still captured here for the shim itself:
  `${CLAUDE_PLUGIN_DATA}/state/cowork-plugin-context.env`
