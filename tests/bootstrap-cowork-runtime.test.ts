import { assertEquals, assertStringIncludes } from '@std/assert'
import { exists } from '@std/fs'
import { dirname, join } from '@std/path'

const REPO_ROOT = Deno.cwd()
const SOURCE_PLUGIN_ROOT = join(REPO_ROOT, 'plugins', 'sa-mise')
const INSTALL_SCRIPT_URL = 'https://mise.jdx.dev/install.sh'

async function copyFileWithMode(src: string, dest: string): Promise<void> {
  await Deno.mkdir(dirname(dest), { recursive: true })
  await Deno.copyFile(src, dest)
  const stat = await Deno.stat(src)
  await Deno.chmod(dest, stat.mode ?? 0o755)
}

async function writeExecutable(path: string, content: string): Promise<void> {
  await Deno.mkdir(dirname(path), { recursive: true })
  await Deno.writeTextFile(path, content)
  await Deno.chmod(path, 0o755)
}

async function createPluginFixture(
  baseDir: string,
  layout: 'guest' | 'session',
): Promise<{ pluginRoot: string }> {
  const pluginRoot = layout === 'guest'
    ? join(
      baseDir,
      'cowork_plugins',
      'cache',
      'sa-mise-marketplace',
      'sa-mise',
      '1.0.0',
    )
    : join(
      baseDir,
      'sessions',
      'determined-kind-cerf',
      'mnt',
      '.remote-plugins',
      'plugin_01K7jRZmCexuZubh6YKnKw2E',
    )

  const filesToCopy = [
    '.claude-plugin/plugin.json',
    'bin/mise',
    'hooks/hooks.json',
    'hooks/session-start.sh',
    'scripts/cowork-plugin-context.sh',
    'scripts/query-config-mcp.ts',
    'scripts/session-start-sample.ts',
    'scripts/runtime-shim.sh',
    'skills/sa-mise/SKILL.md',
  ]

  for (const relativePath of filesToCopy) {
    await copyFileWithMode(
      join(SOURCE_PLUGIN_ROOT, relativePath),
      join(pluginRoot, relativePath),
    )
  }

  return { pluginRoot }
}

async function createMockTooling(
  baseDir: string,
): Promise<{ downloadLogPath: string; mockBinDir: string }> {
  const mockBinDir = join(baseDir, 'mock-bin')
  const downloadLogPath = join(baseDir, 'download.log')

  await Deno.mkdir(mockBinDir, { recursive: true })

  await writeExecutable(
    join(mockBinDir, 'curl'),
    `#!/bin/sh
set -eu
output=''
url=''

while [ $# -gt 0 ]; do
  case "$1" in
    -o)
      shift
      output="$1"
      ;;
    http://*|https://*)
      url="$1"
      ;;
  esac
  shift
done

[ -n "$output" ] || exit 1
[ -n "$url" ] || exit 1

if [ -n "\${SA_TEST_DOWNLOAD_LOG:-}" ]; then
  printf '%s\\n' "$url" >> "$SA_TEST_DOWNLOAD_LOG"
fi

if [ "$url" = "${INSTALL_SCRIPT_URL}" ]; then
  cat <<'EOF' > "$output"
#!/bin/sh
set -eu
[ -n "\${MISE_INSTALL_PATH:-}" ] || exit 1
mkdir -p "$(dirname "$MISE_INSTALL_PATH")"
cat <<'INNER' > "$MISE_INSTALL_PATH"
#!/bin/sh
set -eu

if [ "\${1:-}" = "--version" ]; then
  echo "mise latest test"
  exit 0
fi

if [ "\${1:-}" = "exec" ] && [ "\${2:-}" = "deno@latest" ] &&
  [ "\${3:-}" = "--" ] && [ "\${4:-}" = "deno" ] &&
  [ "\${5:-}" = "run" ]; then
  shift 5
  exec "\${DENO_REAL_BIN:?}" run "$@"
fi

printf 'unexpected mise args:' >&2
for arg in "$@"; do
  printf ' %s' "$arg" >&2
done
printf '\\n' >&2
exit 1
INNER
chmod +x "$MISE_INSTALL_PATH"
EOF
  exit 0
fi

printf 'unexpected url %s\\n' "$url" >&2
exit 1
`,
  )

  return { downloadLogPath, mockBinDir }
}

