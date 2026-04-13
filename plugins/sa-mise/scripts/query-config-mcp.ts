const SERVER_NAME = 'sa-cowork-config-mcp'
const PROTOCOL_VERSION = '2024-11-05'

type StdioServerConfig = {
  command?: string
  args?: string[]
  env?: Record<string, string>
  type?: string
}

type ClaudeMcpConfig = {
  mcpServers?: Record<string, StdioServerConfig>
}

type JsonRpcMessage = {
  id?: number
  method?: string
  params?: unknown
  result?: unknown
  error?: { code?: number; message?: string }
}

function emit(lines: string[]): void {
  console.log('mcp_config_source=direct-mcp')
  for (const line of lines) {
    console.log(line)
  }
}

function emitMissing(): void {
  emit(['mcp_status=missing'])
}

function emitError(reason: string): void {
  emit([`mcp_status=error`, `mcp_error=${reason}`])
}

function sanitizeError(reason: string): string {
  return reason.replace(/[^a-zA-Z0-9._-]+/g, '_').replace(/^_+|_+$/g, '') ||
    'unknown_error'
}

async function readClaudeConfig(): Promise<ClaudeMcpConfig | null> {
  const home = Deno.env.get('SA_MISE_ORIGINAL_HOME') ?? Deno.env.get('HOME')
  if (!home) return null

  const configPath = `${home}/.claude.json`
  try {
    const text = await Deno.readTextFile(configPath)
    return JSON.parse(text) as ClaudeMcpConfig
  } catch {
    return null
  }
}

function encodeMessage(message: Record<string, unknown>): Uint8Array {
  const body = new TextEncoder().encode(JSON.stringify(message))
  const header = new TextEncoder().encode(
    `Content-Length: ${body.length}\r\n\r\n`,
  )
  const framed = new Uint8Array(header.length + body.length)
  framed.set(header, 0)
  framed.set(body, header.length)
  return framed
}

class MessageReader {
  #reader: ReadableStreamDefaultReader<Uint8Array>
  #buffer = new Uint8Array()

  constructor(reader: ReadableStreamDefaultReader<Uint8Array>) {
    this.#reader = reader
  }

  async next(): Promise<JsonRpcMessage | null> {
    while (true) {
      const message = this.#tryParse()
      if (message) return message

      const chunk = await this.#reader.read()
      if (chunk.done) {
        return this.#tryParse()
      }
      this.#append(chunk.value)
    }
  }

  #append(chunk: Uint8Array): void {
    const merged = new Uint8Array(this.#buffer.length + chunk.length)
    merged.set(this.#buffer, 0)
    merged.set(chunk, this.#buffer.length)
    this.#buffer = merged
  }

  #tryParse(): JsonRpcMessage | null {
    const delimiter = new TextEncoder().encode('\r\n\r\n')
    const headerEnd = findSubarray(this.#buffer, delimiter)
    if (headerEnd === -1) return null

    const headerText = new TextDecoder().decode(
      this.#buffer.slice(0, headerEnd),
    )
    const contentLengthMatch = headerText.match(/Content-Length:\s*(\d+)/i)
    if (!contentLengthMatch) {
      throw new Error('missing_content_length')
    }

    const contentLength = Number(contentLengthMatch[1])
    const bodyStart = headerEnd + delimiter.length
    const bodyEnd = bodyStart + contentLength
    if (this.#buffer.length < bodyEnd) return null

    const bodyText = new TextDecoder().decode(
      this.#buffer.slice(bodyStart, bodyEnd),
    )
    this.#buffer = this.#buffer.slice(bodyEnd)
    return JSON.parse(bodyText) as JsonRpcMessage
  }
}

function findSubarray(haystack: Uint8Array, needle: Uint8Array): number {
  outer:
  for (let i = 0; i <= haystack.length - needle.length; i++) {
    for (let j = 0; j < needle.length; j++) {
      if (haystack[i + j] !== needle[j]) continue outer
    }
    return i
  }
  return -1
}

async function collectText(
  stream: ReadableStream<Uint8Array> | null,
): Promise<string> {
  if (!stream) return ''
  const chunks: Uint8Array[] = []
  for await (const chunk of stream) {
    chunks.push(chunk)
  }
  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0)
  const merged = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    merged.set(chunk, offset)
    offset += chunk.length
  }
  return new TextDecoder().decode(merged)
}

async function waitForResponse(
  reader: MessageReader,
  id: number,
): Promise<JsonRpcMessage> {
  while (true) {
    const nextMessage = await reader.next()
    if (!nextMessage) {
      throw new Error(`stream_closed_waiting_for_${id}`)
    }
    if (nextMessage.id === id) return nextMessage
  }
}

function parseConfigLines(text: string): string[] {
  const output: string[] = []
  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim()
    if (!line) continue
    const [key, ...rest] = line.split('=')
    const value = rest.join('=')
    switch (key) {
      case 'dd_api_key_present':
        output.push(`mcp_dd_api_key_present=${value}`)
        break
      case 'dd_api_key_length':
        output.push(`mcp_dd_api_key_length=${value}`)
        break
      case 'dd_site':
        output.push(`mcp_dd_site=${value}`)
        break
      case 'gitlab_token_present':
        output.push(`mcp_gitlab_token_present=${value}`)
        break
      case 'gitlab_token_length':
        output.push(`mcp_gitlab_token_length=${value}`)
        break
    }
  }
  return output
}

