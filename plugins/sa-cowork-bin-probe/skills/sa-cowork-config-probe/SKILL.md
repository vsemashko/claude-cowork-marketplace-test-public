---
name: sa-cowork-config-probe
description: Verify userConfig values are accessible at runtime via env vars.
---

# Cowork Config Probe

Use this skill to verify that `userConfig` values from `sa-cowork-bin-probe` are
accessible at runtime. Sensitive values are checked for presence only (never echoed).

## Steps

1. Check non-sensitive config:
   ```bash
   echo "DD_SITE = ${CLAUDE_PLUGIN_OPTION_DD_SITE:-<not set>}"
   ```

2. Check sensitive configs (presence only, never echo the value):
   ```bash
   test -n "${CLAUDE_PLUGIN_OPTION_DD_API_KEY:-}" \
     && echo "DD_API_KEY: SET (length $(printf '%s' "${CLAUDE_PLUGIN_OPTION_DD_API_KEY}" | wc -c))" \
     || echo "DD_API_KEY: NOT SET"
   ```

   ```bash
   test -n "${CLAUDE_PLUGIN_OPTION_GITLAB_TOKEN:-}" \
     && echo "GITLAB_TOKEN: SET (length $(printf '%s' "${CLAUDE_PLUGIN_OPTION_GITLAB_TOKEN}" | wc -c))" \
     || echo "GITLAB_TOKEN: NOT SET"
   ```

3. If GitLab token is set, try `glab`:
   ```bash
   GITLAB_TOKEN="${CLAUDE_PLUGIN_OPTION_GITLAB_TOKEN:-}" glab auth status 2>&1 \
     || echo "glab not available or token invalid"
   ```

4. Report findings:
   - Which config values are set vs missing
   - Whether sensitive values are reachable from env but NOT from skill content substitution
