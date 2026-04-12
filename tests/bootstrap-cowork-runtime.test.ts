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
      'wizardly-fervent-bell',
      'mnt',
      '.remote-plugins',
      'plugin_012kA17iPUM2sc2WbAtkdXE6',
    )

  const filesToCopy = [
    '.claude-plugin/plugin.json',
    'bin/mise',
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

if [ "$url" = "${INSTALL_SCRIPT_URL}" ]; then
  cat <<'EOF' > "$output"
#!/bin/sh
set -eu
[ -n "\${MISE_INSTALL_PATH:-}" ] || exit 1
mkdir -p "$(dirname "$MISE_INSTALL_PATH")"
cat <<'INNER' > "$MISE_INSTALL_PATH"
#!/bin/sh
echo "mise latest test"
INNER
chmod +x "$MISE_INSTALL_PATH"
EOF
  exit 0
fi

printf 'unexpected url %s\\n' "$url" >&2
exit 1
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
    CLAUDE_PLUGIN_ROOT: pluginRoot,
    SA_MISE_FORCE_PLATFORM: 'linux-arm64',
    SA_TEST_DOWNLOAD_LOG: downloadLogPath,
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

Deno.test('sa-mise cold start installs latest mise in a session-shell path', async () => {
  const baseDir = await Deno.makeTempDir()
  try {
    const { pluginRoot } = await createPluginFixture(baseDir, 'session')
    const { mockBinDir, downloadLogPath } = await createMockTooling(baseDir)
    const env = createEnv(baseDir, pluginRoot, downloadLogPath, mockBinDir)

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
    assertEquals(
      await exists(
        join(
          env.CLAUDE_PLUGIN_DATA,
          'sa-mise',
          'linux-arm64',
          'install-status.txt',
        ),
      ),
      true,
    )
    assertEquals(await exists(join(env.HOME, '.local', 'bin', 'mise')), false)

    const downloadLog = await Deno.readTextFile(downloadLogPath)
    assertEquals(downloadLog.trim().split('\n').length, 1)
    assertStringIncludes(downloadLog, INSTALL_SCRIPT_URL)
  } finally {
    await Deno.remove(baseDir, { recursive: true })
  }
})

Deno.test('sa-mise works from a guest-shell style plugin path too', async () => {
  const baseDir = await Deno.makeTempDir()
  try {
    const { pluginRoot } = await createPluginFixture(baseDir, 'guest')
    const { mockBinDir, downloadLogPath } = await createMockTooling(baseDir)
    const env = createEnv(baseDir, pluginRoot, downloadLogPath, mockBinDir)

    const result = await runCommand(join(pluginRoot, 'bin', 'mise'), [
      '--version',
    ], env)
    const stdout = new TextDecoder().decode(result.stdout)

    assertEquals(result.success, true)
    assertStringIncludes(stdout, 'mise latest test')
  } finally {
    await Deno.remove(baseDir, { recursive: true })
  }
})

Deno.test('sa-mise reuses the cached binary on warm start', async () => {
  const baseDir = await Deno.makeTempDir()
  try {
    const { pluginRoot } = await createPluginFixture(baseDir, 'session')
    const { mockBinDir, downloadLogPath } = await createMockTooling(baseDir)
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

Deno.test('sa-mise fails clearly when CLAUDE_PLUGIN_DATA is missing', async () => {
  const baseDir = await Deno.makeTempDir()
  try {
    const { pluginRoot } = await createPluginFixture(baseDir, 'session')
    const { mockBinDir, downloadLogPath } = await createMockTooling(baseDir)

    const result = await runCommand(join(pluginRoot, 'bin', 'mise'), [
      '--version',
    ], {
      HOME: join(baseDir, 'home'),
      CLAUDE_PLUGIN_ROOT: pluginRoot,
      SA_MISE_FORCE_PLATFORM: 'linux-arm64',
      SA_TEST_DOWNLOAD_LOG: downloadLogPath,
      PATH: `${mockBinDir}:${Deno.env.get('PATH') ?? ''}`,
    })
    const stderr = new TextDecoder().decode(result.stderr)

    assertEquals(result.success, false)
    assertStringIncludes(stderr, 'CLAUDE_PLUGIN_DATA')
  } finally {
    await Deno.remove(baseDir, { recursive: true })
  }
})

Deno.test('sa-mise fails clearly when CLAUDE_PLUGIN_ROOT is missing', async () => {
  const baseDir = await Deno.makeTempDir()
  try {
    const { pluginRoot } = await createPluginFixture(baseDir, 'session')
    const { mockBinDir, downloadLogPath } = await createMockTooling(baseDir)

    const result = await runCommand(join(pluginRoot, 'bin', 'mise'), [
      '--version',
    ], {
      HOME: join(baseDir, 'home'),
      CLAUDE_PLUGIN_DATA: join(baseDir, 'plugin-data'),
      SA_MISE_FORCE_PLATFORM: 'linux-arm64',
      SA_TEST_DOWNLOAD_LOG: downloadLogPath,
      PATH: `${mockBinDir}:${Deno.env.get('PATH') ?? ''}`,
    })
    const stderr = new TextDecoder().decode(result.stderr)

    assertEquals(result.success, false)
    assertStringIncludes(stderr, 'CLAUDE_PLUGIN_ROOT')
  } finally {
    await Deno.remove(baseDir, { recursive: true })
  }
})

Deno.test('sa-mise fails on unsupported platforms', async () => {
  const baseDir = await Deno.makeTempDir()
  try {
    const { pluginRoot } = await createPluginFixture(baseDir, 'session')
    const { mockBinDir, downloadLogPath } = await createMockTooling(baseDir)
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

Deno.test('sa-mise can be resolved transparently from PATH', async () => {
  const baseDir = await Deno.makeTempDir()
  try {
    const { pluginRoot } = await createPluginFixture(baseDir, 'session')
    const { mockBinDir, downloadLogPath } = await createMockTooling(baseDir)
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
