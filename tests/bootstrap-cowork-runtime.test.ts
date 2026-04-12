import { assertEquals, assertStringIncludes } from '@std/assert'
import { exists } from '@std/fs'
import { dirname, join } from '@std/path'

const REPO_ROOT = Deno.cwd()
const SOURCE_PLUGIN_ROOT = join(REPO_ROOT, 'plugins', 'sa-cowork-runtime-test')

async function copyFileWithMode(src: string, dest: string): Promise<void> {
  await Deno.mkdir(dirname(dest), { recursive: true })
  await Deno.copyFile(src, dest)
  const stat = await Deno.stat(src)
  await Deno.chmod(dest, stat.mode ?? 0o755)
}

async function createPluginFixture(
  baseDir: string,
  runtimeEnv?: string,
): Promise<{ pluginRoot: string }> {
  const pluginRoot = join(
    baseDir,
    'cowork_plugins',
    'cache',
    'cowork-runtime-test-marketplace',
    'sa-cowork-runtime-test',
    '1.0.0',
  )

  const filesToCopy = [
    '.tool-versions',
    'deps/linux-arm64/runtime.env',
    'hooks/session-start-marker.sh',
    'hooks/hooks.json',
    'bin/mise',
    'bin/deno',
    'scripts/runtime-shim.sh',
    'skills/sa-cowork-runtime-test-install/SKILL.md',
    'skills/sa-cowork-runtime-test-install/scripts/bootstrap-cowork-runtime.sh',
    'skills/sa-cowork-runtime-test-install/scripts/verify-cowork-runtime.sh',
    'skills/sa-cowork-runtime-test-install/scripts/hello-runtime.ts',
  ]

  for (const relativePath of filesToCopy) {
    await copyFileWithMode(
      join(SOURCE_PLUGIN_ROOT, relativePath),
      join(pluginRoot, relativePath),
    )
  }

  if (runtimeEnv) {
    await Deno.writeTextFile(
      join(pluginRoot, 'deps', 'linux-arm64', 'runtime.env'),
      runtimeEnv,
    )
  }

  return { pluginRoot }
}

function createRuntimeEnv(denoVersion = '2.6.8'): string {
  return [
    'MISE_VERSION="2026.3.9"',
    `DENO_VERSION="${denoVersion}"`,
    'MISE_DOWNLOAD_URL="https://github.com/jdx/mise/releases/download/v2026.3.9/mise-v2026.3.9-linux-arm64.tar.gz"',
    `DENO_DOWNLOAD_URL="https://github.com/denoland/deno/releases/download/v${denoVersion}/deno-aarch64-unknown-linux-gnu.zip"`,
    '',
  ].join('\n')
}

async function writeExecutable(path: string, content: string): Promise<void> {
  await Deno.writeTextFile(path, content)
  await Deno.chmod(path, 0o755)
}

