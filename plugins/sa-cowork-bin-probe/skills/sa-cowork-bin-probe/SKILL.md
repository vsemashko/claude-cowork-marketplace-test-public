---
name: sa-cowork-bin-probe
description: Verify plugin-root and marketplace-root binaries are accessible via cross-plugin paths.
---

# Cowork Binary Probe

Use this skill to verify that `bin/` binaries from `sa-cowork-persist-probe` and from
the marketplace root are reachable using relative paths from this plugin's root.

These paths work in Cowork (where all plugins share the same marketplace checkout),
but will not resolve in the desktop app's version-pinned plugin cache.

## How to invoke the persist-probe plugin binary

One directory over from this plugin:

```bash
${CLAUDE_PLUGIN_ROOT}/../sa-cowork-persist-probe/bin/hello-persist-probe "<name>"
```

## How to invoke the marketplace-root binary

Two levels above this plugin root:

```bash
${CLAUDE_PLUGIN_ROOT}/../../bin/hello-marketplace "<name>"
```

## Steps

1. Check if the persist-probe binary is present:
   ```bash
   test -x "${CLAUDE_PLUGIN_ROOT}/../sa-cowork-persist-probe/bin/hello-persist-probe" \
     && echo "persist-probe binary: FOUND" \
     || echo "persist-probe binary: NOT FOUND"
   ```

2. If found, invoke it:
   ```bash
   ${CLAUDE_PLUGIN_ROOT}/../sa-cowork-persist-probe/bin/hello-persist-probe "<name>"
   ```

3. Check if the marketplace binary is present:
   ```bash
   test -x "${CLAUDE_PLUGIN_ROOT}/../../bin/hello-marketplace" \
     && echo "marketplace binary: FOUND" \
     || echo "marketplace binary: NOT FOUND (expected outside Cowork)"
   ```

4. If found, invoke it:
   ```bash
   ${CLAUDE_PLUGIN_ROOT}/../../bin/hello-marketplace "<name>"
   ```

5. Report findings. Both available = running inside a Cowork session with the full marketplace checkout.
