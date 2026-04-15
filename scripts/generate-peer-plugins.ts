import { ensureDir } from '@std/fs'
import { dirname, fromFileUrl, join } from '@std/path'

type PluginDefinition = {
  name: string
  description: string
  skillName: string
  skillDescription: string
  sampleName?: string
  hasHookFixture: boolean
}

const VERSION = '1.0.0'
const OWNER = {
  name: 'Vladimir Semashko',
  email: 'vsemashko@gmail.com',
}

const PEER_PLUGINS: PluginDefinition[] = [
  {
    name: 'sa-mise',
    description:
      'Primary peer Cowork fixture that bootstraps and shares the latest mise binary through the generated shared shim',
    skillName: 'sa-mise',
    skillDescription:
      'Run the generated peer-safe mise shim exposed by this marketplace fixture.',
    sampleName: 'sa-mise-session-start',
    hasHookFixture: true,
  },
  {
    name: 'sa-mise-session-start-a',
    description:
      'Peer Cowork fixture with a SessionStart sample that uses the same generated mise shim as every other peer',
    skillName: 'sa-mise-session-start-a',
    skillDescription:
      'Run the generated peer-safe mise shim exposed by SessionStart hook fixture A.',
    sampleName: 'sa-mise-session-start-a-session-start',
    hasHookFixture: true,
  },
  {
    name: 'sa-mise-session-start-b',
    description:
      'Peer Cowork fixture with a SessionStart sample that uses the same generated mise shim as every other peer',
    skillName: 'sa-mise-session-start-b',
    skillDescription:
      'Run the generated peer-safe mise shim exposed by SessionStart hook fixture B.',
    sampleName: 'sa-mise-session-start-b-session-start',
    hasHookFixture: true,
  },
]

const EXECUTABLE_TEMPLATE_FILES = new Set([
  'bin/mise',
  'scripts/cowork-plugin-context.sh',
  'scripts/cowork-runtime-common.sh',
  'scripts/cowork-shared-runtime.sh',
])

const SHARED_TEMPLATE_FILES = [
  'bin/mise',
  'scripts/cowork-plugin-context.sh',
  'scripts/cowork-runtime-common.sh',
  'scripts/cowork-shared-runtime.sh',
]

const repoRoot = dirname(dirname(fromFileUrl(import.meta.url)))
const templateRoot = join(repoRoot, 'templates', 'peer-plugin')

async function writeFile(
  path: string,
  content: string,
  executable = false,
): Promise<void> {
  await ensureDir(dirname(path))
  await Deno.writeTextFile(path, content)
  if (executable) {
    await Deno.chmod(path, 0o755)
  }
}

async function copySharedTemplate(
  relativePath: string,
  destinationRoot: string,
): Promise<void> {
  const sourcePath = join(templateRoot, relativePath)
  const destinationPath = join(destinationRoot, relativePath)
  const content = await Deno.readTextFile(sourcePath)
  await writeFile(
    destinationPath,
    content,
    EXECUTABLE_TEMPLATE_FILES.has(relativePath),
  )
}

function createPluginJson(plugin: PluginDefinition): string {
  return `${
    JSON.stringify(
      {
        name: plugin.name,
        version: VERSION,
        description: plugin.description,
        author: {
          name: OWNER.name,
        },
        ...(plugin.hasHookFixture ? { hooks: './hooks/hooks.json' } : {}),
      },
      null,
      2,
    )
  }\n`
}

function createSessionStartCommand(plugin: PluginDefinition): string {
  if (!plugin.sampleName) {
    throw new Error(
      `Hook fixture sample requested for ${plugin.name} without sample name`,
    )
  }

  const denoEval = [
    'console.log(`sample_name=${Deno.env.get("SA_MISE_SAMPLE_NAME") ?? "unknown"}`)',
    'console.log(`plugin_name=${Deno.env.get("SA_MISE_PLUGIN_NAME") ?? "unknown"}`)',
    'console.log(`deno_version=${Deno.version.deno}`)',
  ].join('; ')

  return [
    'LOG_FILE="${HOME}/.sa-mise-session-start.log"',
    'mkdir -p "$(dirname "$LOG_FILE")"',
    'timestamp="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"',
    "hook_status='failure'",
    "hook_output=''",
    "mise_version=''",
    'if [ "${SA_MISE_HOOK_FORCE_FAILURE:-}" = "1" ]; then',
    "  hook_output='forced failure'",
    'elif mise_version="$(mise --version 2>&1)"; then',
    `  if hook_output="$(SA_MISE_PLUGIN_NAME='${plugin.name}' SA_MISE_SAMPLE_NAME='${plugin.sampleName}' mise exec deno@latest -- deno eval '${denoEval}' 2>&1)"; then`,
    "    hook_status='success'",
    '  fi',
    'else',
    '  hook_output="$mise_version"',
    "  mise_version=''",
    'fi',
    '{',
    '  printf \'timestamp=%s\\n\' "$timestamp"',
    `  printf 'plugin_name=%s\\n' '${plugin.name}'`,
    '  printf \'hook_status=%s\\n\' "$hook_status"',
    '  if [ -n "$mise_version" ]; then',
    '    printf \'mise_version=%s\\n\' "$mise_version"',
    '  fi',
    '  printf \'%s\\n\\n\' "$hook_output"',
    '} >> "$LOG_FILE"',
  ].join('\n')
}