async function createMockConfigMcpServer(baseDir: string): Promise<string> {
  const serverPath = join(baseDir, 'mock-config-mcp.ts')
  await Deno.writeTextFile(
    serverPath,
    `#!/usr/bin/env -S deno run -A
const encoder = new TextEncoder()
const decoder = new TextDecoder()
let buffer = new Uint8Array()

function frame(message) {
  const body = encoder.encode(JSON.stringify(message))
  const header = encoder.encode(\`Content-Length: \${body.length}\\r\\n\\r\\n\`)
  const framed = new Uint8Array(header.length + body.length)
  framed.set(header, 0)
  framed.set(body, header.length)
  return framed
}

function findDelimiter(haystack, needle) {
  outer:
  for (let i = 0; i <= haystack.length - needle.length; i++) {
    for (let j = 0; j < needle.length; j++) {
      if (haystack[i + j] !== needle[j]) continue outer
    }
    return i
  }
  return -1
}

function append(chunk) {
  const merged = new Uint8Array(buffer.length + chunk.length)
  merged.set(buffer, 0)
  merged.set(chunk, buffer.length)
  buffer = merged
}

function nextMessage() {
  const delimiter = encoder.encode('\\r\\n\\r\\n')
  const headerEnd = findDelimiter(buffer, delimiter)
  if (headerEnd === -1) return null
  const headerText = decoder.decode(buffer.slice(0, headerEnd))
  const match = headerText.match(/Content-Length:\\s*(\\d+)/i)
  if (!match) throw new Error('missing content length')
  const contentLength = Number(match[1])
  const bodyStart = headerEnd + delimiter.length
  const bodyEnd = bodyStart + contentLength
  if (buffer.length < bodyEnd) return null
  const bodyText = decoder.decode(buffer.slice(bodyStart, bodyEnd))
  buffer = buffer.slice(bodyEnd)
  return JSON.parse(bodyText)
}

function configText() {
  const ddApiKey = Deno.env.get('DD_API_KEY') ?? ''
  const gitlabToken = Deno.env.get('GITLAB_TOKEN') ?? ''
  const ddSite = Deno.env.get('DD_SITE') ?? ''
  return [
    \`dd_api_key_present=\${ddApiKey ? 'true' : 'false'}\`,
    \`dd_api_key_length=\${ddApiKey.length}\`,
    \`dd_site=\${ddSite}\`,
    \`gitlab_token_present=\${gitlabToken ? 'true' : 'false'}\`,
    \`gitlab_token_length=\${gitlabToken.length}\`,
  ].join('\\n')
}

for await (const chunk of Deno.stdin.readable) {
  append(chunk)
  while (true) {
    const message = nextMessage()
    if (!message) break
    if (message.method === 'initialize') {
      await Deno.stdout.write(
        frame({
          jsonrpc: '2.0',
          id: message.id,
          result: {
            protocolVersion: '2024-11-05',
            capabilities: { tools: {} },
            serverInfo: { name: 'sa-cowork-config-mcp', version: '1.0.0' },
          },
        }),
      )
      continue
    }
    if (message.method === 'tools/call') {
      await Deno.stdout.write(
        frame({
          jsonrpc: '2.0',
          id: message.id,
          result: {
            content: [{ type: 'text', text: configText() }],
          },
        }),
      )
    }
  }
}
`,
  )
  await Deno.chmod(serverPath, 0o755)
  return serverPath
}