async function createMockTooling(
  baseDir: string,
): Promise<{ mockBinDir: string; downloadLogPath: string }> {
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

printf 'fixture for %s\\n' "$url" > "$output"
`,
  )

  await writeExecutable(
    join(mockBinDir, 'tar'),
    `#!/bin/sh
set -eu
dest=''
while [ $# -gt 0 ]; do
  case "$1" in
    -C)
      shift
      dest="$1"
      ;;
  esac
  shift
done

[ -n "$dest" ] || exit 1
mkdir -p "$dest/bin"
cat <<'EOF' > "$dest/bin/mise"
#!/bin/sh
echo "mise test 2026.3.9"
EOF
chmod +x "$dest/bin/mise"
`,
  )

  await writeExecutable(
    join(mockBinDir, 'unzip'),
    `#!/bin/sh
set -eu
dest=''
while [ $# -gt 0 ]; do
  case "$1" in
    -d)
      shift
      dest="$1"
      ;;
  esac
  shift
done

[ -n "$dest" ] || exit 1
mkdir -p "$dest"
cat <<'EOF' > "$dest/deno"
#!/bin/sh
if [ "\${1:-}" = "--version" ]; then
  echo "deno 2.6.8"
  exit 0
fi
if [ "\${1:-}" = "run" ]; then
  shift
  script="$1"
  exec "\${DENO_REAL_BIN:?}" run "$script"
fi
echo "deno 2.6.8"
EOF
chmod +x "$dest/deno"
`,
  )

  return { mockBinDir, downloadLogPath }
}

function createEnv(
  baseDir: string,
  pluginRoot: string,
  downloadLogPath: string,
  mockBinDir: string,
) {
  return {
    HOME: join(baseDir, 'home'),
    CLAUDE_PLUGIN_DATA: join(baseDir, 'plugin-data'),
    SA_COWORK_PLUGIN_ROOT: pluginRoot,
    SA_COWORK_FORCE_COWORK: '1',
    SA_COWORK_FORCE_PLATFORM: 'linux-arm64',
    SA_TEST_DOWNLOAD_LOG: downloadLogPath,
    DENO_REAL_BIN: Deno.execPath(),
    PATH: `${mockBinDir}:${Deno.env.get('PATH') ?? ''}`,
  }
}

async function runCommand(
  command: string,
  args: string[],
  env: Record<string, string>,
) {
  return await new Deno.Command(command, {
    args,
    env,
    stdout: 'piped',
    stderr: 'piped',
  }).output()
}

Deno.test('plugin-local mise shim downloads runtime on cold start', async () => {
  const baseDir = await Deno.makeTempDir()
  try {
    const { pluginRoot } = await createPluginFixture(baseDir)
    const { mockBinDir, downloadLogPath } = await createMockTooling(baseDir)
    const env = createEnv(baseDir, pluginRoot, downloadLogPath, mockBinDir)

    const result = await runCommand(join(pluginRoot, 'bin', 'mise'), [
      '--version',
    ], env)
    const stdout = new TextDecoder().decode(result.stdout)

    assertEquals(result.success, true)
    assertStringIncludes(stdout, 'mise test 2026.3.9')
    assertEquals(
      await exists(
        join(
          env.CLAUDE_PLUGIN_DATA,
          'cowork-runtime-test',
          'linux-arm64',
          'bin',
          'mise',
        ),
      ),
      true,
    )
    assertEquals(
      await exists(
        join(
          env.CLAUDE_PLUGIN_DATA,
          'cowork-runtime-test',
          'linux-arm64',
          'bin',
          'deno',
        ),
      ),
      true,
    )
    assertEquals(await exists(join(env.HOME, '.local', 'bin', 'mise')), false)
    assertEquals(await exists(join(env.HOME, '.local', 'bin', 'deno')), false)

    const downloadLog = await Deno.readTextFile(downloadLogPath)
    assertEquals(downloadLog.trim().split('\n').length, 2)
  } finally {
    await Deno.remove(baseDir, { recursive: true })
  }
})

Deno.test('plugin-local deno shim downloads runtime on cold start', async () => {
  const baseDir = await Deno.makeTempDir()
  try {
    const { pluginRoot } = await createPluginFixture(baseDir)
    const { mockBinDir, downloadLogPath } = await createMockTooling(baseDir)
    const env = createEnv(baseDir, pluginRoot, downloadLogPath, mockBinDir)

    const result = await runCommand(join(pluginRoot, 'bin', 'deno'), [
      '--version',
    ], env)
    const stdout = new TextDecoder().decode(result.stdout)

    assertEquals(result.success, true)
    assertStringIncludes(stdout, 'deno 2.6.8')

    const downloadLog = await Deno.readTextFile(downloadLogPath)
    assertEquals(downloadLog.trim().split('\n').length, 2)
  } finally {
    await Deno.remove(baseDir, { recursive: true })
  }
})

Deno.test('plugin-local shims reuse cache when runtime metadata is unchanged', async () => {
  const baseDir = await Deno.makeTempDir()
  try {
    const { pluginRoot } = await createPluginFixture(baseDir)
    const { mockBinDir, downloadLogPath } = await createMockTooling(baseDir)
    const env = createEnv(baseDir, pluginRoot, downloadLogPath, mockBinDir)

    const first = await runCommand(join(pluginRoot, 'bin', 'mise'), [
      '--version',
    ], env)
    const second = await runCommand(join(pluginRoot, 'bin', 'deno'), [
      '--version',
    ], env)

    assertEquals(first.success, true)
    assertEquals(second.success, true)

    const downloadLog = await Deno.readTextFile(downloadLogPath)
    assertEquals(downloadLog.trim().split('\n').length, 2)
  } finally {
    await Deno.remove(baseDir, { recursive: true })
  }
})

Deno.test('plugin-local shims refresh cache when runtime metadata changes', async () => {
  const baseDir = await Deno.makeTempDir()
  try {
    const { pluginRoot } = await createPluginFixture(
      baseDir,
      createRuntimeEnv('2.6.8'),
    )
    const { mockBinDir, downloadLogPath } = await createMockTooling(baseDir)
    const env = createEnv(baseDir, pluginRoot, downloadLogPath, mockBinDir)

    const first = await runCommand(join(pluginRoot, 'bin', 'mise'), [
      '--version',
    ], env)
    assertEquals(first.success, true)

    await Deno.writeTextFile(
      join(pluginRoot, 'deps', 'linux-arm64', 'runtime.env'),
      createRuntimeEnv('2.6.9'),
    )

    const second = await runCommand(join(pluginRoot, 'bin', 'deno'), [
      '--version',
    ], env)
    assertEquals(second.success, true)

    const cachedRuntimeEnv = await Deno.readTextFile(
      join(
        env.CLAUDE_PLUGIN_DATA,
        'cowork-runtime-test',
        'linux-arm64',
        'runtime.env',
      ),
    )
    assertStringIncludes(cachedRuntimeEnv, 'DENO_VERSION="2.6.9"')

    const downloadLog = await Deno.readTextFile(downloadLogPath)
    assertEquals(downloadLog.trim().split('\n').length, 4)
  } finally {
    await Deno.remove(baseDir, { recursive: true })
  }
})

Deno.test('plugin-local shims fail when plugin data is missing', async () => {
  const baseDir = await Deno.makeTempDir()
  try {
    const { pluginRoot } = await createPluginFixture(baseDir)
    const { mockBinDir, downloadLogPath } = await createMockTooling(baseDir)

    const result = await runCommand(join(pluginRoot, 'bin', 'mise'), [
      '--version',
    ], {
      HOME: join(baseDir, 'home'),
      SA_COWORK_PLUGIN_ROOT: pluginRoot,
      SA_COWORK_FORCE_COWORK: '1',
      SA_COWORK_FORCE_PLATFORM: 'linux-arm64',
      SA_TEST_DOWNLOAD_LOG: downloadLogPath,
      DENO_REAL_BIN: Deno.execPath(),
      PATH: `${mockBinDir}:${Deno.env.get('PATH') ?? ''}`,
    })
    const stderr = new TextDecoder().decode(result.stderr)

    assertEquals(result.success, false)
    assertStringIncludes(stderr, 'CLAUDE_PLUGIN_DATA')
  } finally {
    await Deno.remove(baseDir, { recursive: true })
  }
})

Deno.test('plugin-local shims fail on unsupported platform', async () => {
  const baseDir = await Deno.makeTempDir()
  try {
    const { pluginRoot } = await createPluginFixture(baseDir)
    const { mockBinDir, downloadLogPath } = await createMockTooling(baseDir)
    const env = createEnv(baseDir, pluginRoot, downloadLogPath, mockBinDir)
    env.SA_COWORK_FORCE_PLATFORM = 'darwin-arm64'

    const result = await runCommand(join(pluginRoot, 'bin', 'mise'), [
      '--version',
    ], env)
    const stderr = new TextDecoder().decode(result.stderr)

    assertEquals(result.success, false)
    assertStringIncludes(stderr, 'Unsupported Cowork runtime platform')
  } finally {
    await Deno.remove(baseDir, { recursive: true })
  }
})

Deno.test('verification script uses plugin-local shims and runs hello-world Deno', async () => {
  const baseDir = await Deno.makeTempDir()
  try {
    const { pluginRoot } = await createPluginFixture(baseDir)
    const { mockBinDir, downloadLogPath } = await createMockTooling(baseDir)
    const env = createEnv(baseDir, pluginRoot, downloadLogPath, mockBinDir)

    await Deno.mkdir(join(env.CLAUDE_PLUGIN_DATA, 'cowork-runtime-test'), {
      recursive: true,
    })
    await Deno.writeTextFile(
      join(env.CLAUDE_PLUGIN_DATA, 'cowork-runtime-test', 'session-start.log'),
      '2026-01-01T00:00:00Z session-start hook executed\n',
    )

    const result = await runCommand(
      join(
        pluginRoot,
        'skills',
        'sa-cowork-runtime-test-install',
        'scripts',
        'verify-cowork-runtime.sh',
      ),
      [],
      env,
    )
    const stdout = new TextDecoder().decode(result.stdout)

    assertEquals(result.success, true)
    assertStringIncludes(
      stdout,
      `shim mise: ${join(pluginRoot, 'bin', 'mise')}`,
    )
    assertStringIncludes(
      stdout,
      `shim deno: ${join(pluginRoot, 'bin', 'deno')}`,
    )
    assertStringIncludes(
      stdout,
      `cached deno: ${
        join(
          env.CLAUDE_PLUGIN_DATA,
          'cowork-runtime-test',
          'linux-arm64',
          'bin',
          'deno',
        )
      }`,
    )
    assertStringIncludes(stdout, 'hook marker present')
    assertStringIncludes(stdout, 'Hello from Cowork runtime test')
  } finally {
    await Deno.remove(baseDir, { recursive: true })
  }
})

Deno.test('session-start-marker writes a durable hook marker file', async () => {
  const baseDir = await Deno.makeTempDir()
  try {
    const { pluginRoot } = await createPluginFixture(baseDir)
    const hookPath = join(pluginRoot, 'hooks', 'session-start-marker.sh')
    const pluginDataDir = join(baseDir, 'plugin-data')

    const first = await runCommand(hookPath, [], {
      CLAUDE_PLUGIN_DATA: pluginDataDir,
    })
    const second = await runCommand(hookPath, [], {
      CLAUDE_PLUGIN_DATA: pluginDataDir,
    })

    assertEquals(first.success, true)
    assertEquals(second.success, true)

    const markerPath = join(
      pluginDataDir,
      'cowork-runtime-test',
      'session-start.log',
    )
    assertEquals(await exists(markerPath), true)

    const marker = await Deno.readTextFile(markerPath)
    assertEquals(marker.trim().split('\n').length >= 2, true)
  } finally {
    await Deno.remove(baseDir, { recursive: true })
  }
})

Deno.test('bare mise and deno resolve to plugin shims when plugin bin is on PATH', async () => {
  const baseDir = await Deno.makeTempDir()
  try {
    const { pluginRoot } = await createPluginFixture(baseDir)
    const { mockBinDir, downloadLogPath } = await createMockTooling(baseDir)
    const env = createEnv(baseDir, pluginRoot, downloadLogPath, mockBinDir)
    env.PATH = `${join(pluginRoot, 'bin')}:${env.PATH}`

    const miseResult = await runCommand('mise', ['--version'], env)
    const denoResult = await runCommand('deno', ['--version'], env)
    const miseStdout = new TextDecoder().decode(miseResult.stdout)
    const denoStdout = new TextDecoder().decode(denoResult.stdout)

    assertEquals(miseResult.success, true)
    assertEquals(denoResult.success, true)
    assertStringIncludes(miseStdout, 'mise test 2026.3.9')
    assertStringIncludes(denoStdout, 'deno 2.6.8')
  } finally {
    await Deno.remove(baseDir, { recursive: true })
  }
})
