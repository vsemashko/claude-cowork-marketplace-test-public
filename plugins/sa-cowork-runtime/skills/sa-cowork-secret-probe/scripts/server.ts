import { buildSecretProbeStatus } from '../../../shared/cowork-secret-probe.ts'
import { dirname, fromFileUrl, join } from '@std/path'

type JsonRpcId = string | number | null

interface JsonRpcRequest {
  jsonrpc: '2.0'
  id?: JsonRpcId
  method: string
  params?: Record<string, unknown>
}

function pluginRootFromScript(): string {
  const scriptDir = dirname(fromFileUrl(import.meta.url))
  return join(scriptDir, '..', '..', '..')
}

async function sendMessage(message: Record<string, unknown>): Promise<void> {
  const payload = JSON.stringify(message) + '\n'
  await Deno.stdout.write(new TextEncoder().encode(payload))
}

async function sendResult(id: JsonRpcId, result: Record<string, unknown>): Promise<void> {
  await sendMessage({ jsonrpc: '2.0', id, result })
}

async function sendError(id: JsonRpcId, code: number, message: string): Promise<void> {
  await sendMessage({ jsonrpc: '2.0', id, error: { code, message } })
}

async function handleRequest(request: JsonRpcRequest): Promise<void> {
  switch (request.method) {
    case 'initialize':
      await sendResult(request.id ?? null, {
        protocolVersion: '2024-11-05',
        capabilities: { tools: {} },
        serverInfo: {
          name: 'cowork-secret-probe',
          version: '1.0.0',
        },
      })
      return
    case 'notifications/initialized':
      return
    case 'ping':
      await sendResult(request.id ?? null, {})
      return
    case 'tools/list':
      await sendResult(request.id ?? null, {
        tools: [
          {
            name: 'status',
            description:
              'Reports whether mapped Cowork userConfig and inherited plugin option env vars are present. Returns hashes only, never raw secrets.',
            inputSchema: {
              type: 'object',
              properties: {},
              additionalProperties: false,
            },
          },
        ],
      })
      return
    case 'tools/call': {
      const toolName = typeof request.params?.name === 'string' ? request.params.name : ''
      if (toolName !== 'status') {
        await sendError(request.id ?? null, -32602, `Unknown tool: ${toolName}`)
        return
      }

      const status = await buildSecretProbeStatus({
        ...Deno.env.toObject(),
        SA_COWORK_PLUGIN_ROOT: pluginRootFromScript(),
      })

      await sendResult(request.id ?? null, {
        content: [
          {
            type: 'text',
            text: JSON.stringify(status, null, 2),
          },
        ],
      })
      return
    }
    default:
      await sendError(request.id ?? null, -32601, `Method not found: ${request.method}`)
  }
}

async function main(): Promise<void> {
  const reader = Deno.stdin.readable
    .pipeThrough(new TextDecoderStream())
    .pipeThrough(new TextLineStream())

  for await (const line of reader) {
    if (!line.trim()) continue

    let request: JsonRpcRequest
    try {
      request = JSON.parse(line) as JsonRpcRequest
    } catch {
      await sendError(null, -32700, 'Invalid JSON')
      continue
    }

    await handleRequest(request)
  }
}

if (import.meta.main) {
  await main()
}