async function writeClaudeMcpConfig(
  homeDir: string,
  serverConfig: Record<string, unknown>,
): Promise<void> {
  await Deno.mkdir(homeDir, { recursive: true })
  await Deno.writeTextFile(
    join(homeDir, '.claude.json'),
    JSON.stringify({
      mcpServers: {
        'sa-cowork-config-mcp': serverConfig,
      },
    }),
  )
}

function createEnv(
  baseDir: string,
  pluginRoot: string,
  downloadLogPath: string,
  mockBinDir: string,
): Record<string, string> {
  return {
    CLAUDE_PLUGIN_DATA: expectedDerivedPluginData(pluginRoot),
    DENO_REAL_BIN: Deno.execPath(),
    HOME: join(baseDir, 'home'),
    PATH: `${mockBinDir}:${Deno.env.get('PATH') ?? ''}`,
    SA_MISE_FORCE_PLATFORM: 'linux-arm64',
    SA_TEST_DOWNLOAD_LOG: downloadLogPath,
    TMPDIR: join(baseDir, 'tmp'),
  }
}

function platformRoot(
  pluginDataRoot: string,
  platform = 'linux-arm64',
): string {
  return join(pluginDataRoot, platform)
}

function expectedDerivedPluginData(pluginRoot: string): string {
  const remotePluginsMarker = '/.remote-plugins/'
  const coworkCacheMarker = '/cowork_plugins/'

  if (pluginRoot.includes(remotePluginsMarker)) {
    return join(
      pluginRoot.slice(0, pluginRoot.indexOf(remotePluginsMarker)),
      '.claude',
      'plugins',
      'data',
    )
  }

  if (pluginRoot.includes(coworkCacheMarker)) {
    return join(
      pluginRoot.slice(0, pluginRoot.indexOf(coworkCacheMarker)),
      '.claude',
      'plugins',
      'data',
    )
  }

  throw new Error(`Unsupported plugin layout: ${pluginRoot}`)
}

function expectedStateFile(pluginRoot: string): string {
  return join(
    expectedDerivedPluginData(pluginRoot),
    'state',
    'cowork-plugin-context.env',
  )
}

async function runCommand(
  command: string,
  args: string[],
  env: Record<string, string>,
) {
  return await new Deno.Command(command, {
    args,
    env,
    stderr: 'piped',
    stdout: 'piped',
  }).output()
}

Deno.test('sa-mise prefers live CLAUDE_PLUGIN_DATA and records shared resolver state', async () => {
  const baseDir = await Deno.makeTempDir()

  try {
    const { pluginRoot } = await createPluginFixture(baseDir, 'session')
    const { downloadLogPath, mockBinDir } = await createMockTooling(baseDir)
    const env = createEnv(baseDir, pluginRoot, downloadLogPath, mockBinDir)
    const stateFile = expectedStateFile(pluginRoot)

    const result = await runCommand(join(pluginRoot, 'bin', 'mise'), [
      '--version',
    ], env)
    const stdout = new TextDecoder().decode(result.stdout)

    assertEquals(result.success, true)
    assertStringIncludes(stdout, 'mise latest test')
    assertEquals(
      await exists(
        join(platformRoot(env.CLAUDE_PLUGIN_DATA), 'bin', 'mise'),
      ),
      true,
    )
    assertEquals(await exists(stateFile), true)
    const stateContents = await Deno.readTextFile(stateFile)
    assertStringIncludes(stateContents, 'COWORK_PLUGIN_DATA_SOURCE=live-env')
    assertEquals(stateContents.includes('COWORK_PLUGIN_NAME='), false)
    assertEquals(stateContents.includes('COWORK_PLUGIN_ATTEMPTS='), false)

    const installMarker = await Deno.readTextFile(
      join(platformRoot(env.CLAUDE_PLUGIN_DATA), 'install-status.txt'),
    )
    assertStringIncludes(installMarker, 'installed_at=')
    assertStringIncludes(installMarker, 'mise_path=')
    assertStringIncludes(installMarker, 'installer=')
    assertStringIncludes(installMarker, 'plugin_data_source=live-env')
    assertEquals(installMarker.includes('cache_root='), false)
    assertEquals(installMarker.includes('plugin_state_file='), false)

    const downloadLog = await Deno.readTextFile(downloadLogPath)
    assertEquals(downloadLog.trim().split('\n').length, 1)
    assertStringIncludes(downloadLog, INSTALL_SCRIPT_URL)
  } finally {
    await Deno.remove(baseDir, { recursive: true })
  }
})

