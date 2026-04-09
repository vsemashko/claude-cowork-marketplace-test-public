---
name: sa-tmp-set
description: Set a value on the companion sa-extension connector.
---

# Temporary Set

Use this skill to set a value on `sa-extension`.

## Flow

1. If the user provided a value, use it.
2. Otherwise read the plugin session-start file and use `tmp_public_value` as the default value.
3. Use the `sa-extension` connector and call `set_value`.
4. Then call `get_value`.
5. Print the final extension value.

## If The Extension Is Missing

If `sa-extension` is unavailable, say that clearly and point the user to the extension bundle install flow from the repo README.
