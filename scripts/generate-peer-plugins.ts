import { ensureDir } from '@std/fs'
import { dirname, fromFileUrl, join } from '@std/path'

type PluginDefinition = {
  name: string
  description: string
  skillName: string
  skillDescription: string
  hasHookFixture: boolean
  sessionStartCommand?: string
  extraFiles?: Array<{ path: string; content: string; executable?: boolean }>
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
      'Primary peer Cowork fixture whose SessionStart hook invokes the local mise shim through ${CLAUDE_PLUGIN_ROOT}/bin/mise',
    skillName: 'sa-mise',
    skillDescription:
      'Run the generated peer-safe mise shim exposed by this marketplace fixture.',
    hasHookFixture: true,
    sessionStartCommand:
      '"${CLAUDE_PLUGIN_ROOT:-}/scripts/session-start-sa-mise.sh"',
    extraFiles: [
      {
        path: 'scripts/session-start-sa-mise.sh',
        executable: true,
        content: [
          '#!/bin/sh',
          '',
          'set -eu',
          '',
          'sa_mise_bin="${CLAUDE_PLUGIN_ROOT:-}/bin"',
          'if [ -n "${CLAUDE_ENV_FILE:-}" ]; then',
          '  mkdir -p "$(dirname "$CLAUDE_ENV_FILE")"',
          `  printf 'case ":$PATH:" in\n*:%s:*) ;;\n*) export PATH="%s:$PATH" ;;\nesac\n' "$sa_mise_bin" "$sa_mise_bin" >> "$CLAUDE_ENV_FILE"`,
          'fi',
          '',
          '"${CLAUDE_PLUGIN_ROOT:-}/bin/mise" exec deno@latest -- deno eval \'Deno.exit(0)\'',
        ].join('\n'),
      },
    ],
  },
  {
    name: 'sa-mise-session-start-a',
    description:
      'Peer Cowork fixture whose SessionStart hook prepends its own bin directory to PATH before invoking bare mise',
    skillName: 'sa-mise-session-start-a',
    skillDescription:
      'Run the generated peer-safe mise shim exposed by SessionStart hook fixture A.',
    hasHookFixture: true,
    sessionStartCommand:
      'PATH="${CLAUDE_PLUGIN_ROOT:-}/bin:${PATH}" mise exec deno@latest -- deno eval \'Deno.exit(0)\'',
  },
  {
    name: 'sa-mise-session-start-b',
    description:
      'Peer Cowork fixture whose SessionStart hook resolves the sibling sa-mise plugin and invokes its mise shim directly',
    skillName: 'sa-mise-session-start-b',
    skillDescription:
      'Run the generated peer-safe mise shim exposed by SessionStart hook fixture B.',
    hasHookFixture: true,
    sessionStartCommand: [
      'sibling_root="$("${CLAUDE_PLUGIN_ROOT:-}/scripts/find-sa-mise-sibling.sh")"',
      '"$sibling_root/bin/mise" exec deno@latest -- deno eval \'Deno.exit(0)\'',
    ].join('\n'),
    extraFiles: [
      {
        path: 'scripts/find-sa-mise-sibling.sh',
        executable: true,
        content: [
          '#!/bin/sh',
          '',
          'set -eu',
          '',
          'plugin_root="${CLAUDE_PLUGIN_ROOT:-}"',
          '[ -n "$plugin_root" ] || { echo "CLAUDE_PLUGIN_ROOT is required" >&2; exit 1; }',
          '',
          'plugin_parent="$(dirname "$plugin_root")"',
          'for sibling_plugin_root in "$plugin_parent"/*; do',
          '  [ -d "$sibling_plugin_root" ] || continue',
          '  sibling_metadata="$sibling_plugin_root/.claude-plugin/plugin.json"',
          '  [ -f "$sibling_metadata" ] || continue',
          `  sibling_name="$(sed -n 's/^[[:space:]]*"name"[[:space:]]*:[[:space:]]*"\\([^"]*\\)".*$/\\1/p' "$sibling_metadata" | head -n 1)"`,
          '  if [ "$sibling_name" = "sa-mise" ]; then',
          '    printf "%s\\n" "$sibling_plugin_root"',
          '    exit 0',
          '  fi',
          'done',
          '',
          'echo "sa-mise plugin not found" >&2',
          'exit 1',
        ].join('\n'),
      },
    ],
  },
  {
    name: 'sa-mise-session-start-c',
    description:
      'Peer Cowork fixture whose SessionStart hook relies on PATH exported by sa-mise through CLAUDE_ENV_FILE',
    skillName: 'sa-mise-session-start-c',
    skillDescription:
      'Run the generated peer-safe mise shim exposed by SessionStart hook fixture C.',
    hasHookFixture: true,
    sessionStartCommand: "mise exec deno@latest -- deno eval 'Deno.exit(0)'",
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
      },
      null,
      2,
    )
  }\n`
}

function createSessionStartCommand(plugin: PluginDefinition): string {
  if (!plugin.sessionStartCommand) {
    throw new Error(
      `Hook fixture requested for ${plugin.name} without sessionStartCommand`,
    )
  }

  return plugin.sessionStartCommand
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
    ? `- This fixture includes a minimal SessionStart hook that exercises
  its bundled runtime lookup path.
- Shared resolver diagnostics are still captured here for the shim itself:
  \`\${CLAUDE_PLUGIN_DATA}/state/cowork-plugin-context.env\``
    : `- This fixture does not include a sample SessionStart hook.
- Shared resolver diagnostics are captured here:
  \`\${CLAUDE_PLUGIN_DATA}/state/cowork-plugin-context.env\``

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
${hookNotes}
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

  for (const file of plugin.extraFiles ?? []) {
    await writeFile(
      join(pluginRoot, file.path),
      `${file.content}\n`,
      file.executable,
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
  if (
    !(plugin.extraFiles ?? []).some((file) =>
      file.path === 'scripts/find-sa-mise-sibling.sh'
    )
  ) {
    await removeIfExists(join(pluginRoot, 'scripts', 'find-sa-mise-sibling.sh'))
  }
  if (
    !(plugin.extraFiles ?? []).some((file) =>
      file.path === 'scripts/session-start-sa-mise.sh'
    )
  ) {
    await removeIfExists(
      join(pluginRoot, 'scripts', 'session-start-sa-mise.sh'),
    )
  }

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