Deno.test('sa-mise resolves plugin data from session layout without explicit env', async () => {
  const baseDir = await Deno.makeTempDir()

  try {
    const { pluginRoot } = await createPluginFixture(baseDir, 'session')
    const { downloadLogPath, mockBinDir } = await createMockTooling(baseDir)
    const env = createEnv(baseDir, pluginRoot, downloadLogPath, mockBinDir)
    delete env.CLAUDE_PLUGIN_DATA
    const derivedPluginData = expectedDerivedPluginData(pluginRoot)

    const result = await runCommand(join(pluginRoot, 'bin', 'mise'), [
      '--version',
    ], env)
    const stdout = new TextDecoder().decode(result.stdout)

    assertEquals(result.success, true)
    assertStringIncludes(stdout, 'mise latest test')
    assertEquals(
      await exists(
        join(platformRoot(derivedPluginData), 'bin', 'mise'),
      ),
      true,
    )
  } finally {
    await Deno.remove(baseDir, { recursive: true })
  }
})

Deno.test('sa-mise works from a guest-shell style plugin path without explicit env too', async () => {
  const baseDir = await Deno.makeTempDir()

  try {
    const { pluginRoot } = await createPluginFixture(baseDir, 'guest')
    const { downloadLogPath, mockBinDir } = await createMockTooling(baseDir)
    const env = createEnv(baseDir, pluginRoot, downloadLogPath, mockBinDir)
    delete env.CLAUDE_PLUGIN_DATA

    const result = await runCommand(join(pluginRoot, 'bin', 'mise'), [
      '--version',
    ], env)
    const stdout = new TextDecoder().decode(result.stdout)

    assertEquals(result.success, true)
    assertStringIncludes(stdout, 'mise latest test')
    assertEquals(
      await exists(
        join(
          platformRoot(expectedDerivedPluginData(pluginRoot)),
          'bin',
          'mise',
        ),
      ),
      true,
    )
  } finally {
    await Deno.remove(baseDir, { recursive: true })
  }
})

Deno.test('sa-mise reuses the cached binary on warm start', async () => {
  const baseDir = await Deno.makeTempDir()

  try {
    const { pluginRoot } = await createPluginFixture(baseDir, 'session')
    const { downloadLogPath, mockBinDir } = await createMockTooling(baseDir)
    const env = createEnv(baseDir, pluginRoot, downloadLogPath, mockBinDir)

    const first = await runCommand(join(pluginRoot, 'bin', 'mise'), [
      '--version',
    ], env)
    const second = await runCommand(join(pluginRoot, 'bin', 'mise'), [
      '--version',
    ], env)

    assertEquals(first.success, true)
    assertEquals(second.success, true)

    const downloadLog = await Deno.readTextFile(downloadLogPath)
    assertEquals(downloadLog.trim().split('\n').length, 1)
  } finally {
    await Deno.remove(baseDir, { recursive: true })
  }
})

