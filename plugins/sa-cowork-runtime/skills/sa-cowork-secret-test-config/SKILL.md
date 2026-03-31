---
name: sa-cowork-secret-test-config
description: Bridge a user-provided secret into a config target we can inspect later in Cowork.
argument-hint: '<label> [claude-settings-mcp|stash-setting] <secret>'
---

# Cowork Secret Test Config

Use this skill inside Claude Cowork when you want to test writing a secret into a real config surface.

## Arguments

- `$1` - Label for the test secret
- `$2` - Optional target: `claude-settings-mcp` or `stash-setting` (default: `claude-settings-mcp`)
- `$3` - Secret value

## Workflow

1. If the label or secret is missing, ask the user for the missing values before running anything.
2. Default the target to `claude-settings-mcp` when it is omitted.
3. Run the bundled harness script:

```bash
${CLAUDE_PLUGIN_ROOT}/skills/sa-cowork-secret-test-config/scripts/run.sh --label "$1" --target "${2:-claude-settings-mcp}" --secret "$3"
```

4. Report the modified target and redacted hash summary from the script output. Never echo the raw secret back to the user.
