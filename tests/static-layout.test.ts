import { assertEquals } from '@std/assert'
import { exists } from '@std/fs'
import { join } from '@std/path'

const PEER_PLUGIN_NAMES = [
  'sa-mise',
  'sa-mise-session-start-a',
  'sa-mise-session-start-b',
] as const
const HOOK_PLUGIN_NAMES = [
  'sa-mise-session-start-a',
  'sa-mise-session-start-b',
] as const
const HOOK_PLUGIN_NAME_SET = new Set<string>(HOOK_PLUGIN_NAMES)

const REPO_ROOT = Deno.cwd()

Deno.test('marketplace manifest advertises the three peer sa-mise fixtures', async () => {
  const manifest = JSON.parse(
    await Deno.readTextFile(
      join(REPO_ROOT, '.claude-plugin', 'marketplace.json'),
    ),
  ) as { plugins: Array<{ name: string; source: string }> }

  assertEquals(
    manifest.plugins.map((plugin) => plugin.name),
    [...PEER_PLUGIN_NAMES],
  )
  assertEquals(
    manifest.plugins.map((plugin) => plugin.source),
    PEER_PLUGIN_NAMES.map((pluginName) => `./plugins/${pluginName}`),
  )
})

Deno.test('peer plugins ship identical generated shims and shared helpers', async () => {
  const firstPluginRoot = join(REPO_ROOT, 'plugins', PEER_PLUGIN_NAMES[0])
  const baselineBin = await Deno.readTextFile(
    join(firstPluginRoot, 'bin', 'mise'),
  )
  const baselineRuntime = await Deno.readTextFile(
    join(firstPluginRoot, 'scripts', 'cowork-shared-runtime.sh'),
  )
  const baselineCommon = await Deno.readTextFile(
    join(firstPluginRoot, 'scripts', 'cowork-runtime-common.sh'),
  )
  const baselineContext = await Deno.readTextFile(
    join(firstPluginRoot, 'scripts', 'cowork-plugin-context.sh'),
  )

  for (const pluginName of PEER_PLUGIN_NAMES) {
    const pluginRoot = join(REPO_ROOT, 'plugins', pluginName)
    const pluginConfig = JSON.parse(
      await Deno.readTextFile(
        join(pluginRoot, '.claude-plugin', 'plugin.json'),
      ),
    ) as { name: string; hooks?: string }

    assertEquals(
      await exists(join(pluginRoot, '.claude-plugin', 'plugin.json')),
      true,
    )
    assertEquals(pluginConfig.name, pluginName)
    assertEquals(pluginConfig.hooks, undefined)
    assertEquals(await exists(join(pluginRoot, 'bin', 'mise')), true)
    assertEquals(
      await exists(join(pluginRoot, 'scripts', 'cowork-shared-runtime.sh')),
      true,
    )
    assertEquals(
      await exists(join(pluginRoot, 'scripts', 'cowork-runtime-common.sh')),
      true,
    )
    assertEquals(
      await exists(join(pluginRoot, 'scripts', 'cowork-plugin-context.sh')),
      true,
    )
    assertEquals(
      await exists(join(pluginRoot, 'scripts', 'session-start-sample.ts')),
      HOOK_PLUGIN_NAME_SET.has(pluginName),
    )
    assertEquals(
      await exists(join(pluginRoot, 'skills', pluginName, 'SKILL.md')),
      true,
    )
    assertEquals(
      await exists(join(pluginRoot, 'hooks', 'session-start.sh')),
      HOOK_PLUGIN_NAME_SET.has(pluginName),
    )
    assertEquals(
      await exists(join(pluginRoot, 'hooks', 'hooks.json')),
      HOOK_PLUGIN_NAME_SET.has(pluginName),
    )
    assertEquals(
      await exists(join(pluginRoot, 'hooks', 'session-start.ts')),
      false,
    )
    assertEquals(await exists(join(pluginRoot, 'bin', 'deno')), false)
    assertEquals(await exists(join(pluginRoot, 'deps')), false)
    assertEquals(
      await exists(join(pluginRoot, 'scripts', 'runtime-shim.sh')),
      false,
    )

    assertEquals(
      await Deno.readTextFile(join(pluginRoot, 'bin', 'mise')),
      baselineBin,
    )
    assertEquals(
      await Deno.readTextFile(
        join(pluginRoot, 'scripts', 'cowork-shared-runtime.sh'),
      ),
      baselineRuntime,
    )
    assertEquals(
      await Deno.readTextFile(
        join(pluginRoot, 'scripts', 'cowork-runtime-common.sh'),
      ),
      baselineCommon,
    )
    assertEquals(
      await Deno.readTextFile(
        join(pluginRoot, 'scripts', 'cowork-plugin-context.sh'),
      ),
      baselineContext,
    )
  }
})

Deno.test('config MCPB bundle exists and keeps the expected config contract', async () => {
  const bundleRoot = join(REPO_ROOT, 'plugins', 'sa-cowork-config-mcp')
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