Deno.test('SessionStart hook records shared resolver diagnostics and runs the shebang sample', async () => {
  const baseDir = await Deno.makeTempDir()

  try {
    const { pluginRoot } = await createPluginFixture(baseDir, 'session')
    const { downloadLogPath, mockBinDir } = await createMockTooling(baseDir)
    const env = createEnv(baseDir, pluginRoot, downloadLogPath, mockBinDir)
    const stateFile = expectedStateFile(pluginRoot)

    const hookResult = await runCommand(
      join(pluginRoot, 'hooks', 'session-start.sh'),
      [],
      env,
    )
    const logPath = join(
      env.CLAUDE_PLUGIN_DATA,
      'logs',
      'session-start.log',
    )
    const logContents = await Deno.readTextFile(logPath)

    assertEquals(hookResult.success, true)
    assertStringIncludes(logContents, 'timestamp=')
    assertStringIncludes(logContents, 'plugin_data_source=live-env')
    assertStringIncludes(logContents, 'sample_name=sa-mise-session-start')
    assertStringIncludes(logContents, 'mise_version=mise latest test')
    assertStringIncludes(logContents, 'deno_version=')
    assertStringIncludes(logContents, 'hook_status=success')
    assertStringIncludes(logContents, 'mcp_config_source=direct-mcp')
    assertStringIncludes(logContents, 'mcp_status=missing')
    assertEquals(await exists(stateFile), true)
  } finally {
    await Deno.remove(baseDir, { recursive: true })
  }
})

Deno.test('query-config-mcp reads the configured Claude MCP server over stdio', async () => {
  const baseDir = await Deno.makeTempDir()

  try {
    const { pluginRoot } = await createPluginFixture(baseDir, 'session')
    const { downloadLogPath, mockBinDir } = await createMockTooling(baseDir)
    const env = createEnv(baseDir, pluginRoot, downloadLogPath, mockBinDir)
    const serverPath = await createMockConfigMcpServer(baseDir)

    await writeClaudeMcpConfig(env.HOME, {
      command: Deno.execPath(),
      args: ['run', '-A', serverPath],
      env: {
        DD_API_KEY: 'supersecretkey',
        DD_SITE: 'datadoghq.eu',
        GITLAB_TOKEN: 'glpat-test-token',
      },
    })

    const result = await runCommand(join(pluginRoot, 'bin', 'mise'), [
      'exec',
      'deno@latest',
      '--',
      'deno',
      'run',
      '-A',
      join(pluginRoot, 'scripts', 'query-config-mcp.ts'),
    ], env)
    const stdout = new TextDecoder().decode(result.stdout)

    assertEquals(result.success, true)
    assertStringIncludes(stdout, 'mcp_config_source=direct-mcp')
    assertStringIncludes(stdout, 'mcp_status=success')
    assertStringIncludes(stdout, 'mcp_dd_api_key_present=true')
    assertStringIncludes(stdout, 'mcp_dd_api_key_length=14')
    assertStringIncludes(stdout, 'mcp_dd_site=datadoghq.eu')
    assertStringIncludes(stdout, 'mcp_gitlab_token_present=true')
    assertStringIncludes(stdout, 'mcp_gitlab_token_length=16')
  } finally {
    await Deno.remove(baseDir, { recursive: true })
  }
})

Deno.test('query-config-mcp reports an error when the configured MCP server cannot start', async () => {
  const baseDir = await Deno.makeTempDir()

  try {
    const { pluginRoot } = await createPluginFixture(baseDir, 'session')
    const { downloadLogPath, mockBinDir } = await createMockTooling(baseDir)
    const env = createEnv(baseDir, pluginRoot, downloadLogPath, mockBinDir)

    await writeClaudeMcpConfig(env.HOME, {
      command: join(baseDir, 'missing-server'),
      args: [],
      env: {},
    })

    const result = await runCommand(join(pluginRoot, 'bin', 'mise'), [
      'exec',
      'deno@latest',
      '--',
      'deno',
      'run',
      '-A',
      join(pluginRoot, 'scripts', 'query-config-mcp.ts'),
    ], env)
    const stdout = new TextDecoder().decode(result.stdout)

    assertEquals(result.success, true)
    assertStringIncludes(stdout, 'mcp_config_source=direct-mcp')
    assertStringIncludes(stdout, 'mcp_status=error')
    assertStringIncludes(stdout, 'mcp_error=')
  } finally {
    await Deno.remove(baseDir, { recursive: true })
  }
})

