import { assert, assertEquals, assertStringIncludes } from '@std/assert'
import { exists } from '@std/fs'
import { dirname, join } from '@std/path'

const REPO_ROOT = Deno.cwd()
const SOURCE_PLUGIN_ROOT = join(REPO_ROOT, 'plugins', 'sa-cowork-runtime-test')
const SKILL_DIR = join(
  SOURCE_PLUGIN_ROOT,
  'skills',
  'sa-cowork-runtime-test-install',
  'scripts',
)

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

  await copyFileWithMode(
    join(SOURCE_PLUGIN_ROOT, '.tool-versions'),
    join(pluginRoot, '.tool-versions'),
  )
  await copyFileWithMode(
    join(SOURCE_PLUGIN_ROOT, 'deps', 'linux-arm64', 'runtime.env'),
    join(pluginRoot, 'deps', 'linux-arm64', 'runtime.env'),
  )
  await copyFileWithMode(
    join(SOURCE_PLUGIN_ROOT, 'hooks', 'session-start-marker.sh'),
    join(pluginRoot, 'hooks', 'session-start-marker.sh'),
  )
  await copyFileWithMode(
    join(SKILL_DIR, 'bootstrap-cowork-runtime.sh'),
    join(
      pluginRoot,
      'skills',
      'sa-cowork-runtime-test-install',
      'scripts',
      'bootstrap-cowork-runtime.sh',
    ),
  )
  await copyFileWithMode(
    join(SKILL_DIR, 'verify-cowork-runtime.sh'),
    join(
      pluginRoot,
      'skills',
      'sa-cowork-runtime-test-install',
      'scripts',
      'verify-cowork-runtime.sh',
    ),
  )
  await copyFileWithMode(
    join(SKILL_DIR, 'hello-runtime.ts'),
    join(
      pluginRoot,
      'skills',
      'sa-cowork-runtime-test-install',
      'scripts',
      'hello-runtime.ts',
    ),
  )

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
): Record<string, string> {
  const homeDir = join(baseDir, 'home')
  const pluginDataDir = join(baseDir, 'plugin-data')
  const binDir = join(homeDir, '.local', 'bin')

  return {
    HOME: homeDir,
    CLAUDE_PLUGIN_DATA: pluginDataDir,
    SA_COWORK_PLUGIN_ROOT: pluginRoot,
    SA_COWORK_FORCE_COWORK: '1',
    SA_COWORK_FORCE_PLATFORM: 'linux-arm64',
    SA_TEST_DOWNLOAD_LOG: downloadLogPath,
    SA_COWORK_INSTALL_BIN_DIR: binDir,
    DENO_REAL_BIN: Deno.execPath(),
    PATH: `${mockBinDir}:${Deno.env.get('PATH') ?? ''}`,
  }
}

async function runScript(scriptPath: string, env: Record<string, string>) {
  return await new Deno.Command(scriptPath, {
    env,
    stdout: 'piped',
    stderr: 'piped',
  }).output()
}

Deno.test('bootstrap-cowork-runtime downloads mise and deno on cold start', async () => {
  const baseDir = await Deno.makeTempDir()
  try {
    const { pluginRoot } = await createPluginFixture(baseDir)
    const { mockBinDir, downloadLogPath } = await createMockTooling(baseDir)
    const bootstrapPath = join(
      pluginRoot,
      'skills',
      'sa-cowork-runtime-test-install',
      'scripts',
      'bootstrap-cowork-runtime.sh',
    )
    const env = createEnv(baseDir, pluginRoot, downloadLogPath, mockBinDir)

    const result = await runScript(bootstrapPath, env)
    const stdout = new TextDecoder().decode(result.stdout)

    assertEquals(result.success, true)
    assertStringIncludes(stdout, 'Cowork runtime is ready.')
    assertStringIncludes(stdout, 'mise version: mise test 2026.3.9')
    assertStringIncludes(stdout, 'deno version: deno 2.6.8')
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

    const downloadLog = await Deno.readTextFile(downloadLogPath)
    assertEquals(downloadLog.trim().split('\n').length, 2)
  } finally {
    await Deno.remove(baseDir, { recursive: true })
  }
})

Deno.test('bootstrap-cowork-runtime reuses cache when runtime metadata is unchanged', async () => {
  const baseDir = await Deno.makeTempDir()
  try {
    const { pluginRoot } = await createPluginFixture(baseDir)
    const { mockBinDir, downloadLogPath } = await createMockTooling(baseDir)
    const bootstrapPath = join(
      pluginRoot,
      'skills',
      'sa-cowork-runtime-test-install',
      'scripts',
      'bootstrap-cowork-runtime.sh',
    )
    const env = createEnv(baseDir, pluginRoot, downloadLogPath, mockBinDir)

    const first = await runScript(bootstrapPath, env)
    const second = await runScript(bootstrapPath, env)
    const stdout = new TextDecoder().decode(second.stdout)

    assertEquals(first.success, true)
    assertEquals(second.success, true)
    assertStringIncludes(stdout, 'Reusing cached Cowork runtime')

    const downloadLog = await Deno.readTextFile(downloadLogPath)
    assertEquals(downloadLog.trim().split('\n').length, 2)
  } finally {
    await Deno.remove(baseDir, { recursive: true })
  }
})

