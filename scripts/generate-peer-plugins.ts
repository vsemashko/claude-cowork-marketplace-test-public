import { ensureDir } from '@std/fs'
import { dirname, fromFileUrl, join } from '@std/path'

type PluginDefinition = {
  name: string
  description: string
  skillName: string
  skillDescription: string
  sampleName: string
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
      'Peer Cowork fixture that bootstraps and shares the latest mise binary through the generated shared shim',
    skillName: 'sa-mise',
    skillDescription:
      'Run the generated peer-safe mise shim exposed by this marketplace fixture.',
    sampleName: 'sa-mise-session-start',
  },
  {
    name: 'sa-mise-forwarder',
    description:
      'Peer Cowork fixture that uses the exact same generated mise shim as the primary fixture',
    skillName: 'sa-mise-forwarder',
    skillDescription:
      'Run the generated peer-safe mise shim exposed by the forwarder fixture.',
    sampleName: 'sa-mise-forwarder-session-start',
  },
  {
    name: 'sa-mise-cross-plugin',
    description:
      'Peer Cowork fixture that validates cross-plugin shared-runtime recovery with the same generated mise shim',
    skillName: 'sa-mise-cross-plugin',
    skillDescription:
      'Run the generated peer-safe mise shim exposed by the cross-plugin fixture.',
    sampleName: 'sa-mise-cross-plugin-session-start',
  },
]

const EXECUTABLE_TEMPLATE_FILES = new Set([
  'bin/mise',
  'hooks/session-start.sh',
  'scripts/cowork-plugin-context.sh',
  'scripts/cowork-runtime-common.sh',
  'scripts/cowork-shared-runtime.sh',
])

const SHARED_TEMPLATE_FILES = [
  'bin/mise',
  'hooks/hooks.json',
  'hooks/session-start.sh',
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
      },
      null,
      2,
    )
  }\n`
}

function createSkillContent(plugin: PluginDefinition): string {
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
- Registered hook logs are written here:
  \`\${CLAUDE_PLUGIN_DATA}/logs/session-start.log\`
- Shared resolver diagnostics are captured here:
  \`\${CLAUDE_PLUGIN_DATA}/state/cowork-plugin-context.env\`
`
}

function createSessionStartSample(plugin: PluginDefinition): string {
  return `#!/usr/bin/env -S mise exec deno@latest -- deno run -A

const miseVersion = await new Deno.Command('mise', {
  args: ['--version'],
  stdout: 'piped',
}).output()

const miseStdout = new TextDecoder().decode(miseVersion.stdout).trim()

console.log('sample_name=${plugin.sampleName}')
console.log('plugin_name=${plugin.name}')
console.log(\`mise_version=\${miseStdout}\`)
console.log(\`deno_version=\${Deno.version.deno}\`)
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

  await writeFile(
    join(pluginRoot, '.claude-plugin', 'plugin.json'),
    createPluginJson(plugin),
  )
  await writeFile(
    join(pluginRoot, 'skills', plugin.skillName, 'SKILL.md'),
    createSkillContent(plugin),
  )
  await writeFile(
    join(pluginRoot, 'scripts', 'session-start-sample.ts'),
    createSessionStartSample(plugin),
    true,
  )

  await removeIfExists(join(pluginRoot, 'scripts', 'runtime-shim.sh'))
}

for (const plugin of PEER_PLUGINS) {
  await generatePeerPlugin(plugin)
}

await writeFile(
  join(repoRoot, '.claude-plugin', 'marketplace.json'),
  createMarketplaceManifest(),
)
