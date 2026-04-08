---
name: sa-cowork-bin-probe
description: Verify plugin-root and marketplace-root binaries are accessible via cross-plugin paths.
---

# Cowork Binary Probe

Use this skill to verify that `bin/` binaries from `sa-cowork-persist-probe` and from
the marketplace root are reachable. The plugin system may add `bin/` directories to
PATH, so try bare names first, then fall back to explicit paths.

## Steps

1. Try the persist-probe binary by bare name (should work if `bin/` is on PATH):
   ```bash
   hello-persist-probe "<name>"
   ```

2. If that fails, fall back to the explicit cross-plugin path (works in Cowork where
   plugins share the same marketplace checkout):
   ```bash
   ${CLAUDE_PLUGIN_ROOT}/../sa-cowork-persist-probe/bin/hello-persist-probe "<name>"
   ```

3. Try the marketplace-root binary by bare name:
   ```bash
   hello-marketplace "<name>"
   ```

4. If that fails, fall back to the explicit path (two levels above this plugin root,
   works in Cowork only):
   ```bash
   ${CLAUDE_PLUGIN_ROOT}/../../bin/hello-marketplace "<name>"
   ```

5. Report findings:
   - Which binaries were found by bare name (on PATH)
   - Which required explicit paths
   - Which were not found at all
