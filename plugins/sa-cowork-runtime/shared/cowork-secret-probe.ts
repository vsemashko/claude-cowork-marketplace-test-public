import { getPersistedSecretPath, sha256Hex } from './cowork-secret-store.ts'

export interface SecretProbeStatus {
  serverName: string
  mode: string
  observedAt: string
  pluginDataDir?: string
  secretFile?: string
  persistedSecret: {
    exists: boolean
    preview?: string
    hash?: string
  }
  mappedEnv: {
    label?: string
    tokenPresent: boolean
    tokenHash?: string
  }
  pluginOptionEnv: {
    label?: string
    tokenPresent: boolean
    tokenHash?: string
  }
  notes: string[]
}

function previewSecret(secret: string): string {
  if (secret.length <= 4) return '*'.repeat(secret.length || 1)
  return `${secret.slice(0, 2)}***${secret.slice(-2)}`
}

async function observeSecret(
  label: string | undefined,
  token: string | undefined,
): Promise<{ label?: string; tokenPresent: boolean; tokenHash?: string }> {
  const normalizedLabel = label?.trim() || undefined
  const normalizedToken = token?.trim() || undefined

  return {
    label: normalizedLabel,
    tokenPresent: Boolean(normalizedToken),
    tokenHash: normalizedToken ? await sha256Hex(normalizedToken) : undefined,
  }
}

export async function buildSecretProbeStatus(
  env: Record<string, string>,
  now: Date = new Date(),
): Promise<SecretProbeStatus> {
  const pluginDataDir = env.CLAUDE_PLUGIN_DATA?.trim() || env.SA_COWORK_PLUGIN_DATA?.trim() || undefined
  const secretFile = env.SA_COWORK_SECRET_FILE?.trim() || (pluginDataDir ? getPersistedSecretPath(pluginDataDir) : undefined)
  let persistedSecret: SecretProbeStatus['persistedSecret'] = { exists: false }

  if (secretFile) {
    try {
      const secret = (await Deno.readTextFile(secretFile)).replace(/\r?\n$/, '')
      persistedSecret = {
        exists: true,
        preview: previewSecret(secret),
        hash: await sha256Hex(secret),
      }
    } catch (error) {
      if (!(error instanceof Deno.errors.NotFound)) throw error
    }
  }

  const notes: string[] = []
  if (env.SA_COWORK_MAPPED_TOKEN?.trim()) notes.push('mapped env token present')
  if (env.CLAUDE_PLUGIN_OPTION_SMOKE_TOKEN?.trim()) notes.push('plugin option token present')
  if (persistedSecret.exists) notes.push('persisted secret file present')

  return {
    serverName: env.SA_COWORK_PROBE_NAME?.trim() || 'unknown-probe',
    mode: env.SA_COWORK_PROBE_MODE?.trim() || 'unknown',
    observedAt: now.toISOString(),
    pluginDataDir,
    secretFile,
    persistedSecret,
    mappedEnv: await observeSecret(env.SA_COWORK_MAPPED_LABEL, env.SA_COWORK_MAPPED_TOKEN),
    pluginOptionEnv: await observeSecret(
      env.CLAUDE_PLUGIN_OPTION_SMOKE_LABEL,
      env.CLAUDE_PLUGIN_OPTION_SMOKE_TOKEN,
    ),
    notes,
  }
}
