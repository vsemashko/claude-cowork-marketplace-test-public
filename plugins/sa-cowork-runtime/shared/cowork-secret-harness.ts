import { parseArgs } from 'jsr:@std/cli/parse-args'
import { ensureDir, exists } from '@std/fs'
import { dirname, join } from '@std/path'

type FormTarget = 'env-file' | 'json-file'
type ConfigTarget = 'claude-settings-mcp' | 'stash-setting'
type SecretCommand =
  | { kind: 'form'; label: string; target: FormTarget; secret: string }
  | { kind: 'config'; label: string; target: ConfigTarget; secret: string }
  | { kind: 'connector' }
  | { kind: 'status' }
  | { kind: 'reset' }

interface UserConfigObservation {
  label?: string
  tokenPresent: boolean
  tokenHash?: string
  observedAt: string
}

interface FormRecord {
  label: string
  target: FormTarget
  targetPath: string
  secretHash: string
  updatedAt: string
}

interface ConfigRecord {
  label: string
  target: ConfigTarget
  secretHash: string
  updatedAt: string
  targetPath?: string
  entryName?: string
  settingName?: string
}

interface ConnectorCheckRecord {
  checkedAt: string
  searchedPaths: string[]
  remoteServers: Array<{ name: string; location: string; url?: string; transport?: string }>
}

interface ManualCleanupRecord {
  type: 'stash-setting'
  label: string
  settingName: string
}

interface HarnessState {
  version: 1
  updatedAt: string
  userConfigObservation?: UserConfigObservation
  formTests: FormRecord[]
  configTests: ConfigRecord[]
  connectorChecks: ConnectorCheckRecord[]
  pendingManualCleanup: ManualCleanupRecord[]
}

export interface HarnessContext {
  cwd: string
  env: Record<string, string>
  now: Date
  runCommand: (command: string, args: string[], env: Record<string, string>) => Promise<CommandResult>
}

interface CommandResult {
  success: boolean
  stdout: string
  stderr: string
}

const TEST_HOME_DIR = '.sa-cowork-secret-harness'
const STATE_DIR = 'secret-harness'
const STATE_FILE = 'state.json'
const FORM_TARGETS = new Set<FormTarget>(['env-file', 'json-file'])
const CONFIG_TARGETS = new Set<ConfigTarget>(['claude-settings-mcp', 'stash-setting'])

function defaultContext(): HarnessContext {
  return {
    cwd: Deno.cwd(),
    env: Deno.env.toObject(),
    now: new Date(),
    runCommand: runCommand,
  }
}

async function runCommand(command: string, args: string[], env: Record<string, string>): Promise<CommandResult> {
  const result = await new Deno.Command(command, {
    args,
    env,
    stdout: 'piped',
    stderr: 'piped',
  }).output()

  return {
    success: result.success,
    stdout: new TextDecoder().decode(result.stdout).trim(),
    stderr: new TextDecoder().decode(result.stderr).trim(),
  }
}

function getHomeDir(env: Record<string, string>): string {
  const homeDir = env.HOME?.trim()
  if (!homeDir) {
    throw new Error('HOME is required for Cowork secret harness tests.')
  }
  return homeDir
}

function getPluginDataDir(env: Record<string, string>): string {
  const pluginDataDir = env.CLAUDE_PLUGIN_DATA?.trim() || env.SA_COWORK_PLUGIN_DATA?.trim()
  if (!pluginDataDir) {
    throw new Error('CLAUDE_PLUGIN_DATA (or SA_COWORK_PLUGIN_DATA) is required for Cowork secret harness state.')
  }
  return pluginDataDir
}

function getHarnessHomeDir(homeDir: string): string {
  return join(homeDir, TEST_HOME_DIR)
}

function getStatePath(pluginDataDir: string): string {
  return join(pluginDataDir, STATE_DIR, STATE_FILE)
}

function defaultState(now: string): HarnessState {
  return {
    version: 1,
    updatedAt: now,
    formTests: [],
    configTests: [],
    connectorChecks: [],
    pendingManualCleanup: [],
  }
}

