import { ensureDir, exists } from '@std/fs'
import { dirname, join } from '@std/path'

export interface SecretStoreContext {
  env: Record<string, string>
  now?: Date
}

export interface SecretFileStatus {
  observedAt: string
  pluginDataDir: string
  secretRoot: string
  secretFile: string
  secretExists: boolean
  secretBytes?: number
  secretHash?: string
  secretPreview?: string
  runtimeCacheRoot: string
  runtimeCacheExists: boolean
  runtimeCacheFiles: {
    runtimeEnv: boolean
    stash: boolean
    mise: boolean
    deno: boolean
  }
  inheritedPluginOptionEnv: {
    label?: string
    tokenPresent: boolean
    tokenHash?: string
  }
}

const SECRET_DIR = 'secret-smoke'
const SECRET_FILE = 'persisted-secret.txt'

export function getPluginDataDir(env: Record<string, string>): string {
  const pluginDataDir = env.CLAUDE_PLUGIN_DATA?.trim() || env.SA_COWORK_PLUGIN_DATA?.trim()
  if (!pluginDataDir) {
    throw new Error('CLAUDE_PLUGIN_DATA (or SA_COWORK_PLUGIN_DATA) is required.')
  }
  return pluginDataDir
}

export function getSecretRoot(pluginDataDir: string): string {
  return join(pluginDataDir, SECRET_DIR)
}

export function getPersistedSecretPath(pluginDataDir: string): string {
  return join(getSecretRoot(pluginDataDir), SECRET_FILE)
}

export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

function previewSecret(secret: string): string {
  if (secret.length <= 4) return '*'.repeat(secret.length || 1)
  return `${secret.slice(0, 2)}***${secret.slice(-2)}`
}

async function readPersistedSecret(secretFile: string): Promise<string | undefined> {
  try {
    const raw = await Deno.readTextFile(secretFile)
    return raw.replace(/\r?\n$/, '')
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) return undefined
    throw error
  }
}

async function observeToken(label: string | undefined, token: string | undefined) {
  const normalizedToken = token?.trim() || undefined
  return {
    label: label?.trim() || undefined,
    tokenPresent: Boolean(normalizedToken),
    tokenHash: normalizedToken ? await sha256Hex(normalizedToken) : undefined,
  }
}

export async function buildSecretFileStatus(
  env: Record<string, string>,
  now: Date = new Date(),
): Promise<SecretFileStatus> {
  const pluginDataDir = getPluginDataDir(env)
  const secretRoot = getSecretRoot(pluginDataDir)
  const secretFile = getPersistedSecretPath(pluginDataDir)
  const runtimeCacheRoot = join(pluginDataDir, 'cowork-runtime')
  const secret = await readPersistedSecret(secretFile)
  const secretExists = secret !== undefined

  return {
    observedAt: now.toISOString(),
    pluginDataDir,
    secretRoot,
    secretFile,
    secretExists,
    secretBytes: secretExists ? new TextEncoder().encode(secret).byteLength : undefined,
    secretHash: secretExists ? await sha256Hex(secret) : undefined,
    secretPreview: secretExists ? previewSecret(secret) : undefined,
    runtimeCacheRoot,
    runtimeCacheExists: await exists(runtimeCacheRoot),
    runtimeCacheFiles: {
      runtimeEnv: await exists(join(runtimeCacheRoot, 'runtime.env')),
      stash: await exists(join(runtimeCacheRoot, 'bin', 'stash')),
      mise: await exists(join(runtimeCacheRoot, 'bin', 'mise')),
      deno: await exists(join(runtimeCacheRoot, 'bin', 'deno')),
    },
    inheritedPluginOptionEnv: await observeToken(
      env.CLAUDE_PLUGIN_OPTION_SMOKE_LABEL,
      env.CLAUDE_PLUGIN_OPTION_SMOKE_TOKEN,
    ),
  }
}

export async function writePersistedSecret(secret: string, context: SecretStoreContext): Promise<string> {
  const pluginDataDir = getPluginDataDir(context.env)
  const secretFile = getPersistedSecretPath(pluginDataDir)

  await ensureDir(dirname(secretFile))
  await Deno.writeTextFile(secretFile, `${secret}\n`)

  const status = await buildSecretFileStatus(context.env, context.now)

  return [
    'Cowork secret file updated.',
    `file: ${status.secretFile}`,
    `exists: ${status.secretExists ? 'yes' : 'no'}`,
    `bytes: ${status.secretBytes ?? 0}`,
    `sha256: ${status.secretHash ?? 'missing'}`,
    `preview: ${status.secretPreview ?? 'missing'}`,
  ].join('\n')
}

export async function formatSecretStatus(context: SecretStoreContext): Promise<string> {
  const status = await buildSecretFileStatus(context.env, context.now)

  return [
    'Cowork secret status',
    `plugin data: ${status.pluginDataDir}`,
    `secret root: ${status.secretRoot}`,
    `secret file: ${status.secretFile}`,
    `secret exists: ${status.secretExists ? 'yes' : 'no'}`,
    `secret bytes: ${status.secretBytes ?? 0}`,
    `secret sha256: ${status.secretHash ?? 'missing'}`,
    `secret preview: ${status.secretPreview ?? 'missing'}`,
    `runtime cache: ${status.runtimeCacheRoot}`,
    `runtime cache exists: ${status.runtimeCacheExists ? 'yes' : 'no'}`,
    `runtime files: runtime.env=${status.runtimeCacheFiles.runtimeEnv ? 'yes' : 'no'}, stash=${status.runtimeCacheFiles.stash ? 'yes' : 'no'}, mise=${
      status.runtimeCacheFiles.mise ? 'yes' : 'no'
    }, deno=${status.runtimeCacheFiles.deno ? 'yes' : 'no'}`,
    `plugin option smoke token: ${status.inheritedPluginOptionEnv.tokenPresent ? 'present' : 'missing'}`,
    `plugin option smoke token hash: ${status.inheritedPluginOptionEnv.tokenHash ?? 'missing'}`,
  ].join('\n')
}

export async function resetPersistedSecret(context: SecretStoreContext): Promise<string> {
  const pluginDataDir = getPluginDataDir(context.env)
  const secretFile = getPersistedSecretPath(pluginDataDir)

  let removed = false
  try {
    await Deno.remove(secretFile)
    removed = true
  } catch (error) {
    if (!(error instanceof Deno.errors.NotFound)) throw error
  }

  const status = await buildSecretFileStatus(context.env, context.now)

  return [
    'Cowork secret reset complete.',
    `removed: ${removed ? 'yes' : 'no'}`,
    `file: ${secretFile}`,
    `secret exists now: ${status.secretExists ? 'yes' : 'no'}`,
  ].join('\n')
}
