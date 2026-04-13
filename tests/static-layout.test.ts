import { assertEquals } from '@std/assert'
import { exists } from '@std/fs'
import { join } from '@std/path'

Deno.test('marketplace manifest advertises only the sa-mise plugin', async () => {
  const manifest = JSON.parse(
    await Deno.readTextFile(
      join(Deno.cwd(), '.claude-plugin', 'marketplace.json'),
    ),
  ) as { plugins: Array<{ name: string; source: string }> }

  assertEquals(manifest.plugins.length, 1)
  assertEquals(manifest.plugins[0]?.name, 'sa-mise')
  assertEquals(manifest.plugins[0]?.source, './plugins/sa-mise')
})

Deno.test('sa-mise plugin ships the expected minimal assets', async () => {
  const pluginRoot = join(Deno.cwd(), 'plugins', 'sa-mise')
  const pluginConfig = JSON.parse(
    await Deno.readTextFile(join(pluginRoot, '.claude-plugin', 'plugin.json')),
  ) as { hooks?: string }

  assertEquals(
    await exists(join(pluginRoot, '.claude-plugin', 'plugin.json')),
    true,
  )
  assertEquals(pluginConfig.hooks, './hooks/hooks.json')
  assertEquals(await exists(join(pluginRoot, 'bin', 'mise')), true)
  assertEquals(
    await exists(join(pluginRoot, 'scripts', 'runtime-shim.sh')),
    true,
  )
  assertEquals(
    await exists(join(pluginRoot, 'scripts', 'cowork-plugin-context.sh')),
    true,
  )
  assertEquals(
    await exists(join(pluginRoot, 'scripts', 'examples', 'hook-sample.ts')),
    true,
  )
  assertEquals(
    await exists(join(pluginRoot, 'skills', 'sa-mise', 'SKILL.md')),
    true,
  )
  assertEquals(await exists(join(pluginRoot, 'hooks', 'hooks.json')), true)
  assertEquals(
    await exists(join(pluginRoot, 'hooks', 'session-start.sh')),
    true,
  )
  assertEquals(await exists(join(pluginRoot, 'bin', 'deno')), false)
  assertEquals(await exists(join(pluginRoot, 'deps')), false)
})