async function main(): Promise<void> {
  const config = await readClaudeConfig()
  const server = config?.mcpServers?.[SERVER_NAME]
  if (!server) {
    emitMissing()
    return
  }

  if (server.type && server.type !== 'stdio') {
    emitError('unsupported_transport')
    return
  }

  if (!server.command) {
    emitError('invalid_server_config')
    return
  }

  const mergedEnv = {
    ...Deno.env.toObject(),
    ...(server.env ?? {}),
  }

  let process: Deno.ChildProcess
  try {
    process = new Deno.Command(server.command, {
      args: server.args ?? [],
      env: mergedEnv,
      stdin: 'piped',
      stdout: 'piped',
      stderr: 'piped',
    }).spawn()
  } catch (error) {
    emitError(
      sanitizeError(error instanceof Error ? error.message : String(error)),
    )
    return
  }

  const stderrPromise = collectText(process.stderr)

  try {
    const writer = process.stdin.getWriter()
    const reader = new MessageReader(process.stdout.getReader())

    await writer.write(
      encodeMessage({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: PROTOCOL_VERSION,
          capabilities: {},
          clientInfo: {
            name: 'sa-mise-session-start',
            version: '1.0.0',
          },
        },
      }),
    )

    const initializeResponse = await waitForResponse(reader, 1)
    if (initializeResponse.error) {
      throw new Error('initialize_failed')
    }

    await writer.write(
      encodeMessage({
        jsonrpc: '2.0',
        method: 'notifications/initialized',
      }),
    )

    await writer.write(
      encodeMessage({
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/call',
        params: {
          name: 'check_config',
          arguments: {},
        },
      }),
    )

    const toolResponse = await waitForResponse(reader, 2)
    if (toolResponse.error) {
      throw new Error('tool_call_failed')
    }

    const text = extractTextContent(toolResponse.result)
    if (!text) {
      throw new Error('empty_tool_response')
    }

    emit(['mcp_status=success', ...parseConfigLines(text)])
    writer.releaseLock()
  } catch (error) {
    const stderr = await stderrPromise
    const reason = stderr.trim() ? sanitizeError(stderr.trim()) : sanitizeError(
      error instanceof Error ? error.message : String(error),
    )
    emitError(reason)
  } finally {
    try {
      process.kill('SIGTERM')
    } catch {
      // ignore
    }
    await stderrPromise
  }
}

function extractTextContent(result: unknown): string {
  if (!result || typeof result !== 'object') return ''
  const content =
    (result as { content?: Array<{ type?: string; text?: string }> }).content
  if (!Array.isArray(content)) return ''
  return content
    .filter((item) => item?.type === 'text' && typeof item.text === 'string')
    .map((item) => item.text)
    .join('\n')
}

await main()