Deno.test('bootstrap-cowork-runtime refreshes cache when runtime metadata changes', async () => {
  const baseDir = await Deno.makeTempDir()
  try {
    const { pluginRoot } = await createPluginFixture(
      baseDir,
      createRuntimeEnv('2.6.8'),
    )
    const { mockBinDir, downloadLogPath } = await createMockTooling(baseDir)
    const bootstrapPath = join(
      pluginRoot,
      'skills',
      'sa-cowork-runtime-test-install',
      'scripts',
      'bootstrap-cowork-runtime.sh',
    )
    const env = createEnv(baseDir, pluginRoot, downloadLogPath, mockBinDir)

    const first = await runScript(bootstrapPath, env)
    assertEquals(first.success, true)

    await Deno.writeTextFile(
      join(pluginRoot, 'deps', 'linux-arm64', 'runtime.env'),
      createRuntimeEnv('2.6.9'),
    )

    const second = await runScript(bootstrapPath, env)
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

Deno.test('bootstrap-cowork-runtime fails when plugin data is missing', async () => {
  const baseDir = await Deno.makeTempDir()
  try {
    const { pluginRoot } = await createPluginFixture(baseDir)
    const { mockBinDir, downloadLogPath } = await createMockTooling(baseDir)
    const bootstrapPath = join(
      pluginRoot,
      'skills',
      'sa-cowork-runtime-test-install',
      'scripts',
      'bootstrap-cowork-runtime.sh',
    )

    const result = await new Deno.Command(bootstrapPath, {
      env: {
        HOME: join(baseDir, 'home'),
        SA_COWORK_PLUGIN_ROOT: pluginRoot,
        SA_COWORK_FORCE_COWORK: '1',
        SA_COWORK_FORCE_PLATFORM: 'linux-arm64',
        SA_TEST_DOWNLOAD_LOG: downloadLogPath,
        DENO_REAL_BIN: Deno.execPath(),
        PATH: `${mockBinDir}:${Deno.env.get('PATH') ?? ''}`,
      },
      stdout: 'piped',
      stderr: 'piped',
    }).output()

    const stderr = new TextDecoder().decode(result.stderr)
    assertEquals(result.success, false)
    assertStringIncludes(stderr, 'CLAUDE_PLUGIN_DATA')
  } finally {
    await Deno.remove(baseDir, { recursive: true })
  }
})

Deno.test('bootstrap-cowork-runtime fails on unsupported platform', async () => {
  const baseDir = await Deno.makeTempDir()
  try {
    const { pluginRoot } = await createPluginFixture(baseDir)
    const { mockBinDir, downloadLogPath } = await createMockTooling(baseDir)
    const bootstrapPath = join(
      pluginRoot,
      'skills',
      'sa-cowork-runtime-test-install',
      'scripts',
      'bootstrap-cowork-runtime.sh',
    )
    const env = createEnv(baseDir, pluginRoot, downloadLogPath, mockBinDir)
    env.SA_COWORK_FORCE_PLATFORM = 'darwin-arm64'

    const result = await runScript(bootstrapPath, env)
    const stderr = new TextDecoder().decode(result.stderr)

    assertEquals(result.success, false)
    assertStringIncludes(stderr, 'Unsupported Cowork runtime platform')
  } finally {
    await Deno.remove(baseDir, { recursive: true })
  }
})

Deno.test('verify-cowork-runtime runs the hello-world Deno script after bootstrap', async () => {
  const baseDir = await Deno.makeTempDir()
  try {
    const { pluginRoot } = await createPluginFixture(baseDir)
    const { mockBinDir, downloadLogPath } = await createMockTooling(baseDir)
    const verifyPath = join(
      pluginRoot,
      'skills',
      'sa-cowork-runtime-test-install',
      'scripts',
      'verify-cowork-runtime.sh',
    )
    const env = createEnv(baseDir, pluginRoot, downloadLogPath, mockBinDir)

    await Deno.mkdir(join(env.CLAUDE_PLUGIN_DATA, 'cowork-runtime-test'), {
      recursive: true,
    })
    await Deno.writeTextFile(
      join(env.CLAUDE_PLUGIN_DATA, 'cowork-runtime-test', 'session-start.log'),
      '2026-01-01T00:00:00Z session-start hook executed\n',
    )

    const result = await runScript(verifyPath, env)
    const stdout = new TextDecoder().decode(result.stdout)

    assertEquals(result.success, true)
    assertStringIncludes(stdout, 'hook marker present')
    assertStringIncludes(stdout, 'Hello from Cowork runtime test')
    assertStringIncludes(stdout, 'Deno version:')
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

    const first = await new Deno.Command(hookPath, {
      env: { CLAUDE_PLUGIN_DATA: pluginDataDir },
      stdout: 'piped',
      stderr: 'piped',
    }).output()
    const second = await new Deno.Command(hookPath, {
      env: { CLAUDE_PLUGIN_DATA: pluginDataDir },
      stdout: 'piped',
      stderr: 'piped',
    }).output()

    assertEquals(first.success, true)
    assertEquals(second.success, true)

    const markerPath = join(
      pluginDataDir,
      'cowork-runtime-test',
      'session-start.log',
    )
    assertEquals(await exists(markerPath), true)

    const marker = await Deno.readTextFile(markerPath)
    assert(marker.trim().split('\n').length >= 2)
  } finally {
    await Deno.remove(baseDir, { recursive: true })
  }
})
