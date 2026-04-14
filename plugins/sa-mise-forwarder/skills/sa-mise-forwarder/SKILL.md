---
name: sa-mise-forwarder
description: Run shebang hooks through the local forwarder shim that delegates to the warmed sa-mise runtime.
---

# sa-mise-forwarder

Use this plugin after `sa-mise` has already installed and warmed the shared
runtime.

The forwarder plugin provides a deterministic consumer path:

- its hook launcher prepends the plugin-local `bin/` directory to `PATH`
- `bin/mise` forwards into the warmed `sa-mise` runtime under shared Cowork
  plugin data

If `sa-mise` has not been warmed yet, the forwarder fails clearly and asks you
to run `sa-mise` first.
