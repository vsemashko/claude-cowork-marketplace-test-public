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
    await exists(join(pluginRoot, 'scripts', 'query-config-mcp.ts')),
    true,
  )
  assertEquals(
    await exists(join(pluginRoot, 'scripts', 'session-start-sample.ts')),
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

Deno.test('config MCPB bundle exists and keeps the expected config contract', async () => {
  const bundleRoot = join(Deno.cwd(), 'plugins', 'sa-cowork-config-mcp')
  const manifest = JSON.parse(
    await Deno.readTextFile(join(bundleRoot, 'manifest.json')),
  ) as {
    name: string
    tools?: Array<{ name: string }>
    server?: { mcp_config?: { env?: Record<string, string> } }
    user_config?: Record<string, unknown>
  }

  assertEquals(await exists(join(bundleRoot, '.mcpbignore')), true)
  assertEquals(await exists(join(bundleRoot, 'manifest.json')), true)
  assertEquals(await exists(join(bundleRoot, 'server', 'index.ts')), true)
  assertEquals(await exists(join(bundleRoot, 'server', 'package.json')), true)
  assertEquals(await exists(join(bundleRoot, 'server', 'tsconfig.json')), true)
  assertEquals(manifest.name, 'sa-cowork-config-mcp')
  assertEquals(manifest.tools?.map((tool) => tool.name), ['check_config'])
  assertEquals('dd_api_key' in (manifest.user_config ?? {}), true)
  assertEquals('dd_site' in (manifest.user_config ?? {}), true)
  assertEquals('gitlab_token' in (manifest.user_config ?? {}), true)
  assertEquals(
    manifest.server?.mcp_config?.env?.DD_API_KEY,
    '${user_config.dd_api_key}',
  )
  assertEquals(
    manifest.server?.mcp_config?.env?.DD_SITE,
    '${user_config.dd_site}',
  )
  assertEquals(
    manifest.server?.mcp_config?.env?.GITLAB_TOKEN,
    '${user_config.gitlab_token}',
  )
})