async function loadState(statePath: string, now: string): Promise<HarnessState> {
  try {
    const raw = await Deno.readTextFile(statePath)
    const parsed = JSON.parse(raw) as Partial<HarnessState>
    return {
      ...defaultState(now),
      ...parsed,
      formTests: parsed.formTests ?? [],
      configTests: parsed.configTests ?? [],
      connectorChecks: parsed.connectorChecks ?? [],
      pendingManualCleanup: parsed.pendingManualCleanup ?? [],
    }
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) {
      return defaultState(now)
    }
    throw error
  }
}

async function saveState(statePath: string, state: HarnessState): Promise<void> {
  await ensureDir(dirname(statePath))
  await Deno.writeTextFile(statePath, JSON.stringify(state, null, 2) + '\n')
}

function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'default'
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

function upsertByLabelAndTarget<T extends { label: string; target: string }>(records: T[], next: T): T[] {
  const filtered = records.filter((record) => !(record.label === next.label && record.target === next.target))
  filtered.push(next)
  return filtered
}

function uniqueManualCleanup(records: ManualCleanupRecord[]): ManualCleanupRecord[] {
  return records.filter((record, index) =>
    records.findIndex((candidate) => candidate.type === record.type && candidate.settingName === record.settingName) === index
  )
}

async function observeOptionalUserConfig(env: Record<string, string>, now: string): Promise<UserConfigObservation | undefined> {
  const label = env.CLAUDE_PLUGIN_OPTION_SMOKE_LABEL?.trim()
  const token = env.CLAUDE_PLUGIN_OPTION_SMOKE_TOKEN?.trim()

  if (!label && !token) return undefined

  return {
    label: label || undefined,
    tokenPresent: Boolean(token),
    tokenHash: token ? await sha256Hex(token) : undefined,
    observedAt: now,
  }
}

async function ensureHarnessHomeDir(homeDir: string): Promise<string> {
  const harnessHomeDir = getHarnessHomeDir(homeDir)
  await ensureDir(harnessHomeDir)
  return harnessHomeDir
}

function formTargetPath(homeDir: string, label: string, target: FormTarget): string {
  const slug = slugify(label)
  const extension = target === 'env-file' ? 'env' : 'json'
  return join(getHarnessHomeDir(homeDir), `form-${slug}.${extension}`)
}

async function writeFormTarget(homeDir: string, label: string, target: FormTarget, secret: string, now: string): Promise<string> {
  const targetPath = formTargetPath(homeDir, label, target)
  await ensureHarnessHomeDir(homeDir)

  if (target === 'env-file') {
    await Deno.writeTextFile(
      targetPath,
      [
        `SA_COWORK_SECRET_LABEL=${label}`,
        `SA_COWORK_SECRET=${secret}`,
        `SA_COWORK_UPDATED_AT=${now}`,
        '',
      ].join('\n'),
    )
  } else {
    await Deno.writeTextFile(
      targetPath,
      JSON.stringify({ label, secret, updatedAt: now }, null, 2) + '\n',
    )
  }

  return targetPath
}

async function readFormTargetSecret(targetPath: string, target: FormTarget): Promise<string | null> {
  try {
    const raw = await Deno.readTextFile(targetPath)
    if (target === 'env-file') {
      const match = raw.match(/^SA_COWORK_SECRET=(.*)$/m)
      return match?.[1] ?? null
    }
    const parsed = JSON.parse(raw) as { secret?: string }
    return parsed.secret ?? null
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) return null
    throw error
  }
}

function getClaudeSettingsPath(homeDir: string): string {
  return join(homeDir, '.claude', 'settings.json')
}

async function readJsonRecord(path: string): Promise<Record<string, unknown>> {
  try {
    const raw = await Deno.readTextFile(path)
    return JSON.parse(raw) as Record<string, unknown>
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) return {}
    throw error
  }
}

async function writeJsonRecord(path: string, value: Record<string, unknown>): Promise<void> {
  await ensureDir(dirname(path))
  await Deno.writeTextFile(path, JSON.stringify(value, null, 2) + '\n')
}

function buildManagedMcpEntry(label: string, secret: string): Record<string, unknown> {
  return {
    url: 'https://example.invalid/mcp',
    enabled: false,
    headers: {
      Authorization: `Bearer ${secret}`,
      'X-SA-Cowork-Label': label,
    },
  }
}

