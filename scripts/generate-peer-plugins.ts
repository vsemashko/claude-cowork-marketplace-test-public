import { ensureDir } from '@std/fs'
import { dirname, fromFileUrl, join } from '@std/path'

type HookDefinition = {
  event: 'SessionStart' | 'CwdChanged' | 'FileChanged' | 'UserPromptSubmit'
  label: string
  matcher?: string
  command: string
}

type PluginDefinition = {
  name: string
  description: string
  skillName: string
  skillDescription: string
  hookSummary: string
  hooks: HookDefinition[]
  sharedTemplateFiles?: string[]
  hookCommandPrefixScript?: string
  extraFiles?: Array<{ path: string; content: string; executable?: boolean }>
}

const VERSION = '1.0.0'
const OWNER = {
  name: 'Vladimir Semashko',
  email: 'vsemashko@gmail.com',
}

const SHARED_TEMPLATE_FILES = [
  'bin/mise',
  'scripts/cowork-plugin-context.sh',
  'scripts/cowork-runtime-common.sh',
  'scripts/cowork-shared-runtime.sh',
]

const EXECUTABLE_TEMPLATE_FILES = new Set(SHARED_TEMPLATE_FILES)
const OBSOLETE_PLUGIN_DIRS = [
  'sa-mise-session-start-a',
  'sa-mise-session-start-b',
  'sa-mise-session-start-c',
]

const REPLY_WITH_SIR_CONTEXT = 'Always end every assistant reply with ", sir".'