function createHooksJson(plugin: PluginDefinition): string {
  return `${
    JSON.stringify(
      {
        hooks: {
          SessionStart: [
            {
              matcher: '',
              hooks: [
                {
                  type: 'command',
                  command: createSessionStartCommand(plugin),
                },
              ],
            },
          ],
        },
      },
      null,
      2,
    )
  }\n`
}

function createSkillContent(plugin: PluginDefinition): string {
  const hookNotes = plugin.hasHookFixture
    ? `- Registered inline SessionStart hooks from all three peer fixtures append to:
  \`~/.sa-mise-session-start.log\`
- To inspect the shared hook trace, print the log directly:
  \`cat ~/.sa-mise-session-start.log\`
- Shared resolver diagnostics are still captured here for the shim itself:
  \`\${CLAUDE_PLUGIN_DATA}/state/cowork-plugin-context.env\``
    : `- This fixture does not include a sample SessionStart hook.
- Shared resolver diagnostics are captured here:
  \`\${CLAUDE_PLUGIN_DATA}/state/cowork-plugin-context.env\``

  const traceSection = plugin.name === 'sa-mise'
    ? `
## Hook Trace

To print the shared SessionStart hook log from any peer fixture:

\`\`\`bash
cat ~/.sa-mise-session-start.log
\`\`\`
`
    : ''

  return `---
name: ${plugin.skillName}
description: ${plugin.skillDescription}
---

# ${plugin.skillName}

Use this skill when the user wants to run \`mise\` through the \`${plugin.name}\`
peer fixture.

## Command

If the plugin \`bin/\` directory is already on \`PATH\`, run \`mise\` directly:

\`\`\`bash
mise <args>
\`\`\`

For a basic availability check:

\`\`\`bash
mise --version
\`\`\`

If \`mise\` is not on \`PATH\`, fall back to the plugin-local shim path:

\`\`\`bash
\${CLAUDE_PLUGIN_ROOT}/bin/mise <args>
\`\`\`

## Notes

- This fixture ships the same generated \`bin/mise\` shim as every other
  \`sa-mise*\` peer plugin in this repo.
- The shim keeps a durable local mirror at:
  \`\${CLAUDE_PLUGIN_DATA}/runtime-mirror/mise/<platform>/\`
- The active session runtime is shared at:
  \`<shared-root>/.claude/plugins/shared-runtime/mise/<platform>/\`
- Any peer plugin may run first, recreate the shared symlink, or backfill its
  own mirror from shared state.
- This fixture exists to prove SessionStart hook execution against the shared
  runtime, not to exercise a unique shim strategy.
${hookNotes}
${traceSection}
`
}

function createMarketplaceManifest(): string {
  return `${
    JSON.stringify(
      {
        name: 'sa-mise-marketplace',
        owner: OWNER,
        metadata: {
          description:
            'Minimal Claude marketplace for exercising fully interchangeable Cowork mise shims',
          version: VERSION,
        },
        plugins: PEER_PLUGINS.map((plugin) => ({
          name: plugin.name,
          description: plugin.description,
          version: VERSION,
          category: 'core',
          source: `./plugins/${plugin.name}`,
          author: OWNER,
        })),
      },
      null,
      2,
    )
  }\n`
}

async function removeIfExists(path: string): Promise<void> {
  try {
    await Deno.remove(path, { recursive: true })
  } catch (error) {
    if (!(error instanceof Deno.errors.NotFound)) {
      throw error
    }
  }
}

async function generatePeerPlugin(plugin: PluginDefinition): Promise<void> {
  const pluginRoot = join(repoRoot, 'plugins', plugin.name)

  for (const relativePath of SHARED_TEMPLATE_FILES) {
    await copySharedTemplate(relativePath, pluginRoot)
  }

  if (plugin.hasHookFixture) {
    await writeFile(
      join(pluginRoot, 'hooks', 'hooks.json'),
      createHooksJson(plugin),
    )
  }

  await writeFile(
    join(pluginRoot, '.claude-plugin', 'plugin.json'),
    createPluginJson(plugin),
  )
  await writeFile(
    join(pluginRoot, 'skills', plugin.skillName, 'SKILL.md'),
    createSkillContent(plugin),
  )
  await removeIfExists(join(pluginRoot, 'scripts', 'runtime-shim.sh'))
  await removeIfExists(join(pluginRoot, 'hooks', 'session-start.ts'))
  await removeIfExists(join(pluginRoot, 'hooks', 'session-start.sh'))
  await removeIfExists(join(pluginRoot, 'scripts', 'session-start-sample.ts'))

  if (!plugin.hasHookFixture) {
    await removeIfExists(join(pluginRoot, 'hooks'))
  }
}

for (const plugin of PEER_PLUGINS) {
  await generatePeerPlugin(plugin)
}

await writeFile(
  join(repoRoot, '.claude-plugin', 'marketplace.json'),
  createMarketplaceManifest(),
)
