import { assertEquals, assertExists, assertStringIncludes } from '@std/assert'
import { ensureDir } from '@std/fs'
import { join } from '@std/path'

const REPO_ROOT = Deno.cwd()

Deno.test('generated sa-mise-user context7 MCP resolves sibling sa-mise and sets XDG_RUNTIME_DIR', async () => {
  const tempDir = await Deno.makeTempDir({ prefix: 'context7-mcp-' })

  try {
    const consumerRoot = join(tempDir, 'sa-mise-user')
    const siblingRoot = join(tempDir, 'sa-mise')
    const pluginDataDir = join(tempDir, 'plugin-data')
    const projectDir = join(tempDir, 'project')
    const captureFile = join(tempDir, 'capture.txt')

    await ensureDir(join(consumerRoot, '.claude-plugin'))
    await ensureDir(join(consumerRoot, 'scripts'))
    await ensureDir(join(siblingRoot, '.claude-plugin'))
    await ensureDir(join(siblingRoot, 'bin'))
    await ensureDir(projectDir)

    await Deno.copyFile(
      join(REPO_ROOT, 'plugins', 'sa-mise-user', 'scripts', 'resolve-env.sh'),
      join(consumerRoot, 'scripts', 'resolve-env.sh'),
    )
    await Deno.chmod(join(consumerRoot, 'scripts', 'resolve-env.sh'), 0o755)

    await Deno.writeTextFile(
      join(consumerRoot, '.claude-plugin', 'plugin.json'),
      JSON.stringify(
        {
          name: 'sa-mise-user',
          version: '1.0.0',
          description: 'Consumer test fixture',
        },
        null,
        2,
      ),
    )
    await Deno.writeTextFile(
      join(siblingRoot, '.claude-plugin', 'plugin.json'),
      JSON.stringify(
        {
          name: 'sa-mise',
          version: '1.0.0',
          description: 'Owner test fixture',
        },
        null,
        2,
      ),
    )
    await Deno.writeTextFile(
      join(siblingRoot, 'bin', 'mise'),
      `#!/bin/sh
set -eu
printf 'xdg=%s\n' "$XDG_RUNTIME_DIR" > "$CAPTURE_FILE"
printf 'args=%s\n' "$*" >> "$CAPTURE_FILE"
`,
    )
    await Deno.chmod(join(siblingRoot, 'bin', 'mise'), 0o755)

    const mcpConfig = JSON.parse(
      await Deno.readTextFile(
        join(REPO_ROOT, 'plugins', 'sa-mise-user', '.mcp.json'),
      ),
    ) as {
      mcpServers: {
        context7: {
          command: string
          args: string[]
        }
      }
    }

    const output = await new Deno.Command(
      mcpConfig.mcpServers.context7.command,
      {
        args: mcpConfig.mcpServers.context7.args,
        env: {
          ...Deno.env.toObject(),
          CAPTURE_FILE: captureFile,
          CLAUDE_PLUGIN_DATA: pluginDataDir,
          CLAUDE_PLUGIN_ROOT: consumerRoot,
          CLAUDE_PROJECT_DIR: projectDir,
        },
        stdout: 'piped',
        stderr: 'piped',
      },
    ).output()

    assertEquals(output.success, true)

    const capture = await Deno.readTextFile(captureFile)
    const expectedRuntimeDir = join(pluginDataDir, 'runtime', 'xdg')
    assertStringIncludes(capture, `xdg=${expectedRuntimeDir}`)
    assertStringIncludes(
      capture,
      'args=exec nodejs@22 -- npx -y @upstash/context7-mcp',
    )

    const runtimeDirInfo = await Deno.stat(expectedRuntimeDir)
    assertEquals(runtimeDirInfo.isDirectory, true)
    assertEquals((runtimeDirInfo.mode ?? 0) & 0o777, 0o700)

    const cachedOwnerPath = await Deno.readTextFile(
      join(pluginDataDir, 'state', 'sa-mise-plugin-root'),
    )
    assertEquals(cachedOwnerPath.trim(), siblingRoot)

    const resolutionLog = await Deno.readTextFile(
      join(projectDir, '.sa-mise-resolve-env.log'),
    )
    assertStringIncludes(resolutionLog, 'source=scan')
    assertStringIncludes(resolutionLog, `resolved_root=${siblingRoot}`)
    assertExists(output.stderr)
  } finally {
    await Deno.remove(tempDir, { recursive: true })
  }
})
