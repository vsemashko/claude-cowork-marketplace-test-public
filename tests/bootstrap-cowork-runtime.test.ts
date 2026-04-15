import { assertEquals, assertStringIncludes } from '@std/assert'
import { exists } from '@std/fs'
import { dirname, join } from '@std/path'

const REPO_ROOT = Deno.cwd()
const INSTALL_SCRIPT_URL = 'https://mise.jdx.dev/install.sh'
const SESSION_NAME = 'determined-kind-cerf'
const SHARED_ROOT_ENV_VAR = 'CLAUDE_COWORK_SHARED_ROOT'
const RESOLVE_ENV_LOG_NAME = '.sa-mise-resolve-env.log'
const RESOLVE_ENV_CACHE_RELATIVE_PATH = 'state/sa-mise-plugin-root'
const PEER_PLUGIN_NAMES = ['sa-mise', 'sa-mise-user', 'sa-mise-user-2'] as const

type PluginName = (typeof PEER_PLUGIN_NAMES)[number]
type Layout = 'guest' | 'session'

function hookInputPayload(
  event: 'SessionStart' | 'CwdChanged' | 'UserPromptSubmit',
): string {
  return JSON.stringify({
    cwd: '/tmp/claude-session',
    event,
    source: 'test-fixture',
  })
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

  const optionalPaths = [
    '.claude-plugin/plugin.json',
    'hooks/hooks.json',
    `skills/${pluginName}/SKILL.md`,
    'bin/mise',
    'scripts/cowork-plugin-context.sh',
    'scripts/cowork-runtime-common.sh',
    'scripts/cowork-shared-runtime.sh',
    'hooks/reply-sir.sh',
    'scripts/resolve-env.sh',
  ]

  for (const relativePath of optionalPaths) {
    const sourcePath = join(REPO_ROOT, 'plugins', pluginName, relativePath)
    if (await exists(sourcePath)) {
      await copyFileWithMode(sourcePath, join(pluginRoot, relativePath))
    }
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

function stateFilePath(pluginDataRoot: string): string {
  return join(pluginDataRoot, 'state', 'cowork-plugin-context.env')
}

function resolveEnvCachePath(pluginDataRoot: string): string {
  return join(pluginDataRoot, RESOLVE_ENV_CACHE_RELATIVE_PATH)
}

function resolveEnvLogPath(baseDir: string): string {
  return join(baseDir, 'project', RESOLVE_ENV_LOG_NAME)
}

function contextHelperPath(pluginRoot: string): string {
  return join(pluginRoot, 'scripts', 'cowork-plugin-context.sh')
}

async function readHookCommands(
  pluginRoot: string,
  event: 'SessionStart' | 'CwdChanged' | 'UserPromptSubmit',
): Promise<string[]> {
  const hooksConfig = JSON.parse(
    await Deno.readTextFile(join(pluginRoot, 'hooks', 'hooks.json')),
  ) as {
    hooks: Record<
      string,
      Array<{
        hooks: Array<{ type: string; command: string }>
      }>
    >
  }

  return (hooksConfig.hooks[event] ?? []).flatMap((matcher) =>
    matcher.hooks.map((hook) => hook.command)
  )
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

async function runHook(
  pluginRoot: string,
  event: 'SessionStart' | 'CwdChanged' | 'UserPromptSubmit',
  env: Record<string, string>,
) {
  const hookCommands = await readHookCommands(pluginRoot, event)

  return await Promise.all(
    hookCommands.map((hookCommand) =>
      runCommand('sh', ['-eu', '-c', hookCommand], {
        ...env,
        CLAUDE_PLUGIN_ROOT: pluginRoot,
      }, hookInputPayload(event))
    ),
  )
}

Deno.test('sa-mise shim can cold-start and publish the shared runtime', async () => {
  const baseDir = await Deno.makeTempDir()

  try {
    const { pluginRoot } = await createPluginFixture(
      baseDir,
      'session',
      'sa-mise',
    )
    const { downloadLogPath, mockBinDir } = await createMockTooling(baseDir)
    const sharedRoot = sharedRootFromPluginRoot(pluginRoot)
    const env = createEnv(
      baseDir,
      'sa-mise',
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
      'COWORK_PLUGIN_NAME=sa-mise',
    )
  } finally {
    await Deno.remove(baseDir, { recursive: true })
  }
})

Deno.test('sa-mise SessionStart hooks run the runtime probe and emit the reply-sir context payload', async () => {
  const baseDir = await Deno.makeTempDir()

  try {
    const { pluginRoot } = await createPluginFixture(
      baseDir,
      'session',
      'sa-mise',
    )
    const { downloadLogPath, mockBinDir } = await createMockTooling(baseDir)
    const sharedRoot = sharedRootFromPluginRoot(pluginRoot)
    const env = createEnv(
      baseDir,
      'sa-mise',
      downloadLogPath,
      mockBinDir,
      sharedRoot,
    )

    const results = await runHook(pluginRoot, 'SessionStart', env)
    const stdoutPayloads = results.map((result) =>
      new TextDecoder().decode(result.stdout).trim()
    ).filter(Boolean)

    assertEquals(results.length, 2)
    assertEquals(results.every((result) => result.success), true)
    assertEquals(await exists(sharedRuntimeBinaryPath(sharedRoot)), true)
    assertEquals(stdoutPayloads.length, 1)

    const promptPayload = JSON.parse(stdoutPayloads[0]) as {
      continue: boolean
      hookSpecificOutput?: {
        hookEventName?: string
        additionalContext?: string
      }
    }
    assertEquals(promptPayload.continue, true)
    assertEquals(
      promptPayload.hookSpecificOutput?.hookEventName,
      'SessionStart',
    )
    assertStringIncludes(
      promptPayload.hookSpecificOutput?.additionalContext ?? '',
      ', sir',
    )
  } finally {
    await Deno.remove(baseDir, { recursive: true })
  }
})

Deno.test('consumer plugins resolve the sibling sa-mise plugin, cache it, and log cache usage', async () => {
  const baseDir = await Deno.makeTempDir()

  try {
    const saMise = await createPluginFixture(baseDir, 'session', 'sa-mise')
    const saMiseUser = await createPluginFixture(
      baseDir,
      'session',
      'sa-mise-user',
    )
    const saMiseUser2 = await createPluginFixture(
      baseDir,
      'session',
      'sa-mise-user-2',
    )
    const { downloadLogPath, mockBinDir } = await createMockTooling(baseDir)
    const sharedRoot = sharedRootFromPluginRoot(saMise.pluginRoot)
    const env = createEnv(
      baseDir,
      'sa-mise-user',
      downloadLogPath,
      mockBinDir,
      sharedRoot,
    )
    const env2 = createEnv(
      baseDir,
      'sa-mise-user-2',
      downloadLogPath,
      mockBinDir,
      sharedRoot,
    )

    const [hookResult] = await runHook(
      saMiseUser.pluginRoot,
      'SessionStart',
      env,
    )
    const [hookResultCached] = await runHook(
      saMiseUser.pluginRoot,
      'SessionStart',
      env,
    )
    const [hookResultSecondConsumer] = await runHook(
      saMiseUser2.pluginRoot,
      'SessionStart',
      env2,
    )

    assertEquals(hookResult.success, true)
    assertEquals(hookResultCached.success, true)
    assertEquals(hookResultSecondConsumer.success, true)
    assertEquals(await exists(sharedRuntimeBinaryPath(sharedRoot)), true)
    assertEquals(await exists(runtimeBinaryPath(env.CLAUDE_PLUGIN_DATA)), true)
    assertEquals(await exists(runtimeBinaryPath(env2.CLAUDE_PLUGIN_DATA)), true)
    assertEquals(
      await Deno.readTextFile(resolveEnvCachePath(env.CLAUDE_PLUGIN_DATA)),
      `${saMise.pluginRoot}\n`,
    )
    assertEquals(
      await Deno.readTextFile(resolveEnvCachePath(env2.CLAUDE_PLUGIN_DATA)),
      `${saMise.pluginRoot}\n`,
    )

    const command =
      (await readHookCommands(saMiseUser.pluginRoot, 'SessionStart'))[0]
    assertStringIncludes(
      command,
      '. "${CLAUDE_PLUGIN_ROOT:-}/scripts/resolve-env.sh" &&',
    )
    assertStringIncludes(
      command,
      "mise exec deno@latest -- deno eval 'Deno.exit(0)' >/dev/null 2>&1",
    )
    const resolveLog = await Deno.readTextFile(resolveEnvLogPath(baseDir))
    assertStringIncludes(
      resolveLog,
      'plugin=sa-mise-user source=scan status=success cache=written',
    )
    assertStringIncludes(
      resolveLog,
      'plugin=sa-mise-user source=cache status=success cache=hit',
    )
    assertStringIncludes(
      resolveLog,
      'plugin=sa-mise-user-2 source=scan status=success cache=written',
    )
  } finally {
    await Deno.remove(baseDir, { recursive: true })
  }
})

Deno.test('sa-mise-user fails clearly when the sibling sa-mise plugin is missing', async () => {
  const baseDir = await Deno.makeTempDir()

  try {
    const saMiseUser = await createPluginFixture(
      baseDir,
      'session',
      'sa-mise-user',
    )
    const { downloadLogPath, mockBinDir } = await createMockTooling(baseDir)
    const sharedRoot = sharedRootFromPluginRoot(saMiseUser.pluginRoot)
    const env = createEnv(
      baseDir,
      'sa-mise-user',
      downloadLogPath,
      mockBinDir,
      sharedRoot,
    )

    const [hookResult] = await runHook(
      saMiseUser.pluginRoot,
      'SessionStart',
      env,
    )
    const stderr = new TextDecoder().decode(hookResult.stderr)

    assertEquals(hookResult.success, false)
    assertStringIncludes(stderr, 'sa-mise plugin not found')
    const resolveLog = await Deno.readTextFile(resolveEnvLogPath(baseDir))
    assertStringIncludes(
      resolveLog,
      'plugin=sa-mise-user source=scan status=failure cache=miss resolved_root=',
    )
  } finally {
    await Deno.remove(baseDir, { recursive: true })
  }
})

Deno.test('context helper prefers explicit shared-root env when plugin data is provided from env', async () => {
  const baseDir = await Deno.makeTempDir()

  try {
    const pluginName = 'sa-mise'
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
    const pluginName = 'sa-mise'
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

Deno.test('peer shims still fail clearly on unsupported platforms', async () => {
  const baseDir = await Deno.makeTempDir()

  try {
    const { pluginRoot } = await createPluginFixture(
      baseDir,
      'session',
      'sa-mise',
    )
    const { downloadLogPath, mockBinDir } = await createMockTooling(baseDir)
    const sharedRoot = sharedRootFromPluginRoot(pluginRoot)
    const env = createEnv(
      baseDir,
      'sa-mise',
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

Deno.test('derived plugin data path still works for guest layouts', async () => {
  const baseDir = await Deno.makeTempDir()

  try {
    const { pluginRoot } = await createPluginFixture(
      baseDir,
      'guest',
      'sa-mise',
    )
    const { downloadLogPath, mockBinDir } = await createMockTooling(baseDir)
    const env = createEnv(baseDir, 'sa-mise', downloadLogPath, mockBinDir)
    delete env.CLAUDE_PLUGIN_DATA

    const pluginDataRoot = derivedPluginDataPath(pluginRoot, 'sa-mise')
    const result = await runCommand(join(pluginRoot, 'bin', 'mise'), [
      '--version',
    ], env)

    assertEquals(result.success, true)
    assertEquals(await exists(runtimeBinaryPath(pluginDataRoot)), true)
    assertStringIncludes(
      await Deno.readTextFile(stateFilePath(pluginDataRoot)),
      'COWORK_PLUGIN_DATA_SOURCE=layout-discovery',
    )
  } finally {
    await Deno.remove(baseDir, { recursive: true })
  }
})
