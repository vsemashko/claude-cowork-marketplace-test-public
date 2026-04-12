import { assertEquals } from '@std/assert'
import { exists } from '@std/fs'
import { join } from '@std/path'

Deno.test('marketplace manifest advertises only the runtime test plugin', async () => {
  const manifest = JSON.parse(
    await Deno.readTextFile(
      join(Deno.cwd(), '.claude-plugin', 'marketplace.json'),
    ),
  ) as { plugins: Array<{ name: string; source: string }> }

  assertEquals(manifest.plugins.length, 1)
  assertEquals(manifest.plugins[0]?.name, 'sa-cowork-runtime-test')
  assertEquals(manifest.plugins[0]?.source, './plugins/sa-cowork-runtime-test')
})

Deno.test('runtime test plugin ships the expected static assets', async () => {
  const pluginRoot = join(Deno.cwd(), 'plugins', 'sa-cowork-runtime-test')

  assertEquals(
    await exists(join(pluginRoot, '.claude-plugin', 'plugin.json')),
    true,
  )
  assertEquals(await exists(join(pluginRoot, '.tool-versions')), true)
  assertEquals(await exists(join(pluginRoot, 'bin', 'mise')), true)
  assertEquals(await exists(join(pluginRoot, 'bin', 'deno')), true)
  assertEquals(
    await exists(join(pluginRoot, 'deps', 'linux-arm64', 'runtime.env')),
    true,
  )
  assertEquals(await exists(join(pluginRoot, 'hooks', 'hooks.json')), true)
  assertEquals(
    await exists(join(pluginRoot, 'hooks', 'session-start-marker.sh')),
    true,
  )
  assertEquals(
    await exists(
      join(pluginRoot, 'skills', 'sa-cowork-runtime-test-install', 'SKILL.md'),
    ),
    true,
  )
  assertEquals(
    await exists(
      join(
        pluginRoot,
        'scripts',
        'runtime-shim.sh',
      ),
    ),
    true,
  )
  assertEquals(
    await exists(
      join(
        pluginRoot,
        'skills',
        'sa-cowork-runtime-test-install',
        'scripts',
        'bootstrap-cowork-runtime.sh',
      ),
    ),
    true,
  )
  assertEquals(
    await exists(
      join(
        pluginRoot,
        'skills',
        'sa-cowork-runtime-test-install',
        'scripts',
        'verify-cowork-runtime.sh',
      ),
    ),
    true,
  )
  assertEquals(
    await exists(
      join(
        pluginRoot,
        'skills',
        'sa-cowork-runtime-test-install',
        'scripts',
        'hello-runtime.ts',
      ),
    ),
    true,
  )
})