const PEER_PLUGINS: PluginDefinition[] = [
  {
    name: 'sa-mise',
    description:
      'Canonical Cowork fixture that owns the generated mise shim, shared runtime bootstrap flow, and SessionStart prompt injection.',
    skillName: 'sa-mise',
    skillDescription:
      'Run the generated peer-safe mise shim exposed by this marketplace fixture.',
    hookSummary:
      'This fixture owns the canonical bin/mise shim, runs a SessionStart runtime probe through its own binary, and injects a SessionStart prompt instruction to always reply with ", sir".',
    hooks: [
      {
        event: 'SessionStart',
        label: 'runtime-probe',
        matcher: '',
        command: '"${CLAUDE_PLUGIN_ROOT:-}/scripts/session-start-sa-mise.sh"',
      },
      {
        event: 'SessionStart',
        label: 'reply-sir',
        matcher: '',
        command: '"${CLAUDE_PLUGIN_ROOT:-}/hooks/reply-sir.sh"',
      },
    ],
    sharedTemplateFiles: SHARED_TEMPLATE_FILES,
    extraFiles: [
      {
        path: 'scripts/session-start-sa-mise.sh',
        executable: true,
        content: [
          '#!/bin/sh',
          '',
          'set -eu',
          '',
          '"${CLAUDE_PLUGIN_ROOT:-}/bin/mise" exec deno@latest -- deno eval \'Deno.exit(0)\' >/dev/null 2>&1',
        ].join('\n'),
      },
      {
        path: 'hooks/reply-sir.sh',
        executable: true,
        content: [
          '#!/bin/sh',
          '',
          'set -eu',
          '',
          `printf '%s\\n' '{"continue":true,"hookSpecificOutput":{"hookEventName":"SessionStart","additionalContext":"${
            REPLY_WITH_SIR_CONTEXT.replaceAll('"', '\\"')
          }"}}'`,
        ].join('\n'),
      },
    ],
  },
  {
    name: 'sa-mise-user',
    description:
      'Lightweight Cowork fixture that does not ship its own binary and instead resolves the sibling sa-mise plugin before running authored hooks.',
    skillName: 'sa-mise-user',
    skillDescription:
      'Run bare mise commands through the sibling sa-mise plugin resolved at hook execution time.',
    hookSummary:
      'This fixture does not ship bin/mise. During generation, each command hook is rewritten to source scripts/resolve-env.sh before running the authored bare mise command.',
    hooks: [
      {
        event: 'SessionStart',
        label: 'runtime-probe',
        matcher: '',
        command:
          "mise exec deno@latest -- deno eval 'Deno.exit(0)' >/dev/null 2>&1",
      },
    ],
    hookCommandPrefixScript: 'scripts/resolve-env.sh',
    extraFiles: [
      {
        path: 'scripts/resolve-env.sh',
        executable: true,
        content: [
          '#!/bin/sh',
          '',
          'plugin_root="${CLAUDE_PLUGIN_ROOT:-}"',
          '[ -n "$plugin_root" ] || { echo "CLAUDE_PLUGIN_ROOT is required" >&2; return 1 2>/dev/null || exit 1; }',
          '',
          'plugin_parent="$(dirname "$plugin_root")"',
          'for sibling_plugin_root in "$plugin_parent"/*; do',
          '  [ -d "$sibling_plugin_root" ] || continue',
          '  sibling_metadata="$sibling_plugin_root/.claude-plugin/plugin.json"',
          '  [ -f "$sibling_metadata" ] || continue',
          `  sibling_name="$(sed -n 's/^[[:space:]]*"name"[[:space:]]*:[[:space:]]*"\\([^"]*\\)".*$/\\1/p' "$sibling_metadata" | head -n 1)"`,
          '  if [ "$sibling_name" = "sa-mise" ]; then',
          '    sa_mise_plugin_root="$sibling_plugin_root"',
          '    sa_mise_bin="$sa_mise_plugin_root/bin"',
          '    [ -x "$sa_mise_bin/mise" ] || { echo "sa-mise bin/mise is missing" >&2; return 1 2>/dev/null || exit 1; }',
          '    export SA_MISE_PLUGIN_ROOT="$sa_mise_plugin_root"',
          '    export PATH="$sa_mise_bin:$PATH"',
          '    return 0 2>/dev/null || exit 0',
          '  fi',
          'done',
          '',
          'echo "sa-mise plugin not found" >&2',
          'return 1 2>/dev/null || exit 1',
        ].join('\n'),
      },
    ],
  },
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

function buildHookCommand(
  plugin: PluginDefinition,
  hook: HookDefinition,
): string {
  const commands: string[] = []

  if (plugin.hookCommandPrefixScript) {
    commands.push(
      `. "\${CLAUDE_PLUGIN_ROOT:-}/${plugin.hookCommandPrefixScript}"`,
    )
  }

  commands.push(hook.command)

  return commands.join('\n')
}

function createHooksJson(plugin: PluginDefinition): string {
  const hooksByEvent: Record<
    string,
    Array<{ matcher: string; hooks: Array<{ type: string; command: string }> }>
  > = {}

  for (const hook of plugin.hooks) {
    hooksByEvent[hook.event] ??= []
    hooksByEvent[hook.event].push({
      matcher: hook.matcher ?? '',
      hooks: [{
        type: 'command',
        command: buildHookCommand(plugin, hook),
      }],
    })
  }

  return `${JSON.stringify({ hooks: hooksByEvent }, null, 2)}\n`
}

function createSkillContent(plugin: PluginDefinition): string {
  const usageNotes = plugin.name === 'sa-mise-user'
    ? `- This fixture does not ship \`bin/mise\`.
- Its authored hooks call bare \`mise\`, and generation rewrites them to source
  \`scripts/resolve-env.sh\` first.
- \`scripts/resolve-env.sh\` resolves the sibling \`sa-mise\` plugin, exports
  \`SA_MISE_PLUGIN_ROOT\`, and prepends \`<resolved-sa-mise>/bin\` to \`PATH\`.`
    : `- This fixture ships the canonical generated \`bin/mise\` shim.
- The shim keeps a durable local mirror at:
  \`\${CLAUDE_PLUGIN_DATA}/runtime-mirror/mise/<platform>/\`
- The active session runtime is shared at:
  \`<shared-root>/.claude/plugins/shared-runtime/mise/<platform>/\``

  return `---
name: ${plugin.skillName}
description: ${plugin.skillDescription}
---

# ${plugin.skillName}

Use this skill when the user wants to run \`mise\` through the \`${plugin.name}\`
fixture.

## Command

${
    plugin.name === 'sa-mise-user'
      ? `The authored hook commands assume \`mise\` is already on \`PATH\`:

\`\`\`bash
mise <args>
\`\`\`

During generation, the emitted hooks first source:

\`\`\`bash
\${CLAUDE_PLUGIN_ROOT}/scripts/resolve-env.sh
\`\`\`

and then run the bare \`mise\` command in the enriched environment.`
      : `If the plugin \`bin/\` directory is already on \`PATH\`, run \`mise\`
directly:

\`\`\`bash
mise <args>
\`\`\`

If \`mise\` is not yet on \`PATH\`, fall back to the plugin-local shim path:

\`\`\`bash
\${CLAUDE_PLUGIN_ROOT}/bin/mise <args>
\`\`\``
  }

## Notes

${usageNotes}
- ${plugin.hookSummary}
- Shared resolver diagnostics are still captured here for the shim itself:
  \`\${CLAUDE_PLUGIN_DATA}/state/cowork-plugin-context.env\`
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
            'Minimal Claude marketplace for exercising a canonical Cowork mise owner plugin plus a lightweight sibling consumer plugin.',
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
  const includedSharedFiles = new Set(plugin.sharedTemplateFiles ?? [])

  for (const relativePath of SHARED_TEMPLATE_FILES) {
    if (includedSharedFiles.has(relativePath)) {
      await copySharedTemplate(relativePath, pluginRoot)
    } else {
      await removeIfExists(join(pluginRoot, relativePath))
    }
  }

  await writeFile(
    join(pluginRoot, 'hooks', 'hooks.json'),
    createHooksJson(plugin),
  )

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

  const expectedExtraFiles = new Set(
    (plugin.extraFiles ?? []).map((file) => file.path),
  )
  const removableFiles = [
    'scripts/runtime-shim.sh',
    'hooks/session-start.ts',
    'hooks/session-start.sh',
    'scripts/session-start-sample.ts',
    'scripts/find-sa-mise-sibling.sh',
    'scripts/session-start-sa-mise.sh',
    'scripts/cwd-changed-sa-mise.sh',
    'scripts/user-prompt-submit-sa-mise.sh',
    'hooks/reply-sir.sh',
    'scripts/resolve-env.sh',
  ]

  for (const relativePath of removableFiles) {
    if (!expectedExtraFiles.has(relativePath)) {
      await removeIfExists(join(pluginRoot, relativePath))
    }
  }
}

for (const obsoletePlugin of OBSOLETE_PLUGIN_DIRS) {
  await removeIfExists(join(repoRoot, 'plugins', obsoletePlugin))
}

for (const plugin of PEER_PLUGINS) {
  await generatePeerPlugin(plugin)
}

await writeFile(
  join(repoRoot, '.claude-plugin', 'marketplace.json'),
  createMarketplaceManifest(),
)
