import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import process from 'node:process'

const server = new McpServer({
  name: 'sa-cowork-config-mcp',
  version: '1.0.0',
})

function getSensitiveSummary(key: string): string[] {
  const value = process.env[key]
  if (!value) {
    return ['false', '0']
  }
  return ['true', String(value.length)]
}

server.tool(
  'check_config',
  'Report configured values in sanitized key=value form.',
  {},
  () => {
    const [ddApiKeyPresent, ddApiKeyLength] = getSensitiveSummary('DD_API_KEY')
    const [gitlabTokenPresent, gitlabTokenLength] = getSensitiveSummary(
      'GITLAB_TOKEN',
    )
    const ddSite = process.env.DD_SITE ?? ''

    const lines = [
      `dd_api_key_present=${ddApiKeyPresent}`,
      `dd_api_key_length=${ddApiKeyLength}`,
      `dd_site=${ddSite}`,
      `gitlab_token_present=${gitlabTokenPresent}`,
      `gitlab_token_length=${gitlabTokenLength}`,
    ]

    return {
      content: [{ type: 'text', text: lines.join('\n') }],
    }
  },
)

const transport = new StdioServerTransport()
await server.connect(transport)
