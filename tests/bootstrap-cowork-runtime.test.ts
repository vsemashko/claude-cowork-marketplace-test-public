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
    'scripts/examples/hook-sample.ts',
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

function createEnv(
  baseDir: string,
  _pluginRoot: string,
  downloadLogPath: string,
  mockBinDir: string,
): Record<string, string> {
  return {
    CLAUDE_PLUGIN_DATA: join(baseDir, 'plugin-data-live'),
    DENO_REAL_BIN: Deno.execPath(),
    HOME: join(baseDir, 'home'),
    PATH: `${mockBinDir}:${Deno.env.get('PATH') ?? ''}`,
    SA_MISE_FORCE_PLATFORM: 'linux-arm64',
    SA_TEST_DOWNLOAD_LOG: downloadLogPath,
    TMPDIR: join(baseDir, 'tmp'),
  }
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
    dirname(expectedDerivedPluginData(pluginRoot)),
    'state',
    'cowork-plugin-context',
    'sa-mise.env',
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
        join(env.CLAUDE_PLUGIN_DATA, 'sa-mise', 'linux-arm64', 'bin', 'mise'),
      ),
      true,
    )
    assertEquals(await exists(stateFile), true)
    assertStringIncludes(
      await Deno.readTextFile(stateFile),
      'COWORK_PLUGIN_DATA_SOURCE=live-env',
    )

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
        join(derivedPluginData, 'sa-mise', 'linux-arm64', 'bin', 'mise'),
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
          expectedDerivedPluginData(pluginRoot),
          'sa-mise',
          'linux-arm64',
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
      'sa-mise',
      'session-start.log',
    )
    const logContents = await Deno.readTextFile(logPath)

    assertEquals(hookResult.success, true)
    assertStringIncludes(logContents, 'plugin_data_source=live-env')
    assertStringIncludes(logContents, '-- sample output --')
    assertStringIncludes(logContents, 'sa-mise SessionStart hook sample')
    assertStringIncludes(logContents, 'mise: mise latest test')
    assertStringIncludes(logContents, 'deno:')
    assertStringIncludes(logContents, 'hook_status=success')
    assertEquals(await exists(stateFile), true)
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
    const derivedPluginData = expectedDerivedPluginData(pluginRoot)

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
        join(env.CLAUDE_PLUGIN_DATA, 'sa-mise', 'linux-arm64', 'bin', 'mise'),
      ),
      true,
    )
    assertEquals(
      await exists(
        join(derivedPluginData, 'sa-mise', 'linux-arm64', 'bin', 'mise'),
      ),
      false,
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

Deno.test('sa-mise accepts SA_MISE_PLUGIN_DATA as the explicit override', async () => {
  const baseDir = await Deno.makeTempDir()

  try {
    const { pluginRoot } = await createPluginFixture(baseDir, 'session')
    const { downloadLogPath, mockBinDir } = await createMockTooling(baseDir)
    const overridePluginData = join(baseDir, 'plugin-data-override')
    const stateFile = expectedStateFile(pluginRoot)

    const result = await runCommand(join(pluginRoot, 'bin', 'mise'), [
      '--version',
    ], {
      DENO_REAL_BIN: Deno.execPath(),
      HOME: join(baseDir, 'home'),
      PATH: `${mockBinDir}:${Deno.env.get('PATH') ?? ''}`,
      SA_MISE_PLUGIN_DATA: overridePluginData,
      SA_MISE_FORCE_PLATFORM: 'linux-arm64',
      SA_TEST_DOWNLOAD_LOG: downloadLogPath,
      TMPDIR: join(baseDir, 'tmp'),
    })
    const stdout = new TextDecoder().decode(result.stdout)

    assertEquals(result.success, true)
    assertStringIncludes(stdout, 'mise latest test')
    assertEquals(
      await exists(
        join(overridePluginData, 'sa-mise', 'linux-arm64', 'bin', 'mise'),
      ),
      true,
    )
    assertStringIncludes(
      await Deno.readTextFile(stateFile),
      'COWORK_PLUGIN_DATA_SOURCE=explicit-override',
    )
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

Deno.test('sa-mise fails on unsupported platforms', async () => {
  const baseDir = await Deno.makeTempDir()

  try {
    const { pluginRoot } = await createPluginFixture(baseDir, 'session')
    const { downloadLogPath, mockBinDir } = await createMockTooling(baseDir)
    const env = createEnv(baseDir, pluginRoot, downloadLogPath, mockBinDir)
    env.SA_MISE_FORCE_PLATFORM = 'darwin-arm64'

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