async function writeClaudeSettingsMcpEntry(homeDir: string, label: string, secret: string): Promise<{ path: string; entryName: string }> {
  const settingsPath = getClaudeSettingsPath(homeDir)
  const settings = await readJsonRecord(settingsPath)
  const entryName = `sa-cowork-secret-test-${slugify(label)}`
  const mcpServers = (settings.mcpServers as Record<string, unknown> | undefined) ?? {}
  mcpServers[entryName] = buildManagedMcpEntry(label, secret)
  settings.mcpServers = mcpServers
  await writeJsonRecord(settingsPath, settings)
  return { path: settingsPath, entryName }
}

async function readClaudeSettingsMcpSecret(path: string, entryName: string): Promise<string | null> {
  try {
    const settings = JSON.parse(await Deno.readTextFile(path)) as { mcpServers?: Record<string, { headers?: Record<string, string> }> }
    const authHeader = settings.mcpServers?.[entryName]?.headers?.Authorization
    if (!authHeader) return null
    return authHeader.startsWith('Bearer ') ? authHeader.slice('Bearer '.length) : authHeader
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) return null
    throw error
  }
}

async function removeClaudeSettingsMcpEntry(path: string, entryName: string): Promise<boolean> {
  const settings = await readJsonRecord(path)
  const mcpServers = (settings.mcpServers as Record<string, unknown> | undefined) ?? {}
  if (!(entryName in mcpServers)) return false

  delete mcpServers[entryName]
  if (Object.keys(mcpServers).length === 0) {
    delete settings.mcpServers
  } else {
    settings.mcpServers = mcpServers
  }
  await writeJsonRecord(path, settings)
  return true
}

function stashSettingName(label: string): string {
  return `coworkSecretHarness_${slugify(label).replace(/-/g, '_')}`
}

async function setStashSetting(
  ctx: HarnessContext,
  label: string,
  secret: string,
): Promise<{ settingName: string }> {
  const settingName = stashSettingName(label)
  const result = await ctx.runCommand('stash', ['settings', 'set', settingName, secret], ctx.env)
  if (!result.success) {
    throw new Error(`Failed to write stash setting ${settingName}: ${result.stderr || result.stdout}`)
  }
  return { settingName }
}

async function getStashSetting(ctx: HarnessContext, settingName: string): Promise<string | null> {
  const result = await ctx.runCommand('stash', ['settings', 'get', settingName], ctx.env)
  if (!result.success) return null

  const line = result.stdout.split('\n').find((candidate) => candidate.startsWith(`${settingName}:`))
  if (!line) return null

  const value = line.slice(`${settingName}:`.length).trim()
  if (!value || value === 'null') return null
  return value
}

function detectPlatform(ctx: HarnessContext): string {
  return ctx.env.SA_COWORK_FORCE_PLATFORM?.trim() || Deno.build.os + '-' + Deno.build.arch
}

function getRuntimeCacheRoot(ctx: HarnessContext): string {
  return join(getPluginDataDir(ctx.env), 'cowork-runtime')
}

async function inspectRemoteConnectors(ctx: HarnessContext): Promise<ConnectorCheckRecord> {
  const homeDir = getHomeDir(ctx.env)
  const candidatePaths = [
    join(ctx.cwd, '.mcp.json'),
    getClaudeSettingsPath(homeDir),
  ]

  const remoteServers: ConnectorCheckRecord['remoteServers'] = []
  for (const candidatePath of candidatePaths) {
    try {
      const raw = await Deno.readTextFile(candidatePath)
      const parsed = JSON.parse(raw) as { mcpServers?: Record<string, Record<string, unknown>> }
      const mcpServers = parsed.mcpServers ?? {}
      for (const [name, config] of Object.entries(mcpServers)) {
        const url = typeof config.url === 'string' ? config.url : undefined
        const transport = typeof config.transport === 'string' ? config.transport : typeof config.type === 'string' ? config.type : undefined
        const remote = Boolean(url?.startsWith('http://') || url?.startsWith('https://')) ||
          transport === 'http' || transport === 'https' || transport === 'sse'
        if (remote) {
          remoteServers.push({ name, location: candidatePath, url, transport })
        }
      }
    } catch (error) {
      if (!(error instanceof Deno.errors.NotFound)) throw error
    }
  }

  return {
    checkedAt: ctx.now.toISOString(),
    searchedPaths: candidatePaths,
    remoteServers,
  }
}

function formatHash(hash?: string | null): string {
  if (!hash) return 'n/a'
  return `${hash.slice(0, 12)}…`
}

