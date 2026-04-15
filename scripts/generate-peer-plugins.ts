import { ensureDir } from '@std/fs'
import { dirname, fromFileUrl, join } from '@std/path'

type PluginDefinition = {
  name: string
  description: string
  skillName: string
  skillDescription: string
  sampleName?: string
  hasHookFixture: boolean
  hookStrategy?: 'direct-plugin-root' | 'path-prepend' | 'cross-plugin-sa-mise'
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
    sampleName: 'sa-mise-session-start',
    hasHookFixture: true,
    hookStrategy: 'direct-plugin-root',
  },
  {
    name: 'sa-mise-session-start-a',
    description:
      'Peer Cowork fixture whose SessionStart hook prepends its own bin directory to PATH before invoking bare mise',
    skillName: 'sa-mise-session-start-a',
    skillDescription:
      'Run the generated peer-safe mise shim exposed by SessionStart hook fixture A.',
    sampleName: 'sa-mise-session-start-a-session-start',
    hasHookFixture: true,
    hookStrategy: 'path-prepend',
  },
  {
    name: 'sa-mise-session-start-b',
    description:
      'Peer Cowork fixture whose SessionStart hook resolves the sibling sa-mise plugin and invokes its mise shim directly',
    skillName: 'sa-mise-session-start-b',
    skillDescription:
      'Run the generated peer-safe mise shim exposed by SessionStart hook fixture B.',
    sampleName: 'sa-mise-session-start-b-session-start',
    hasHookFixture: true,
    hookStrategy: 'cross-plugin-sa-mise',
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

  const strategy = plugin.hookStrategy ?? 'direct-plugin-root'
  const strategyLines: string[] = []

  if (strategy === 'direct-plugin-root') {
    strategyLines.push(
      `attempted_binary_path="\${CLAUDE_PLUGIN_ROOT:-}/bin/mise"`,
      'attempted_command="${CLAUDE_PLUGIN_ROOT:-}/bin/mise --version && ${CLAUDE_PLUGIN_ROOT:-}/bin/mise exec deno@latest -- deno eval <sample>"',
    )
  } else if (strategy === 'path-prepend') {
    strategyLines.push(
      'PATH="${CLAUDE_PLUGIN_ROOT:-}/bin:${PATH}"',
      "attempted_binary_path=''",
      'attempted_command="PATH=${CLAUDE_PLUGIN_ROOT:-}/bin:${PATH} mise --version && mise exec deno@latest -- deno eval <sample>"',
    )
  } else if (strategy === 'cross-plugin-sa-mise') {
    strategyLines.push(
      'attempted_command="<resolved sa-mise plugin root>/bin/mise --version && <resolved sa-mise plugin root>/bin/mise exec deno@latest -- deno eval <sample>"',
      'plugin_parent="$(dirname "${CLAUDE_PLUGIN_ROOT:-.}")"',
      'for sibling_plugin_root in "$plugin_parent"/*; do',
      '  [ -d "$sibling_plugin_root" ] || continue',
      '  sibling_metadata="$sibling_plugin_root/.claude-plugin/plugin.json"',
      '  [ -f "$sibling_metadata" ] || continue',
      `  sibling_name="$(sed -n 's/^[[:space:]]*"name"[[:space:]]*:[[:space:]]*"\\([^"]*\\)".*$/\\1/p' "$sibling_metadata" | head -n 1)"`,
      '  if [ "$sibling_name" = "sa-mise" ]; then',
      '    resolved_cross_plugin_root="$sibling_plugin_root"',
      '    attempted_binary_path="$resolved_cross_plugin_root/bin/mise"',
      '    break',
      '  fi',
      'done',
    )
  }

  return [
    'LOG_FILE="${HOME}/.sa-mise-session-start.log"',
    'mkdir -p "$(dirname "$LOG_FILE")"',
    'timestamp="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"',
    `hook_strategy='${strategy}'`,
    "hook_status='failure'",
    "hook_output=''",
    "mise_version=''",
    "attempted_binary_path=''",
    "attempted_command=''",
    "resolved_cross_plugin_root=''",
    'hook_input="$(cat 2>/dev/null || true)"',
    'pwd_value="$(pwd)"',
    'path_before_strategy="${PATH:-}"',
    'command_v_mise_before_strategy="$(command -v mise 2>&1 || true)"',
    ...strategyLines,
    'path_after_strategy="${PATH:-}"',
    'command_v_mise_after_strategy="$(command -v mise 2>&1 || true)"',
    'if [ "${SA_MISE_HOOK_FORCE_FAILURE:-}" = "1" ]; then',
    "  hook_output='forced failure'",
    'elif [ "$hook_strategy" = "cross-plugin-sa-mise" ] && [ -z "$resolved_cross_plugin_root" ]; then',
    "  hook_output='sa-mise plugin not found'",
    'elif [ -n "$attempted_binary_path" ] && [ ! -x "$attempted_binary_path" ]; then',
    '  hook_output="attempted binary is not executable: $attempted_binary_path"',
    'elif [ "$hook_strategy" = "path-prepend" ]; then',
    '  if mise_version="$(mise --version 2>&1)"; then',
    `    if hook_output="$(SA_MISE_PLUGIN_NAME='${plugin.name}' SA_MISE_SAMPLE_NAME='${plugin.sampleName}' mise exec deno@latest -- deno eval '${denoEval}' 2>&1)"; then`,
    "      hook_status='success'",
    '    fi',
    '  else',
    '    hook_output="$mise_version"',
    "    mise_version=''",
    '  fi',
    'else',
    '  if mise_version="$("$attempted_binary_path" --version 2>&1)"; then',
    `    if hook_output="$(SA_MISE_PLUGIN_NAME='${plugin.name}' SA_MISE_SAMPLE_NAME='${plugin.sampleName}' "$attempted_binary_path" exec deno@latest -- deno eval '${denoEval}' 2>&1)"; then`,
    "      hook_status='success'",
    '    fi',
    '  else',
    '    hook_output="$mise_version"',
    "    mise_version=''",
    '  fi',
    'fi',
    '{',
    '  printf \'timestamp=%s\\n\' "$timestamp"',
    `  printf 'plugin_name=%s\\n' '${plugin.name}'`,
    '  printf \'hook_strategy=%s\\n\' "$hook_strategy"',
    '  printf \'hook_status=%s\\n\' "$hook_status"',
    '  printf \'attempted_command=%s\\n\' "$attempted_command"',
    '  printf \'attempted_binary_path=%s\\n\' "$attempted_binary_path"',
    '  printf \'resolved_cross_plugin_root=%s\\n\' "$resolved_cross_plugin_root"',
    '  printf \'pwd=%s\\n\' "$pwd_value"',
    '  printf \'PATH_before_strategy=%s\\n\' "$path_before_strategy"',
    '  printf \'PATH_after_strategy=%s\\n\' "$path_after_strategy"',
    '  printf \'CLAUDE_PLUGIN_ROOT=%s\\n\' "${CLAUDE_PLUGIN_ROOT:-}"',
    '  printf \'CLAUDE_PLUGIN_DATA=%s\\n\' "${CLAUDE_PLUGIN_DATA:-}"',
    '  printf \'CLAUDE_PROJECT_DIR=%s\\n\' "${CLAUDE_PROJECT_DIR:-}"',
    '  printf \'CLAUDE_ENV_FILE=%s\\n\' "${CLAUDE_ENV_FILE:-}"',
    '  printf \'CLAUDE_CODE_REMOTE=%s\\n\' "${CLAUDE_CODE_REMOTE:-}"',
    '  printf \'command_v_mise_before_strategy=%s\\n\' "$command_v_mise_before_strategy"',
    '  printf \'command_v_mise_after_strategy=%s\\n\' "$command_v_mise_after_strategy"',
    '  if [ -n "$mise_version" ]; then',
    '    printf \'mise_version=%s\\n\' "$mise_version"',
    '  fi',
    '  printf \'hook_input<<__SA_MISE_HOOK_INPUT__\\n%s\\n__SA_MISE_HOOK_INPUT__\\n\' "$hook_input"',
    "  printf 'env_dump<<__SA_MISE_ENV_DUMP__\\n'",
    '  env | sort',
    "  printf '__SA_MISE_ENV_DUMP__\\n'",
    '  printf \'hook_output<<__SA_MISE_HOOK_OUTPUT__\\n%s\\n__SA_MISE_HOOK_OUTPUT__\\n\\n\' "$hook_output"',
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
  const strategyLabel = plugin.hookStrategy === 'direct-plugin-root'
    ? 'direct plugin-root binary'
    : plugin.hookStrategy === 'path-prepend'
    ? 'own-bin PATH prepend'
    : 'cross-plugin sa-mise binary'
  const hookNotes = plugin.hasHookFixture
    ? `- Registered inline SessionStart hooks from all three peer fixtures append to:
  \`~/.sa-mise-session-start.log\`
- This fixture's SessionStart strategy is:
  \`${strategyLabel}\`
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
  runtime using the \`${strategyLabel}\` hook strategy.
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