Deno.test('SessionStart hook appends sanitized MCP-derived config fields when the config MCP is installed', async () => {
  const baseDir = await Deno.makeTempDir()

  try {
    const { pluginRoot } = await createPluginFixture(baseDir, 'session')
    const { downloadLogPath, mockBinDir } = await createMockTooling(baseDir)
    const env = createEnv(baseDir, pluginRoot, downloadLogPath, mockBinDir)
    const serverPath = await createMockConfigMcpServer(baseDir)

    await writeClaudeMcpConfig(env.HOME, {
      command: Deno.execPath(),
      args: ['run', '-A', serverPath],
      env: {
        DD_API_KEY: 'supersecretkey',
        DD_SITE: 'datadoghq.eu',
        GITLAB_TOKEN: 'glpat-test-token',
      },
    })

    const hookResult = await runCommand(
      join(pluginRoot, 'hooks', 'session-start.sh'),
      [],
      env,
    )
    const logPath = join(env.CLAUDE_PLUGIN_DATA, 'logs', 'session-start.log')
    const logContents = await Deno.readTextFile(logPath)

    assertEquals(hookResult.success, true)
    assertStringIncludes(logContents, 'mcp_config_source=direct-mcp')
    assertStringIncludes(logContents, 'mcp_status=success')
    assertStringIncludes(logContents, 'mcp_dd_api_key_present=true')
    assertStringIncludes(logContents, 'mcp_dd_api_key_length=14')
    assertStringIncludes(logContents, 'mcp_dd_site=datadoghq.eu')
    assertStringIncludes(logContents, 'mcp_gitlab_token_present=true')
    assertStringIncludes(logContents, 'mcp_gitlab_token_length=16')
    assertEquals(logContents.includes('supersecretkey'), false)
    assertEquals(logContents.includes('glpat-test-token'), false)
  } finally {
    await Deno.remove(baseDir, { recursive: true })
  }
})

Deno.test('sa-mise falls back to shared session state before layout discovery', async () => {
  const baseDir = await Deno.makeTempDir()

  try {
    const { pluginRoot } = await createPluginFixture(baseDir, 'session')
    const { downloadLogPath, mockBinDir } = await createMockTooling(baseDir)
    const env = createEnv(baseDir, pluginRoot, downloadLogPath, mockBinDir)
    const stateFile = expectedStateFile(pluginRoot)

    const warmupResult = await runCommand(join(pluginRoot, 'bin', 'mise'), [
      '--version',
    ], env)
    assertEquals(warmupResult.success, true)

    const fallbackEnv = {
      DENO_REAL_BIN: env.DENO_REAL_BIN,
      HOME: env.HOME,
      PATH: env.PATH,
      SA_MISE_FORCE_PLATFORM: env.SA_MISE_FORCE_PLATFORM,
      SA_TEST_DOWNLOAD_LOG: env.SA_TEST_DOWNLOAD_LOG,
      TMPDIR: env.TMPDIR,
    }

    const result = await runCommand(join(pluginRoot, 'bin', 'mise'), [
      '--version',
    ], fallbackEnv)
    const stdout = new TextDecoder().decode(result.stdout)

    assertEquals(result.success, true)
    assertStringIncludes(stdout, 'mise latest test')
    assertEquals(
      await exists(
        join(platformRoot(env.CLAUDE_PLUGIN_DATA), 'bin', 'mise'),
      ),
      true,
    )
    assertStringIncludes(
      await Deno.readTextFile(stateFile),
      'COWORK_PLUGIN_DATA_SOURCE=session-state',
    )
  } finally {
    await Deno.remove(baseDir, { recursive: true })
  }
})

