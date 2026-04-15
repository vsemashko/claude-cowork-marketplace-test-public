import { assertEquals, assertStringIncludes } from '@std/assert'
import { exists } from '@std/fs'
import { join } from '@std/path'

const PEER_PLUGIN_NAMES = ['sa-mise', 'sa-mise-user'] as const
const REPO_ROOT = Deno.cwd()

Deno.test('marketplace manifest advertises the minimal sa-mise plugin set', async () => {
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

Deno.test('generated plugins match the minimal owner-and-consumer architecture', async () => {
  const saMiseRoot = join(REPO_ROOT, 'plugins', 'sa-mise')
  const saMiseUserRoot = join(REPO_ROOT, 'plugins', 'sa-mise-user')

  assertEquals(await exists(saMiseRoot), true)
  assertEquals(await exists(saMiseUserRoot), true)
  assertEquals(
    await exists(join(REPO_ROOT, 'plugins', 'sa-mise-session-start-a')),
    false,
  )
  assertEquals(
    await exists(join(REPO_ROOT, 'plugins', 'sa-mise-session-start-b')),
    false,
  )
  assertEquals(
    await exists(join(REPO_ROOT, 'plugins', 'sa-mise-session-start-c')),
    false,
  )

  assertEquals(await exists(join(saMiseRoot, 'bin', 'mise')), true)
  assertEquals(
    await exists(join(saMiseRoot, 'scripts', 'cowork-shared-runtime.sh')),
    true,
  )
  assertEquals(
    await exists(join(saMiseRoot, 'scripts', 'cowork-runtime-common.sh')),
    true,
  )
  assertEquals(
    await exists(join(saMiseRoot, 'scripts', 'cowork-plugin-context.sh')),
    true,
  )
  assertEquals(
    await exists(join(saMiseRoot, 'scripts', 'session-start-sa-mise.sh')),
    true,
  )
  assertEquals(await exists(join(saMiseRoot, 'hooks', 'reply-sir.sh')), true)

  assertEquals(await exists(join(saMiseUserRoot, 'bin', 'mise')), false)
  assertEquals(
    await exists(join(saMiseUserRoot, 'scripts', 'cowork-shared-runtime.sh')),
    false,
  )
  assertEquals(
    await exists(join(saMiseUserRoot, 'scripts', 'cowork-runtime-common.sh')),
    false,
  )
  assertEquals(
    await exists(join(saMiseUserRoot, 'scripts', 'cowork-plugin-context.sh')),
    false,
  )
  assertEquals(
    await exists(join(saMiseUserRoot, 'scripts', 'resolve-env.sh')),
    true,
  )

  const saMiseHooks = JSON.parse(
    await Deno.readTextFile(join(saMiseRoot, 'hooks', 'hooks.json')),
  ) as {
    hooks: Record<
      string,
      Array<{ hooks: Array<{ type: string; command: string }> }>
    >
  }
  const saMiseUserHooks = JSON.parse(
    await Deno.readTextFile(join(saMiseUserRoot, 'hooks', 'hooks.json')),
  ) as {
    hooks: Record<
      string,
      Array<{ hooks: Array<{ type: string; command: string }> }>
    >
  }

  const saMiseSessionStartCommands = (saMiseHooks.hooks.SessionStart ?? [])
    .flatMap((matcher) => matcher.hooks.map((hook) => hook.command))
  const saMiseUserSessionStartCommands = (saMiseUserHooks.hooks.SessionStart ??
    [])
    .flatMap((matcher) => matcher.hooks.map((hook) => hook.command))

  assertEquals(saMiseSessionStartCommands.length, 2)
  assertEquals(saMiseUserSessionStartCommands.length, 1)

  assertEquals(
    saMiseSessionStartCommands.some((command) =>
      command.includes('session-start-sa-mise.sh')
    ),
    true,
  )
  assertEquals(
    saMiseSessionStartCommands.some((command) =>
      command.includes('hooks/reply-sir.sh')
    ),
    true,
  )
  assertEquals(
    saMiseSessionStartCommands.some((command) =>
      command.includes('.sa-mise-hook-results.log')
    ),
    false,
  )
  assertEquals(
    saMiseSessionStartCommands.some((command) =>
      command.includes('SA_MISE_SESSION_ENV_PROBE')
    ),
    false,
  )

  const saMiseUserCommand = saMiseUserSessionStartCommands[0]
  assertStringIncludes(
    saMiseUserCommand,
    '. "${CLAUDE_PLUGIN_ROOT:-}/scripts/resolve-env.sh"',
  )
  assertStringIncludes(
    saMiseUserCommand,
    "mise exec deno@latest -- deno eval 'Deno.exit(0)' >/dev/null 2>&1",
  )
  assertEquals(
    saMiseUserCommand.includes('find-sa-mise-sibling.sh'),
    false,
  )
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
