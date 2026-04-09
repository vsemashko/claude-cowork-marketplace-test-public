import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const STORE_DIR = process.env.PERSIST_STORE_DIR || join(process.env.HOME || "/tmp", ".cowork-probe", "persist-probe");
const STORE_FILE = join(STORE_DIR, "persisted-value.txt");
const EXTENSION_BRIDGE_FILE = join(process.env.HOME || "/tmp", ".cowork-probe", "persist-probe", "config-bridge.json");

const server = new McpServer({
  name: "sa-cowork-persist-probe-mcp",
  version: "1.1.0",
});

server.tool(
  "persist_write",
  "Write a value to persistent storage. If no value given, auto-generates one using the configured probe label + 3 random digits.",
  { value: z.string().optional().describe("Value to persist (auto-generated if omitted)") },
  async ({ value }) => {
    mkdirSync(STORE_DIR, { recursive: true });

    let stored;
    if (value) {
      stored = value;
    } else {
      const label = process.env.PROBE_LABEL || "QWE";
      const num = String(Math.floor(Math.random() * 900) + 100);
      stored = `${label}${num}`;
    }

    writeFileSync(STORE_FILE, stored, "utf-8");
    return { content: [{ type: "text", text: `Stored value "${stored}" in ${STORE_FILE}` }] };
  }
);

server.tool(
  "persist_read",
  "Read the persisted value from storage.",
  {},
  async () => {
    if (!existsSync(STORE_FILE)) {
      return { content: [{ type: "text", text: `No stored value found in ${STORE_FILE}` }] };
    }
    const value = readFileSync(STORE_FILE, "utf-8");
    if (!value) {
      return { content: [{ type: "text", text: `File exists but is empty: ${STORE_FILE}` }] };
    }
    return { content: [{ type: "text", text: `Stored value: ${value}` }] };
  }
);

server.tool(
  "check_config",
  "Report which user_config values are available to this MCP server.",
  {},
  async () => {
    const configs = [
      { key: "PROBE_LABEL", sensitive: false },
      { key: "PROBE_SECRET", sensitive: true },
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
  "read_extension_bridge",
  "Read the explicit bridge file exported by sa-cowork-persist-extension and summarize its values.",
  {},
  async () => {
    if (!existsSync(EXTENSION_BRIDGE_FILE)) {
      return {
        content: [
          {
            type: "text",
            text: [
              `bridge_found=false`,
              `bridge_file=${EXTENSION_BRIDGE_FILE}`,
              `next_step=Run sa-cowork-persist-extension config_report to verify extension config or bridge_report to export the bridge file.`,
            ].join("\n"),
          },
        ],
      };
    }

    const raw = readFileSync(EXTENSION_BRIDGE_FILE, "utf-8");
    const data = JSON.parse(raw);

    return {
      content: [
        {
          type: "text",
          text: [
            `bridge_found=true`,
            `bridge_file=${EXTENSION_BRIDGE_FILE}`,
            `source=${data.source || "unknown"}`,
            `probe_label=${data.probe_label || ""}`,
            `probe_secret_present=${String(Boolean(data.probe_secret_present)).toLowerCase()}`,
            `probe_secret_length=${Number(data.probe_secret_length || 0)}`,
          ].join("\n"),
        },
      ],
    };
  }
);

const transport = new StdioServerTransport();
await server.connect(transport);