Deno.test('sa-mise fails clearly when plugin data cannot be resolved from any source', async () => {
  const baseDir = await Deno.makeTempDir()

  try {
    const { pluginRoot } = await createPluginFixture(baseDir, 'guest')
    const unknownPluginRoot = join(baseDir, 'plain-layout', 'plugin', 'sa-mise')
    const { downloadLogPath, mockBinDir } = await createMockTooling(baseDir)
    await Deno.mkdir(dirname(unknownPluginRoot), { recursive: true })
    await Deno.rename(pluginRoot, unknownPluginRoot)

    const result = await runCommand(join(unknownPluginRoot, 'bin', 'mise'), [
      '--version',
    ], {
      DENO_REAL_BIN: Deno.execPath(),
      HOME: join(baseDir, 'home'),
      PATH: `${mockBinDir}:${Deno.env.get('PATH') ?? ''}`,
      SA_MISE_FORCE_PLATFORM: 'linux-arm64',
      SA_TEST_DOWNLOAD_LOG: downloadLogPath,
      TMPDIR: join(baseDir, 'tmp'),
    })
    const stderr = new TextDecoder().decode(result.stderr)

    assertEquals(result.success, false)
    assertStringIncludes(stderr, 'Unable to resolve Cowork plugin data')
    assertStringIncludes(stderr, 'layout-discovery')
  } finally {
    await Deno.remove(baseDir, { recursive: true })
  }
})

Deno.test('sa-mise can still be resolved transparently from PATH', async () => {
  const baseDir = await Deno.makeTempDir()

  try {
    const { pluginRoot } = await createPluginFixture(baseDir, 'session')
    const { downloadLogPath, mockBinDir } = await createMockTooling(baseDir)
    const env = createEnv(baseDir, pluginRoot, downloadLogPath, mockBinDir)
    env.PATH = `${join(pluginRoot, 'bin')}:${env.PATH}`

    const result = await runCommand('mise', ['--version'], env)
    const stdout = new TextDecoder().decode(result.stdout)

    assertEquals(result.success, true)
    assertStringIncludes(stdout, 'mise latest test')
  } finally {
    await Deno.remove(baseDir, { recursive: true })
  }
})

Deno.test('sa-mise supports the installer platform keys we normalize to', async () => {
  const supportedPlatforms = [
    'linux-arm64',
    'linux-arm64-musl',
    'linux-x64',
    'linux-x64-musl',
    'linux-armv7',
    'linux-armv7-musl',
    'macos-arm64',
    'macos-x64',
  ]

  for (const platform of supportedPlatforms) {
    const baseDir = await Deno.makeTempDir()

    try {
      const { pluginRoot } = await createPluginFixture(baseDir, 'session')
      const { downloadLogPath, mockBinDir } = await createMockTooling(baseDir)
      const env = createEnv(baseDir, pluginRoot, downloadLogPath, mockBinDir)
      env.SA_MISE_FORCE_PLATFORM = platform

      const result = await runCommand(join(pluginRoot, 'bin', 'mise'), [
        '--version',
      ], env)
      const stdout = new TextDecoder().decode(result.stdout)

      assertEquals(result.success, true)
      assertStringIncludes(stdout, 'mise latest test')
      assertEquals(
        await exists(
          join(platformRoot(env.CLAUDE_PLUGIN_DATA, platform), 'bin', 'mise'),
        ),
        true,
      )
    } finally {
      await Deno.remove(baseDir, { recursive: true })
    }
  }
})

Deno.test('sa-mise fails on unsupported platforms', async () => {
  const baseDir = await Deno.makeTempDir()

  try {
    const { pluginRoot } = await createPluginFixture(baseDir, 'session')
    const { downloadLogPath, mockBinDir } = await createMockTooling(baseDir)
    const env = createEnv(baseDir, pluginRoot, downloadLogPath, mockBinDir)
    env.SA_MISE_FORCE_PLATFORM = 'windows-x64'

    const result = await runCommand(join(pluginRoot, 'bin', 'mise'), [
      '--version',
    ], env)
    const stderr = new TextDecoder().decode(result.stderr)

    assertEquals(result.success, false)
    assertStringIncludes(stderr, 'Unsupported sa-mise platform')
  } finally {
    await Deno.remove(baseDir, { recursive: true })
  }
})