async function handleFormCommand(command: Extract<SecretCommand, { kind: 'form' }>, ctx: HarnessContext, state: HarnessState): Promise<string> {
  const now = ctx.now.toISOString()
  const homeDir = getHomeDir(ctx.env)
  const targetPath = await writeFormTarget(homeDir, command.label, command.target, command.secret, now)
  const secretHash = await sha256Hex(command.secret)
  state.formTests = upsertByLabelAndTarget(state.formTests, {
    label: command.label,
    target: command.target,
    targetPath,
    secretHash,
    updatedAt: now,
  })

  return [
    'Cowork secret form bridge complete.',
    `Label: ${command.label}`,
    `Target: ${command.target}`,
    `Path: ${targetPath}`,
    `Secret hash: ${formatHash(secretHash)}`,
    'At rest: secret stored only in the target file; plugin data keeps hash metadata only.',
  ].join('\n')
}

async function handleConfigCommand(command: Extract<SecretCommand, { kind: 'config' }>, ctx: HarnessContext, state: HarnessState): Promise<string> {
  const now = ctx.now.toISOString()
  const secretHash = await sha256Hex(command.secret)

  if (command.target === 'claude-settings-mcp') {
    const { path, entryName } = await writeClaudeSettingsMcpEntry(getHomeDir(ctx.env), command.label, command.secret)
    state.configTests = upsertByLabelAndTarget(state.configTests, {
      label: command.label,
      target: command.target,
      targetPath: path,
      entryName,
      secretHash,
      updatedAt: now,
    })

    return [
      'Cowork secret config bridge complete.',
      `Label: ${command.label}`,
      'Target: claude-settings-mcp',
      `Settings file: ${path}`,
      `Entry: ${entryName}`,
      `Secret hash: ${formatHash(secretHash)}`,
      'Cleanup: supported via /sa-cowork-secret-reset.',
    ].join('\n')
  }

  const { settingName } = await setStashSetting(ctx, command.label, command.secret)
  state.configTests = upsertByLabelAndTarget(state.configTests, {
    label: command.label,
    target: command.target,
    settingName,
    secretHash,
    updatedAt: now,
  })
  state.pendingManualCleanup = uniqueManualCleanup([
    ...state.pendingManualCleanup,
    { type: 'stash-setting', label: command.label, settingName },
  ])

  return [
    'Cowork secret config bridge complete.',
    `Label: ${command.label}`,
    'Target: stash-setting',
    `Setting: ${settingName}`,
    `Secret hash: ${formatHash(secretHash)}`,
    'Cleanup: manual. stash settings does not expose delete, so reset will keep a reminder only.',
  ].join('\n')
}

async function handleConnectorCommand(ctx: HarnessContext, state: HarnessState): Promise<string> {
  const record = await inspectRemoteConnectors(ctx)
  state.connectorChecks.push(record)

  if (record.remoteServers.length === 0) {
    return [
      'No remote MCP/custom connectors found in the known Cowork config files.',
      `Searched: ${record.searchedPaths.join(', ')}`,
      'Recommended org-managed path: add a remote MCP/custom connector centrally and let each user complete per-user auth through Cowork Connect.',
    ].join('\n')
  }

  return [
    'Remote MCP/custom connectors detected.',
    ...record.remoteServers.map((server) => `- ${server.name}: ${server.url ?? server.transport ?? 'remote transport'} (${server.location})`),
    'Expected auth path: org owner adds the connector, then each user connects through Cowork.',
  ].join('\n')
}

async function computeFormStatus(record: FormRecord): Promise<string> {
  const currentSecret = await readFormTargetSecret(record.targetPath, record.target)
  const currentHash = currentSecret ? await sha256Hex(currentSecret) : null
  const matches = currentHash === record.secretHash
  return `- form ${record.label} (${record.target}): ${currentSecret ? 'present' : 'missing'} at ${record.targetPath}; hash=${
    formatHash(record.secretHash)
  }; matches=${matches ? 'yes' : 'no'}`
}

