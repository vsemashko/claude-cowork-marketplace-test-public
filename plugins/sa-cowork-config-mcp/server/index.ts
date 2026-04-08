import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

const server = new McpServer({
  name: "sa-cowork-config-mcp",
  version: "1.0.0",
});

server.tool(
  "check_config",
  "Report which user_config values are set. Sensitive values show length only.",
  {},
  async () => {
    const configs = [
      { key: "DD_API_KEY", sensitive: true },
      { key: "DD_SITE", sensitive: false },
      { key: "GITLAB_TOKEN", sensitive: true },
    ];

    const lines = configs.map(({ key, sensitive }) => {
      const value = process.env[key];
      if (!value) return `${key}: NOT SET`;
      if (sensitive) return `${key}: SET (length ${value.length})`;
      return `${key}: ${value}`;
    });

    return { content: [{ type: "text", text: lines.join("\n") }] };
  }
);

server.tool(
  "check_binaries",
  "Check if plugin binaries are accessible from the server directory.",
  {},
  async () => {
    const lines: string[] = [];

    // Check marketplace-root binary (4 levels up from server/build/)
    const marketplaceBin = resolve(__dirname, "../../../../bin/hello-marketplace");
    lines.push(`marketplace bin (${marketplaceBin}): ${existsSync(marketplaceBin) ? "FOUND" : "NOT FOUND"}`);

    // Check persist-probe plugin binary
    const persistBin = resolve(__dirname, "../../../sa-cowork-persist-probe/bin/hello-persist-probe");
    lines.push(`persist-probe bin (${persistBin}): ${existsSync(persistBin) ? "FOUND" : "NOT FOUND"}`);

    // Try running the marketplace binary if found
    if (existsSync(marketplaceBin)) {
      try {
        const output = execSync(`"${marketplaceBin}" config-mcp-test`, { encoding: "utf-8" }).trim();
        lines.push(`marketplace bin output: ${output}`);
      } catch {
        lines.push("marketplace bin: found but failed to execute");
      }
    }

    return { content: [{ type: "text", text: lines.join("\n") }] };
  }
);

const transport = new StdioServerTransport();
await server.connect(transport);
