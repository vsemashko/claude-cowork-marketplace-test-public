---
name: sa-mise-cross-plugin
description: Experimentally discover the sa-mise runtime from PATH or shared Cowork runtime state for shebang hooks.
---

# sa-mise-cross-plugin

Use this plugin only after `sa-mise` is installed.

The cross-plugin consumer is intentionally experimental:

- it first tries whatever `mise` is already on `PATH`
- if no `mise` is present, it falls back to the shared Cowork install marker
  produced by `sa-mise`

The hook log records which strategy succeeded so the PATH behavior stays
observable in tests.