async function computeConfigStatus(record: ConfigRecord, ctx: HarnessContext): Promise<string> {
  if (record.target === 'claude-settings-mcp') {
    const currentSecret = record.targetPath && record.entryName ? await readClaudeSettingsMcpSecret(record.targetPath, record.entryName) : null
    const currentHash = currentSecret ? await sha256Hex(currentSecret) : null
    const matches = currentHash === record.secretHash
    return `- config ${record.label} (claude-settings-mcp): ${
      currentSecret ? 'present' : 'missing'
    } in ${record.targetPath}#${record.entryName}; hash=${formatHash(record.secretHash)}; matches=${matches ? 'yes' : 'no'}`
  }

  const currentSecret = record.settingName ? await getStashSetting(ctx, record.settingName) : null
  const currentHash = currentSecret ? await sha256Hex(currentSecret) : null
  const matches = currentHash === record.secretHash
  return `- config ${record.label} (stash-setting): ${currentSecret ? 'present' : 'missing'} in ${record.settingName}; hash=${
    formatHash(record.secretHash)
  }; matches=${matches ? 'yes' : 'no'}; cleanup=manual`
}

async function handleStatusCommand(ctx: HarnessContext, state: HarnessState): Promise<string> {
  const cacheRoot = getRuntimeCacheRoot(ctx)
  const runtimeEnvPath = join(cacheRoot, 'runtime.env')
  const binaries = {
    stash: await exists(join(cacheRoot, 'bin', 'stash')),
    mise: await exists(join(cacheRoot, 'bin', 'mise')),
    deno: await exists(join(cacheRoot, 'bin', 'deno')),
  }

  const lines = [
    'Cowork secret harness status',
    `- platform: ${detectPlatform(ctx)}`,
    `- cache root: ${cacheRoot}`,
    `- cache runtime metadata: ${await exists(runtimeEnvPath) ? 'present' : 'missing'}`,
    `- cached binaries: stash=${binaries.stash ? 'yes' : 'no'}, mise=${binaries.mise ? 'yes' : 'no'}, deno=${binaries.deno ? 'yes' : 'no'}`,
  ]

  const observation = state.userConfigObservation
  if (observation) {
    lines.push(
      `- optional userConfig observation: label=${observation.label ?? 'n/a'}, token=${observation.tokenPresent ? 'present' : 'missing'}, hash=${
        formatHash(observation.tokenHash)
      }`,
    )
  } else {
    lines.push('- optional userConfig observation: not observed')
  }

  if (state.formTests.length === 0) {
    lines.push('- form tests: none')
  } else {
    for (const record of state.formTests) {
      lines.push(await computeFormStatus(record))
    }
  }

  if (state.configTests.length === 0) {
    lines.push('- config tests: none')
  } else {
    for (const record of state.configTests) {
      lines.push(await computeConfigStatus(record, ctx))
    }
  }

  const latestConnectorCheck = state.connectorChecks.at(-1)
  if (!latestConnectorCheck) {
    lines.push('- connector checks: none')
  } else if (latestConnectorCheck.remoteServers.length === 0) {
    lines.push(`- connector checks: last scan ${latestConnectorCheck.checkedAt}, no remote connectors found`)
  } else {
    lines.push(`- connector checks: last scan ${latestConnectorCheck.checkedAt}`)
    for (const server of latestConnectorCheck.remoteServers) {
      lines.push(`  remote ${server.name}: ${server.url ?? server.transport ?? 'remote transport'} (${server.location})`)
    }
  }

  if (state.pendingManualCleanup.length > 0) {
    lines.push('- pending manual cleanup:')
    for (const record of state.pendingManualCleanup) {
      lines.push(`  stash setting ${record.settingName} for label ${record.label}`)
    }
  }

  return lines.join('\n')
}

async function handleResetCommand(_ctx: HarnessContext, state: HarnessState): Promise<string> {
  const removed: string[] = []
  const keptManualCleanup = uniqueManualCleanup(state.pendingManualCleanup)

  for (const record of state.formTests) {
    try {
      await Deno.remove(record.targetPath)
      removed.push(record.targetPath)
    } catch (error) {
      if (!(error instanceof Deno.errors.NotFound)) throw error
    }
  }

  for (const record of state.configTests) {
    if (record.target === 'claude-settings-mcp' && record.targetPath && record.entryName) {
      const didRemove = await removeClaudeSettingsMcpEntry(record.targetPath, record.entryName)
      if (didRemove) {
        removed.push(`${record.targetPath}#${record.entryName}`)
      }
    }
  }

  state.formTests = []
  state.configTests = state.configTests.filter((record) => record.target === 'stash-setting')
  state.pendingManualCleanup = uniqueManualCleanup([
    ...keptManualCleanup,
    ...state.configTests
      .filter((record) => record.target === 'stash-setting' && record.settingName)
      .map((record) => ({
        type: 'stash-setting' as const,
        label: record.label,
        settingName: record.settingName!,
      })),
  ])

  const lines = [
    'Cowork secret harness reset complete.',
    `Removed ${removed.length} test-owned target(s).`,
  ]

  for (const path of removed) {
    lines.push(`- removed ${path}`)
  }

  if (state.pendingManualCleanup.length > 0) {
    lines.push('Manual cleanup still required for stash settings:')
    for (const record of state.pendingManualCleanup) {
      lines.push(`- stash settings get ${record.settingName}`)
    }
  }

  return lines.join('\n')
}

