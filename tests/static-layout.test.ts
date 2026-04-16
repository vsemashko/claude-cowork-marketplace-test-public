import { assertEquals, assertStringIncludes } from '@std/assert'
import { exists } from '@std/fs'
import { join } from '@std/path'

const PEER_PLUGIN_NAMES = ['sa-mise', 'sa-mise-user', 'sa-mise-user-2'] as const
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
  const saMiseUser2Root = join(REPO_ROOT, 'plugins', 'sa-mise-user-2')

  assertEquals(await exists(saMiseRoot), true)
  assertEquals(await exists(saMiseUserRoot), true)
  assertEquals(await exists(saMiseUser2Root), true)
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
  assertEquals(await exists(join(saMiseRoot, '.mcp.json')), false)
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
    false,
  )
  assertEquals(await exists(join(saMiseRoot, 'hooks', 'reply-sir.sh')), true)

  assertEquals(await exists(join(saMiseUserRoot, 'bin', 'mise')), false)
  assertEquals(await exists(join(saMiseUserRoot, '.mcp.json')), true)
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
  assertEquals(await exists(join(saMiseUser2Root, 'bin', 'mise')), false)
  assertEquals(await exists(join(saMiseUser2Root, '.mcp.json')), false)
  assertEquals(
    await exists(join(saMiseUser2Root, 'scripts', 'resolve-env.sh')),
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
  const saMiseUser2Hooks = JSON.parse(
    await Deno.readTextFile(join(saMiseUser2Root, 'hooks', 'hooks.json')),
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
  const saMiseUser2SessionStartCommands =
    (saMiseUser2Hooks.hooks.SessionStart ??
      [])
      .flatMap((matcher) => matcher.hooks.map((hook) => hook.command))

  assertEquals(saMiseSessionStartCommands.length, 2)
  assertEquals(saMiseUserSessionStartCommands.length, 1)
  assertEquals(saMiseUser2SessionStartCommands.length, 1)

  assertEquals(
    saMiseSessionStartCommands.some((command) =>
      command.includes('"${CLAUDE_PLUGIN_ROOT:-}/bin/mise" exec deno@latest')
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
  const saMiseUser2Command = saMiseUser2SessionStartCommands[0]
  assertStringIncludes(
    saMiseUserCommand,
    '. "${CLAUDE_PLUGIN_ROOT:-}/scripts/resolve-env.sh" &&',
  )
  assertStringIncludes(
    saMiseUserCommand,
    "mise exec deno@latest -- deno eval 'Deno.exit(0)' >/dev/null 2>&1",
  )
  assertStringIncludes(
    saMiseUser2Command,
    '. "${CLAUDE_PLUGIN_ROOT:-}/scripts/resolve-env.sh" &&',
  )
  assertEquals(
    saMiseUserCommand.includes('find-sa-mise-sibling.sh'),
    false,
  )
  const saMiseUserMcp = JSON.parse(
    await Deno.readTextFile(join(saMiseUserRoot, '.mcp.json')),
  ) as {
    mcpServers: Record<string, { command?: string; args?: string[] }>
  }
  assertEquals(Object.keys(saMiseUserMcp.mcpServers), ['context7'])
  assertEquals(
    saMiseUserMcp.mcpServers.context7?.command,
    '${CLAUDE_PLUGIN_ROOT}/scripts/context7-mcp.sh',
  )
  assertEquals(saMiseUserMcp.mcpServers.context7?.args, [])
  assertEquals(
    await exists(join(saMiseUserRoot, 'scripts', 'context7-mcp.sh')),
    true,
  )
  const context7BootstrapScript = await Deno.readTextFile(
    join(saMiseUserRoot, 'scripts', 'context7-mcp.sh'),
  )
  assertStringIncludes(
    context7BootstrapScript,
    'export CLAUDE_PLUGIN_ROOT="$plugin_root"',
  )
  assertStringIncludes(
    context7BootstrapScript,
    '. "$plugin_root/scripts/resolve-env.sh"',
  )
  assertStringIncludes(
    context7BootstrapScript,
    'exec mise exec nodejs@22 -- npx -y @upstash/context7-mcp',
  )
  const resolveEnvScript = await Deno.readTextFile(
    join(saMiseUserRoot, 'scripts', 'resolve-env.sh'),
  )
  assertStringIncludes(resolveEnvScript, '.sa-mise-resolve-env.log')
  assertStringIncludes(resolveEnvScript, 'state/sa-mise-plugin-root')
  assertStringIncludes(resolveEnvScript, 'XDG_RUNTIME_DIR')
  assertStringIncludes(resolveEnvScript, '${CLAUDE_PLUGIN_DATA}/runtime/xdg')
  assertStringIncludes(resolveEnvScript, '/tmp/runtime-$(id -u)')
  assertStringIncludes(resolveEnvScript, 'chmod 700 "$xdg_runtime_dir"')
  assertStringIncludes(resolveEnvScript, 'source=%s')
  assertStringIncludes(
    resolveEnvScript,
    'use_resolved_root "$cached_root" cache hit',
  )
  assertStringIncludes(
    resolveEnvScript,
    'use_resolved_root "$sibling_plugin_root" scan written',
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
  assertEquals(await exists(join(bundleRoot, '.mcp.json')), false)
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
