---
name: sa-cowork-persist-probe
description: Minimal Cowork persistence probe for CLAUDE_PLUGIN_DATA.
---

# Cowork Persist Probe

Use this skill to test whether `CLAUDE_PLUGIN_DATA` persists across Cowork restarts.

## Steps

1. Run the bundled script:

```bash
CLAUDE_PLUGIN_DATA="${CLAUDE_PLUGIN_DATA}" \
  ${CLAUDE_PLUGIN_ROOT}/skills/sa-cowork-persist-probe/scripts/persist-probe.sh $ARGUMENTS
```

2. If the user supplied a value, tell them it was written successfully and show the file path.
3. If no value was supplied, return either:
   - the stored value, or
   - a message that no persisted value exists yet

## Configuration

This plugin uses `userConfig` to prompt for values at install time:

- **`probe_label`** (non-sensitive, default `QWE`): Prefix for auto-generated persisted values.
  The SessionStart hook uses this as the label before the 3 random digits.
  Available in skills as `${user_config.probe_label}` and in scripts as `$CLAUDE_PLUGIN_OPTION_PROBE_LABEL`.

- **`probe_secret`** (sensitive): A secret token stored in the system keychain.
  Available in scripts as `$CLAUDE_PLUGIN_OPTION_PROBE_SECRET` but NOT substituted into skill content.

## Expected File

`${CLAUDE_PLUGIN_DATA}/persist-probe/persisted-value.txt`

## Binaries

This plugin ships an executable at `bin/hello-persist-probe`.

**Plugin binary** — try bare name first (works if `bin/` is on PATH):

```bash
hello-persist-probe "<name>"
```

Fallback with explicit path (always available):

```bash
${CLAUDE_PLUGIN_ROOT}/bin/hello-persist-probe "<name>"
```

**Marketplace-root binary** — try bare name first:

```bash
hello-marketplace "<name>"
```

Fallback with explicit path (Cowork only — two levels above this plugin):

```bash
${CLAUDE_PLUGIN_ROOT}/../../bin/hello-marketplace "<name>"
```

Both print a greeting, the resolved path, and the name you passed.