export async function executeSecretHarness(
  command: SecretCommand,
  inputContext: Partial<HarnessContext> = {},
): Promise<string> {
  const defaults = defaultContext()
  const ctx: HarnessContext = {
    ...defaults,
    ...inputContext,
    env: inputContext.env ?? defaults.env,
    cwd: inputContext.cwd ?? defaults.cwd,
    now: inputContext.now ?? defaults.now,
    runCommand: inputContext.runCommand ?? defaults.runCommand,
  }
  const now = ctx.now.toISOString()
  const statePath = getStatePath(getPluginDataDir(ctx.env))
  const state = await loadState(statePath, now)
  state.updatedAt = now

  const observation = await observeOptionalUserConfig(ctx.env, now)
  if (observation) {
    state.userConfigObservation = observation
  }

  let output: string
  switch (command.kind) {
    case 'form':
      output = await handleFormCommand(command, ctx, state)
      break
    case 'config':
      output = await handleConfigCommand(command, ctx, state)
      break
    case 'connector':
      output = await handleConnectorCommand(ctx, state)
      break
    case 'status':
      output = await handleStatusCommand(ctx, state)
      break
    case 'reset':
      output = await handleResetCommand(ctx, state)
      break
  }

  await saveState(statePath, state)
  return output
}

function parseSecretCommand(argv: string[]): SecretCommand {
  const parsed = parseArgs(argv, {
    string: ['label', 'target', 'secret'],
    boolean: ['help'],
    alias: { h: 'help' },
  })

  if (parsed.help) {
    throw new Error('Usage: <form|config|connector|status|reset> [--label <label>] [--target <target>] [--secret <secret>]')
  }

  const [subcommand] = parsed._
  if (typeof subcommand !== 'string') {
    throw new Error('A secret harness subcommand is required.')
  }

  switch (subcommand) {
    case 'form':
      if (typeof parsed.label !== 'string' || typeof parsed.secret !== 'string') {
        throw new Error('form requires --label and --secret.')
      }
      if (parsed.target !== undefined && (typeof parsed.target !== 'string' || !FORM_TARGETS.has(parsed.target as FormTarget))) {
        throw new Error('form supports only --target env-file or json-file.')
      }
      return {
        kind: 'form',
        label: parsed.label,
        target: (typeof parsed.target === 'string' ? parsed.target : 'env-file') as FormTarget,
        secret: parsed.secret,
      }
    case 'config':
      if (typeof parsed.label !== 'string' || typeof parsed.secret !== 'string') {
        throw new Error('config requires --label and --secret.')
      }
      if (
        parsed.target !== undefined &&
        (typeof parsed.target !== 'string' || !CONFIG_TARGETS.has(parsed.target as ConfigTarget))
      ) {
        throw new Error('config supports only --target claude-settings-mcp or stash-setting.')
      }
      return {
        kind: 'config',
        label: parsed.label,
        target: (typeof parsed.target === 'string' ? parsed.target : 'claude-settings-mcp') as ConfigTarget,
        secret: parsed.secret,
      }
    case 'connector':
      return { kind: 'connector' }
    case 'status':
      return { kind: 'status' }
    case 'reset':
      return { kind: 'reset' }
    default:
      throw new Error(`Unknown secret harness subcommand: ${subcommand}`)
  }
}

export async function main(argv = Deno.args): Promise<void> {
  const command = parseSecretCommand(argv)
  const output = await executeSecretHarness(command)
  console.log(output)
}

if (import.meta.main) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error))
    Deno.exit(1)
  })
}
