import { assertEquals } from '@std/assert'
import { exists } from '@std/fs'
import { join } from '@std/path'

const PEER_PLUGIN_NAMES = [
  'sa-mise',
  'sa-mise-session-start-a',
  'sa-mise-session-start-b',
  'sa-mise-session-start-c',
] as const

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

  const hookCommands: Record<string, string[]> = {}

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
      await exists(join(pluginRoot, 'scripts', 'session-start-sa-mise.sh')),
      pluginName === 'sa-mise',
    )
    assertEquals(
      await exists(join(pluginRoot, 'scripts', 'find-sa-mise-sibling.sh')),
      pluginName === 'sa-mise-session-start-b',
    )
    assertEquals(
      await exists(join(pluginRoot, 'scripts', 'cwd-changed-sa-mise.sh')),
      false,
    )
    assertEquals(
      await exists(
        join(pluginRoot, 'scripts', 'user-prompt-submit-sa-mise.sh'),
      ),
      false,
    )
    assertEquals(
      await exists(join(pluginRoot, 'scripts', 'session-start-sample.ts')),
      false,
    )
    assertEquals(
      await exists(join(pluginRoot, 'skills', pluginName, 'SKILL.md')),
      true,
    )
    assertEquals(
      await exists(join(pluginRoot, 'hooks', 'session-start.sh')),
      false,
    )
    assertEquals(
      await exists(join(pluginRoot, 'hooks', 'hooks.json')),
      true,
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
    if (pluginName === 'sa-mise') {
      assertEquals(
        (await Deno.readTextFile(
          join(pluginRoot, 'scripts', 'session-start-sa-mise.sh'),
        )).includes('>/dev/null 2>&1'),
        true,
      )
    }
    const hooksConfig = JSON.parse(
      await Deno.readTextFile(join(pluginRoot, 'hooks', 'hooks.json')),
    ) as {
      hooks: Record<
        string,
        Array<{
          hooks: Array<{ type: string; command: string }>
        }>
      >
    }
    const sessionStartCommands = (hooksConfig.hooks.SessionStart ?? [])
      .flatMap((matcher) => matcher.hooks.map((hook) => hook.command))
    const cwdChangedCommands = (hooksConfig.hooks.CwdChanged ?? [])
      .flatMap((matcher) => matcher.hooks.map((hook) => hook.command))
    const userPromptSubmitCommands = (hooksConfig.hooks.UserPromptSubmit ?? [])
      .flatMap((matcher) => matcher.hooks.map((hook) => hook.command))
    hookCommands[pluginName] = [
      ...sessionStartCommands,
      ...cwdChangedCommands,
      ...userPromptSubmitCommands,
    ]
    if (pluginName === 'sa-mise') {
      assertEquals(sessionStartCommands.length, 1)
      assertEquals(userPromptSubmitCommands.length, 1)
    }
    if (pluginName === 'sa-mise-session-start-c') {
      assertEquals(sessionStartCommands.length, 0)
      assertEquals(cwdChangedCommands.length, 0)
      assertEquals(userPromptSubmitCommands.length, 2)
    }

    for (const hookCommand of hookCommands[pluginName]) {
      assertEquals(hookCommand.includes('session-start.sh'), false)
      assertEquals(hookCommand.includes('session-start-sample.ts'), false)
      assertEquals(hookCommand.includes('hook_strategy='), false)
      assertEquals(
        hookCommand.includes('env_dump<<__SA_MISE_ENV_DUMP__'),
        true,
      )
      assertEquals(hookCommand.includes('__SA_MISE_ENV_DUMP__'), true)
      assertEquals(hookCommand.includes('env | sort'), true)
      assertEquals(
        hookCommand.includes('hook_input<<__SA_MISE_HOOK_INPUT__'),
        false,
      )
      assertEquals(
        hookCommand.includes('.sa-mise-session-start.log'),
        false,
      )
      assertEquals(
        hookCommand.includes('.sa-mise-hook-results.log'),
        true,
      )
      assertEquals(hookCommand.includes('ts='), true)
      assertEquals(hookCommand.includes('path_has_plugin_bin='), true)
      assertEquals(hookCommand.includes('env_probe_present='), true)
      assertEquals(hookCommand.includes('claude_env_file_set='), true)
      assertEquals(hookCommand.includes('plugin_root_present='), true)
      assertEquals(hookCommand.includes('path=%s'), true)
      assertEquals(hookCommand.includes('env_probe_value=%s'), true)
      assertEquals(hookCommand.includes('claude_env_file=%s'), true)
      assertEquals(hookCommand.includes('claude_plugin_root=%s'), true)
      assertEquals(hookCommand.includes('claude_project_dir=%s'), true)
    }
    if (pluginName !== 'sa-mise' && pluginName !== 'sa-mise-session-start-c') {
      assertEquals(
        hookCommands[pluginName].some((command) =>
          command.includes('>/dev/null 2>&1')
        ),
        true,
      )
    }
  }

  assertEquals(
    hookCommands['sa-mise'].some((command) =>
      command.includes('session-start-sa-mise.sh')
    ),
    true,
  )
  assertEquals(
    hookCommands['sa-mise'].some((command) =>
      command.includes('"runtime-probe"')
    ),
    true,
  )
  assertEquals(
    hookCommands['sa-mise'].some((command) =>
      command.includes('"probe-env-visible"')
    ),
    true,
  )
  assertEquals(
    hookCommands['sa-mise-session-start-a'].some((command) =>
      command.includes('PATH="${CLAUDE_PLUGIN_ROOT:-}/bin:${PATH}"')
    ),
    true,
  )
  assertEquals(
    hookCommands['sa-mise-session-start-a'].some((command) =>
      command.includes('"path-probe"')
    ),
    true,
  )
  assertEquals(
    hookCommands['sa-mise-session-start-b'].some((command) =>
      command.includes('find-sa-mise-sibling.sh')
    ),
    true,
  )
  assertEquals(
    hookCommands['sa-mise-session-start-b'].some((command) =>
      command.includes('"sibling-probe"')
    ),
    true,
  )
  assertEquals(
    hookCommands['sa-mise-session-start-b'].some((command) =>
      command.includes('plugin_parent=')
    ),
    false,
  )
  assertEquals(
    hookCommands['sa-mise-session-start-c'].some((command) =>
      command.includes('user-prompt-submit-sa-mise.sh')
    ),
    false,
  )
  assertEquals(
    hookCommands['sa-mise-session-start-c'].some((command) =>
      command.includes('"probe-env-visible"')
    ),
    true,
  )
  assertEquals(
    hookCommands['sa-mise-session-start-c'].some((command) =>
      command.includes('"probe-path-visible"')
    ),
    true,
  )
  assertEquals(
    hookCommands['sa-mise-session-start-c'].some((command) =>
      command.includes('find-sa-mise-sibling.sh')
    ),
    false,
  )
  assertEquals(
    hookCommands['sa-mise-session-start-c'].some((command) =>
      command.includes('SA_MISE_SESSION_ENV_PROBE')
    ),
    true,
  )
  assertEquals(
    hookCommands['sa-mise'].join('\n') ===
      hookCommands['sa-mise-session-start-a'].join('\n'),
    false,
  )
  assertEquals(
    hookCommands['sa-mise-session-start-a'].join('\n') ===
      hookCommands['sa-mise-session-start-b'].join('\n'),
    false,
  )
  assertEquals(
    hookCommands['sa-mise'].join('\n') ===
      hookCommands['sa-mise-session-start-b'].join('\n'),
    false,
  )
  assertEquals(
    hookCommands['sa-mise-session-start-b'].join('\n') ===
      hookCommands['sa-mise-session-start-c'].join('\n'),
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
