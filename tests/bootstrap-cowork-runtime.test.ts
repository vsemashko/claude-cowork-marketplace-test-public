import { assertEquals, assertStringIncludes } from '@std/assert'
import { exists } from '@std/fs'
import { dirname, join } from '@std/path'

const REPO_ROOT = Deno.cwd()
const INSTALL_SCRIPT_URL = 'https://mise.jdx.dev/install.sh'
const SESSION_NAME = 'determined-kind-cerf'
const SHARED_ROOT_ENV_VAR = 'CLAUDE_COWORK_SHARED_ROOT'
const HOOK_INPUT_PAYLOAD = JSON.stringify({
  cwd: '/tmp/claude-session',
  event: 'SessionStart',
  source: 'test-fixture',
})
const PEER_PLUGIN_NAMES = [
  'sa-mise',
  'sa-mise-session-start-a',
  'sa-mise-session-start-b',
  'sa-mise-session-start-c',
] as const

type PluginName = (typeof PEER_PLUGIN_NAMES)[number]
type Layout = 'guest' | 'session'

function hasHookFixture(pluginName: PluginName): boolean {
  return PEER_PLUGIN_NAMES.includes(pluginName)
}

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
  layout: Layout,
  pluginName: PluginName,
): Promise<{ pluginRoot: string }> {
  const pluginRoot = layout === 'guest'
    ? join(
      baseDir,
      'cowork_plugins',
      'cache',
      'sa-mise-marketplace',
      pluginName,
      '1.0.0',
    )
    : join(
      baseDir,
      'sessions',
      SESSION_NAME,
      'mnt',
      '.remote-plugins',
      `${pluginName}-fixture`,
    )

  const filesToCopy = [
    '.claude-plugin/plugin.json',
    'bin/mise',
    'scripts/cowork-plugin-context.sh',
    'scripts/cowork-runtime-common.sh',
    'scripts/cowork-shared-runtime.sh',
    `skills/${pluginName}/SKILL.md`,
  ]

  if (hasHookFixture(pluginName)) {
    filesToCopy.push(
      'hooks/hooks.json',
    )
  }

  for (
    const optionalPath of [
      'scripts/find-sa-mise-sibling.sh',
      'scripts/session-start-sa-mise.sh',
    ]
  ) {
    if (await exists(join(REPO_ROOT, 'plugins', pluginName, optionalPath))) {
      filesToCopy.push(optionalPath)
    }
  }

  for (const relativePath of [...new Set(filesToCopy)]) {
    await copyFileWithMode(
      join(REPO_ROOT, 'plugins', pluginName, relativePath),
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
  [ "\${3:-}" = "--" ] && [ "\${4:-}" = "deno" ]; then
  shift 4
  exec "\${DENO_REAL_BIN:?}" "$@"
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

function derivedPluginDataPath(
  pluginRoot: string,
  pluginName: PluginName,
): string {
  const sessionMarker = `/${SESSION_NAME}/mnt/`
  const guestMarker = '/cowork_plugins/'

  if (pluginRoot.includes(sessionMarker)) {
    return join(
      pluginRoot.slice(
        0,
        pluginRoot.indexOf(sessionMarker) + sessionMarker.length,
      ),
      '.claude',
      'plugins',
      'data',
      pluginName,
    )
  }

  if (pluginRoot.includes(guestMarker)) {
    return join(
      pluginRoot.slice(0, pluginRoot.indexOf(guestMarker)),
      '.claude',
      'plugins',
      'data',
      pluginName,
    )
  }

  throw new Error(`Unsupported plugin layout: ${pluginRoot}`)
}

function sharedRootFromPluginRoot(pluginRoot: string): string {
  const sessionMarker = `/${SESSION_NAME}/mnt/`
  const guestMarker = '/cowork_plugins/'

  if (pluginRoot.includes(sessionMarker)) {
    return pluginRoot.slice(
      0,
      pluginRoot.indexOf(sessionMarker) + sessionMarker.length - 1,
    )
  }

  if (pluginRoot.includes(guestMarker)) {
    return pluginRoot.slice(0, pluginRoot.indexOf(guestMarker))
  }

  throw new Error(`Unsupported plugin layout: ${pluginRoot}`)
}

function runtimeMirrorRoot(
  pluginDataRoot: string,
  platform = 'linux-arm64',
): string {
  return join(pluginDataRoot, 'runtime-mirror', 'mise', platform)
}

function runtimeBinaryPath(
  pluginDataRoot: string,
  platform = 'linux-arm64',
): string {
  return join(runtimeMirrorRoot(pluginDataRoot, platform), 'bin', 'mise')
}

function sharedRuntimeBinaryPath(
  sharedRoot: string,
  platform = 'linux-arm64',
): string {
  return join(
    sharedRoot,
    '.claude',
    'plugins',
    'shared-runtime',
    'mise',
    platform,
    'current',
    'mise',
  )
}

function sharedRegistryPath(
  sharedRoot: string,
  platform = 'linux-arm64',
): string {
  return join(
    sharedRoot,
    '.claude',
    'plugins',
    'shared-runtime',
    'mise',
    platform,
    'registry.json',
  )
}

function stateFilePath(pluginDataRoot: string): string {
  return join(pluginDataRoot, 'state', 'cowork-plugin-context.env')
}

function contextHelperPath(pluginRoot: string): string {
  return join(pluginRoot, 'scripts', 'cowork-plugin-context.sh')
}

async function readSessionStartCommand(pluginRoot: string): Promise<string> {
  const hooksConfig = JSON.parse(
    await Deno.readTextFile(join(pluginRoot, 'hooks', 'hooks.json')),
  ) as {
    hooks: {
      SessionStart: Array<{
        hooks: Array<{ type: string; command: string }>
      }>
    }
  }

  return hooksConfig.hooks.SessionStart[0]?.hooks[0]?.command ?? ''
}

function createEnv(
  baseDir: string,
  pluginName: PluginName,
  downloadLogPath: string,
  mockBinDir: string,
  sharedRoot?: string,
): Record<string, string> {
  const env: Record<string, string> = {
    CLAUDE_PLUGIN_DATA: join(baseDir, 'plugin-data', pluginName),
    CLAUDE_PROJECT_DIR: join(baseDir, 'project'),
    CLAUDE_ENV_FILE: join(baseDir, 'claude-env', `${pluginName}.env`),
    CLAUDE_CODE_REMOTE: '1',
    DENO_REAL_BIN: Deno.execPath(),
    HOME: join(baseDir, 'home'),
    PATH: `${mockBinDir}:/usr/bin:/bin`,
    SA_MISE_FORCE_PLATFORM: 'linux-arm64',
    SA_TEST_DOWNLOAD_LOG: downloadLogPath,
    TMPDIR: join(baseDir, 'tmp'),
  }

  if (sharedRoot) {
    env[SHARED_ROOT_ENV_VAR] = sharedRoot
  }

  return env
}

async function runCommand(
  command: string,
  args: string[],
  env: Record<string, string>,
  stdinText?: string,
) {
  const child = new Deno.Command(command, {
    args,
    env,
    stdin: stdinText === undefined ? 'null' : 'piped',
    stderr: 'piped',
    stdout: 'piped',
  }).spawn()

  if (stdinText !== undefined) {
    const writer = child.stdin.getWriter()
    await writer.write(new TextEncoder().encode(stdinText))
    await writer.close()
  }

  return await child.output()
}

async function runSessionStartHook(
  pluginRoot: string,
  env: Record<string, string>,
) {
  const hookCommand = await readSessionStartCommand(pluginRoot)
  const wrappedCommand = [
    'if [ -n "${CLAUDE_ENV_FILE:-}" ] && [ -f "${CLAUDE_ENV_FILE}" ]; then',
    '  . "${CLAUDE_ENV_FILE}"',
    'fi',
    hookCommand,
  ].join('\n')
  return await runCommand('sh', ['-eu', '-c', wrappedCommand], {
    ...env,
    CLAUDE_PLUGIN_ROOT: pluginRoot,
  }, HOOK_INPUT_PAYLOAD)
}

Deno.test('any peer plugin can cold-start and publish the shared runtime', async () => {
  const baseDir = await Deno.makeTempDir()

  try {
    const pluginName = 'sa-mise-session-start-a'
    const { pluginRoot } = await createPluginFixture(
      baseDir,
      'session',
      pluginName,
    )
    const { downloadLogPath, mockBinDir } = await createMockTooling(baseDir)
    const sharedRoot = sharedRootFromPluginRoot(pluginRoot)
    const env = createEnv(
      baseDir,
      pluginName,
      downloadLogPath,
      mockBinDir,
      sharedRoot,
    )
    const pluginDataRoot = env.CLAUDE_PLUGIN_DATA

    const result = await runCommand(join(pluginRoot, 'bin', 'mise'), [
      '--version',
    ], env)
    const stdout = new TextDecoder().decode(result.stdout)

    assertEquals(result.success, true)
    assertStringIncludes(stdout, 'mise latest test')
    assertEquals(await exists(runtimeBinaryPath(pluginDataRoot)), true)
    assertEquals(await exists(sharedRuntimeBinaryPath(sharedRoot)), true)
    assertStringIncludes(
      await Deno.readTextFile(stateFilePath(pluginDataRoot)),
      'COWORK_PLUGIN_DATA_SOURCE=live-env',
    )
    assertStringIncludes(
      await Deno.readTextFile(stateFilePath(pluginDataRoot)),
      `COWORK_PLUGIN_NAME=${pluginName}`,
    )
    assertStringIncludes(
      await Deno.readTextFile(stateFilePath(pluginDataRoot)),
      'COWORK_SHARED_ROOT_SOURCE=explicit-env',
    )
    assertStringIncludes(
      await Deno.readTextFile(
        join(runtimeMirrorRoot(pluginDataRoot), 'install-status.env'),
      ),
      'source=download',
    )
  } finally {
    await Deno.remove(baseDir, { recursive: true })
  }
})

Deno.test('peer plugins derive isolated plugin data paths without explicit env', async () => {
  const baseDir = await Deno.makeTempDir()

  try {
    const pluginName = 'sa-mise-session-start-b'
    const { pluginRoot } = await createPluginFixture(
      baseDir,
      'guest',
      pluginName,
    )
    const { downloadLogPath, mockBinDir } = await createMockTooling(baseDir)
    const env = createEnv(baseDir, pluginName, downloadLogPath, mockBinDir)
    delete env.CLAUDE_PLUGIN_DATA

    const pluginDataRoot = derivedPluginDataPath(pluginRoot, pluginName)
    const result = await runCommand(join(pluginRoot, 'bin', 'mise'), [
      '--version',
    ], env)

    assertEquals(result.success, true)
    assertEquals(await exists(runtimeBinaryPath(pluginDataRoot)), true)
    assertStringIncludes(
      await Deno.readTextFile(stateFilePath(pluginDataRoot)),
      'COWORK_PLUGIN_DATA_SOURCE=layout-discovery',
    )
    assertStringIncludes(
      await Deno.readTextFile(stateFilePath(pluginDataRoot)),
      'COWORK_SHARED_ROOT_SOURCE=layout-discovery',
    )
  } finally {
    await Deno.remove(baseDir, { recursive: true })
  }
})

Deno.test('context helper prefers explicit shared-root env when plugin data is provided from env', async () => {
  const baseDir = await Deno.makeTempDir()

  try {
    const pluginName = 'sa-mise-session-start-a'
    const customPluginRoot = join(baseDir, 'custom-layout', pluginName)

    await copyFileWithMode(
      join(REPO_ROOT, 'plugins', pluginName, '.claude-plugin', 'plugin.json'),
      join(customPluginRoot, '.claude-plugin', 'plugin.json'),
    )
    await copyFileWithMode(
      join(
        REPO_ROOT,
        'plugins',
        pluginName,
        'scripts',
        'cowork-plugin-context.sh',
      ),
      contextHelperPath(customPluginRoot),
    )

    const explicitSharedRoot = join(baseDir, 'shared-root')
    const env = {
      CLAUDE_PLUGIN_DATA: join(baseDir, 'plugin-data', pluginName),
      [SHARED_ROOT_ENV_VAR]: explicitSharedRoot,
    }
    const result = await runCommand('sh', [
      contextHelperPath(customPluginRoot),
      'resolve',
      '--plugin-root',
      customPluginRoot,
    ], env)
    const stdout = new TextDecoder().decode(result.stdout)

    assertEquals(result.success, true)
    assertStringIncludes(
      stdout,
      `export COWORK_SHARED_ROOT='${explicitSharedRoot}'`,
    )
    assertStringIncludes(
      stdout,
      "export COWORK_SHARED_ROOT_SOURCE='explicit-env'",
    )
  } finally {
    await Deno.remove(baseDir, { recursive: true })
  }
})

Deno.test('context helper fails clearly when plugin data is set but shared root cannot be resolved', async () => {
  const baseDir = await Deno.makeTempDir()

  try {
    const pluginName = 'sa-mise-session-start-a'
    const customPluginRoot = join(baseDir, 'custom-layout', pluginName)

    await copyFileWithMode(
      join(REPO_ROOT, 'plugins', pluginName, '.claude-plugin', 'plugin.json'),
      join(customPluginRoot, '.claude-plugin', 'plugin.json'),
    )
    await copyFileWithMode(
      join(
        REPO_ROOT,
        'plugins',
        pluginName,
        'scripts',
        'cowork-plugin-context.sh',
      ),
      contextHelperPath(customPluginRoot),
    )

    const result = await runCommand('sh', [
      contextHelperPath(customPluginRoot),
      'resolve',
      '--plugin-root',
      customPluginRoot,
    ], {
      CLAUDE_PLUGIN_DATA: join(baseDir, 'plugin-data', pluginName),
    })
    const stderr = new TextDecoder().decode(result.stderr)

    assertEquals(result.success, false)
    assertStringIncludes(
      stderr,
      `Unable to resolve Cowork shared root from ${SHARED_ROOT_ENV_VAR} or plugin layout.`,
    )
  } finally {
    await Deno.remove(baseDir, { recursive: true })
  }
})

Deno.test('parallel cold starts trigger one download and backfill both local mirrors', async () => {
  const baseDir = await Deno.makeTempDir()

  try {
    const pluginA = await createPluginFixture(
      baseDir,
      'session',
      'sa-mise-session-start-a',
    )
    const pluginB = await createPluginFixture(
      baseDir,
      'session',
      'sa-mise-session-start-b',
    )
    const { downloadLogPath, mockBinDir } = await createMockTooling(baseDir)
    const sharedRoot = sharedRootFromPluginRoot(pluginA.pluginRoot)
    const envA = createEnv(
      baseDir,
      'sa-mise-session-start-a',
      downloadLogPath,
      mockBinDir,
      sharedRoot,
    )
    const envB = createEnv(
      baseDir,
      'sa-mise-session-start-b',
      downloadLogPath,
      mockBinDir,
      sharedRoot,
    )

    const [resultA, resultB] = await Promise.all([
      runCommand(join(pluginA.pluginRoot, 'bin', 'mise'), ['--version'], envA),
      runCommand(join(pluginB.pluginRoot, 'bin', 'mise'), ['--version'], envB),
    ])

    assertEquals(resultA.success, true)
    assertEquals(resultB.success, true)
    assertEquals(await exists(runtimeBinaryPath(envA.CLAUDE_PLUGIN_DATA)), true)
    assertEquals(await exists(runtimeBinaryPath(envB.CLAUDE_PLUGIN_DATA)), true)
    assertEquals(await exists(sharedRuntimeBinaryPath(sharedRoot)), true)

    const downloadLog = await Deno.readTextFile(downloadLogPath)
    assertEquals(downloadLog.trim().split('\n').length, 1)

    const registry = JSON.parse(
      await Deno.readTextFile(sharedRegistryPath(sharedRoot)),
    ) as { mirrorPaths: string[] }
    assertEquals(
      registry.mirrorPaths.sort(),
      [
        runtimeBinaryPath(envA.CLAUDE_PLUGIN_DATA),
        runtimeBinaryPath(envB.CLAUDE_PLUGIN_DATA),
      ].sort(),
    )
  } finally {
    await Deno.remove(baseDir, { recursive: true })
  }
})

Deno.test('warm peer start reuses the shared runtime and backfills the local mirror', async () => {
  const baseDir = await Deno.makeTempDir()

  try {
    const pluginA = await createPluginFixture(baseDir, 'session', 'sa-mise')
    const pluginB = await createPluginFixture(
      baseDir,
      'session',
      'sa-mise-session-start-a',
    )
    const { downloadLogPath, mockBinDir } = await createMockTooling(baseDir)
    const sharedRoot = sharedRootFromPluginRoot(pluginA.pluginRoot)
    const envA = createEnv(
      baseDir,
      'sa-mise',
      downloadLogPath,
      mockBinDir,
      sharedRoot,
    )
    const envB = createEnv(
      baseDir,
      'sa-mise-session-start-a',
      downloadLogPath,
      mockBinDir,
      sharedRoot,
    )

    const first = await runCommand(join(pluginA.pluginRoot, 'bin', 'mise'), [
      '--version',
    ], envA)
    const second = await runCommand(join(pluginB.pluginRoot, 'bin', 'mise'), [
      '--version',
    ], envB)

    assertEquals(first.success, true)
    assertEquals(second.success, true)
    assertEquals(await exists(runtimeBinaryPath(envB.CLAUDE_PLUGIN_DATA)), true)
    assertEquals(await exists(sharedRuntimeBinaryPath(sharedRoot)), true)
    assertEquals(
      (await Deno.readTextFile(downloadLogPath)).trim().split('\n').length,
      1,
    )
  } finally {
    await Deno.remove(baseDir, { recursive: true })
  }
})

Deno.test('broken shared runtime is repaired from another peer mirror and stale registry entries are pruned', async () => {
  const baseDir = await Deno.makeTempDir()

  try {
    const pluginA = await createPluginFixture(baseDir, 'session', 'sa-mise')
    const pluginB = await createPluginFixture(
      baseDir,
      'session',
      'sa-mise-session-start-a',
    )
    const pluginC = await createPluginFixture(
      baseDir,
      'session',
      'sa-mise-session-start-b',
    )
    const { downloadLogPath, mockBinDir } = await createMockTooling(baseDir)
    const sharedRoot = sharedRootFromPluginRoot(pluginA.pluginRoot)
    const envA = createEnv(
      baseDir,
      'sa-mise',
      downloadLogPath,
      mockBinDir,
      sharedRoot,
    )
    const envB = createEnv(
      baseDir,
      'sa-mise-session-start-a',
      downloadLogPath,
      mockBinDir,
      sharedRoot,
    )
    const envC = createEnv(
      baseDir,
      'sa-mise-session-start-b',
      downloadLogPath,
      mockBinDir,
      sharedRoot,
    )
    const sharedBinary = sharedRuntimeBinaryPath(sharedRoot)
    const staleBinary = join(baseDir, 'stale', 'bin', 'mise')
    const pluginABinary = runtimeBinaryPath(envA.CLAUDE_PLUGIN_DATA)
    const pluginBBinary = runtimeBinaryPath(envB.CLAUDE_PLUGIN_DATA)

    assertEquals(
      (await runCommand(
        join(pluginA.pluginRoot, 'bin', 'mise'),
        ['--version'],
        envA,
      )).success,
      true,
    )
    assertEquals(
      (await runCommand(
        join(pluginB.pluginRoot, 'bin', 'mise'),
        ['--version'],
        envB,
      )).success,
      true,
    )

    await Deno.remove(runtimeMirrorRoot(envA.CLAUDE_PLUGIN_DATA), {
      recursive: true,
    })
    await Deno.mkdir(dirname(sharedBinary), { recursive: true })
    try {
      await Deno.remove(sharedBinary)
    } catch (error) {
      if (!(error instanceof Deno.errors.NotFound)) {
        throw error
      }
    }
    await Deno.symlink(pluginABinary, sharedBinary)
    await Deno.writeTextFile(
      sharedRegistryPath(sharedRoot),
      JSON.stringify({
        mirrorPaths: [pluginABinary, pluginBBinary, staleBinary],
      }),
    )

    const result = await runCommand(join(pluginC.pluginRoot, 'bin', 'mise'), [
      '--version',
    ], envC)
    assertEquals(result.success, true)
    assertEquals(await exists(runtimeBinaryPath(envC.CLAUDE_PLUGIN_DATA)), true)

    const registry = JSON.parse(
      await Deno.readTextFile(sharedRegistryPath(sharedRoot)),
    ) as { mirrorPaths: string[] }
    assertEquals(registry.mirrorPaths.includes(pluginABinary), false)
    assertEquals(registry.mirrorPaths.includes(staleBinary), false)
    assertEquals(registry.mirrorPaths.includes(pluginBBinary), true)
    assertEquals(
      registry.mirrorPaths.includes(runtimeBinaryPath(envC.CLAUDE_PLUGIN_DATA)),
      true,
    )
    assertEquals(await Deno.readLink(sharedBinary), pluginBBinary)
    assertEquals(
      (await Deno.readTextFile(downloadLogPath)).trim().split('\n').length,
      1,
    )
  } finally {
    await Deno.remove(baseDir, { recursive: true })
  }
})

Deno.test('all peer SessionStart hooks execute successfully', async () => {
  const baseDir = await Deno.makeTempDir()

  try {
    const { downloadLogPath, mockBinDir } = await createMockTooling(baseDir)
    const firstFixture = await createPluginFixture(
      baseDir,
      'session',
      'sa-mise',
    )
    const fixtureRoots: Partial<Record<PluginName, string>> = {
      'sa-mise': firstFixture.pluginRoot,
    }
    const sharedRoot = sharedRootFromPluginRoot(firstFixture.pluginRoot)
    const sessionEnvFile = join(baseDir, 'claude-env', 'session.env')

    for (const pluginName of PEER_PLUGIN_NAMES) {
      const { pluginRoot } = pluginName === 'sa-mise'
        ? firstFixture
        : await createPluginFixture(baseDir, 'session', pluginName)
      fixtureRoots[pluginName] = pluginRoot
      const env = createEnv(
        baseDir,
        pluginName,
        downloadLogPath,
        mockBinDir,
        sharedRoot,
      )
      env.CLAUDE_ENV_FILE = sessionEnvFile

      const hookResult = await runSessionStartHook(pluginRoot, env)

      assertEquals(hookResult.success, true)
    }

    assertEquals(await exists(sharedRuntimeBinaryPath(sharedRoot)), true)
    assertStringIncludes(
      await Deno.readTextFile(sessionEnvFile),
      `export PATH="${join(firstFixture.pluginRoot, 'bin')}:$PATH"`,
    )
    assertEquals(
      (await Deno.readTextFile(downloadLogPath)).trim().split('\n').length,
      1,
    )
  } finally {
    await Deno.remove(baseDir, { recursive: true })
  }
})

Deno.test('sa-mise-session-start-b fails clearly when the sibling sa-mise plugin is missing', async () => {
  const baseDir = await Deno.makeTempDir()

  try {
    const pluginName = 'sa-mise-session-start-b'
    const { pluginRoot } = await createPluginFixture(
      baseDir,
      'session',
      pluginName,
    )
    const { downloadLogPath, mockBinDir } = await createMockTooling(baseDir)
    const sharedRoot = sharedRootFromPluginRoot(pluginRoot)
    const env = createEnv(
      baseDir,
      pluginName,
      downloadLogPath,
      mockBinDir,
      sharedRoot,
    )

    const hookResult = await runSessionStartHook(pluginRoot, env)
    const stderr = new TextDecoder().decode(hookResult.stderr)

    assertEquals(hookResult.success, false)
    assertStringIncludes(stderr, 'sa-mise plugin not found')
  } finally {
    await Deno.remove(baseDir, { recursive: true })
  }
})

Deno.test('sa-mise writes PATH export to CLAUDE_ENV_FILE and session-start-c relies on it', async () => {
  const baseDir = await Deno.makeTempDir()

  try {
    const saMiseFixture = await createPluginFixture(
      baseDir,
      'session',
      'sa-mise',
    )
    const fixtureC = await createPluginFixture(
      baseDir,
      'session',
      'sa-mise-session-start-c',
    )
    const { downloadLogPath, mockBinDir } = await createMockTooling(baseDir)
    const sharedRoot = sharedRootFromPluginRoot(saMiseFixture.pluginRoot)
    const sessionEnvFile = join(baseDir, 'claude-env', 'session.env')

    const envC = createEnv(
      baseDir,
      'sa-mise-session-start-c',
      downloadLogPath,
      mockBinDir,
      sharedRoot,
    )
    envC.CLAUDE_ENV_FILE = sessionEnvFile

    const hookResultBefore = await runCommand(
      'sh',
      ['-eu', '-c', await readSessionStartCommand(fixtureC.pluginRoot)],
      {
        ...envC,
        CLAUDE_PLUGIN_ROOT: fixtureC.pluginRoot,
      },
      HOOK_INPUT_PAYLOAD,
    )

    assertEquals(hookResultBefore.success, false)

    const envSaMise = createEnv(
      baseDir,
      'sa-mise',
      downloadLogPath,
      mockBinDir,
      sharedRoot,
    )
    envSaMise.CLAUDE_ENV_FILE = sessionEnvFile

    const saMiseHookResult = await runSessionStartHook(
      saMiseFixture.pluginRoot,
      envSaMise,
    )

    assertEquals(saMiseHookResult.success, true)
    assertStringIncludes(
      await Deno.readTextFile(sessionEnvFile),
      `export PATH="${join(saMiseFixture.pluginRoot, 'bin')}:$PATH"`,
    )

    const hookResultAfter = await runSessionStartHook(
      fixtureC.pluginRoot,
      envC,
    )

    assertEquals(hookResultAfter.success, true)
  } finally {
    await Deno.remove(baseDir, { recursive: true })
  }
})

Deno.test('peer shims still fail clearly on unsupported platforms', async () => {
  const baseDir = await Deno.makeTempDir()

  try {
    const pluginName = 'sa-mise'
    const { pluginRoot } = await createPluginFixture(
      baseDir,
      'session',
      pluginName,
    )
    const { downloadLogPath, mockBinDir } = await createMockTooling(baseDir)
    const sharedRoot = sharedRootFromPluginRoot(pluginRoot)
    const env = createEnv(
      baseDir,
      pluginName,
      downloadLogPath,
      mockBinDir,
      sharedRoot,
    )
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
