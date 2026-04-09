---
name: sa-tmp-hello
description: Run the temporary hello binary from the sa-tmp-core plugin.
---

# Temporary Hello

Use this skill to verify that the `sa-tmp-core` plugin binary is available.

## Flow

1. Invoke the binary directly by name:

```bash
sa-tmp-hello
```

2. Print the output exactly as returned.

## Expected Output

The binary prints:

- `name=sa-tmp-hello`
- `binary_path=...`
- `storage_dir=...`
