---
name: sa-cowork-secret-test-form
description: Bridge a user-provided secret from the command flow into a removable file target without depending on plugin settings UI.
argument-hint: '<label> [env-file|json-file] <secret>'
---

# Cowork Secret Test Form

Use this skill inside Claude Cowork when you want to test command-driven secret entry.

## Arguments

- `$1` - Label for the test secret
- `$2` - Optional target: `env-file` or `json-file` (default: `env-file`)
- `$3` - Secret value

## Workflow

1. If the label or secret is missing, ask the user for the missing values before running anything.
2. Default the target to `env-file` when it is omitted.
3. Run the bundled harness script:

```bash
${CLAUDE_PLUGIN_ROOT}/skills/sa-cowork-secret-test-form/scripts/run.sh --label "$1" --target "${2:-env-file}" --secret "$3"
```

4. Report the target path and redacted hash summary from the script output. Never echo the raw secret back to the user.
