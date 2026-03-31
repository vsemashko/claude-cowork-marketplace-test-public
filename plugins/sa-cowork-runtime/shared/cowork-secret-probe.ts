import { exists } from '@std/fs'
import { join } from '@std/path'

export interface SecretProbeStatus {
  observedAt: string
  pluginDataDir?: string
  cacheRoot?: string
  cacheFiles: {
    runtimeEnv: boolean
    stash: boolean
    mise: boolean
    deno: boolean
  }
  mappedUserConfig: {
    label?: string
    tokenPresent: boolean
    tokenHash?: string
  }
  inheritedPluginOptionEnv: {
    label?: string
    tokenPresent: boolean
    tokenHash?: string
  }
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, '0')).join('')
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
  const cacheRoot = pluginDataDir ? join(pluginDataDir, 'cowork-runtime') : undefined

  return {
    observedAt: now.toISOString(),
    pluginDataDir,
    cacheRoot,
    cacheFiles: {
      runtimeEnv: cacheRoot ? await exists(join(cacheRoot, 'runtime.env')) : false,
      stash: cacheRoot ? await exists(join(cacheRoot, 'bin', 'stash')) : false,
      mise: cacheRoot ? await exists(join(cacheRoot, 'bin', 'mise')) : false,
      deno: cacheRoot ? await exists(join(cacheRoot, 'bin', 'deno')) : false,
    },
    mappedUserConfig: await observeSecret(env.SA_COWORK_SMOKE_LABEL, env.SA_COWORK_SMOKE_TOKEN),
    inheritedPluginOptionEnv: await observeSecret(
      env.CLAUDE_PLUGIN_OPTION_SMOKE_LABEL,
      env.CLAUDE_PLUGIN_OPTION_SMOKE_TOKEN,
    ),
  }
}
