import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

const STORE_DIR = join(homedir(), ".cowork-probe", "persist-probe");
const STORE_FILE = join(STORE_DIR, "persisted-value.txt");
const BRIDGE_FILE = join(STORE_DIR, "config-bridge.json");

const server = new McpServer({
  name: "sa-cowork-persist-extension",
  version: "1.3.0",
});

function getConfigSummary() {
  const label = process.env.PROBE_LABEL || "QWE";
  const secret = process.env.PROBE_SECRET || "";

  return {
    probe_label: label,
    probe_secret_present: Boolean(secret),
    probe_secret_length: secret.length,
  };
}

server.tool(
  "persist_write",
  "Write a value to persistent storage. If no value given, auto-generates one using PROBE_LABEL + 3 random digits.",
  { value: z.string().optional().describe("Value to persist (auto-generated if omitted)") },
  async ({ value }) => {
    mkdirSync(STORE_DIR, { recursive: true });

    let stored: string;
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
  "config_report",
  "Report the configured extension values available through mcp_config.env without revealing the raw secret.",
  {},
  async () => {
    const summary = getConfigSummary();
    return {
      content: [
        {
          type: "text",
          text: [
            `probe_label=${summary.probe_label}`,
            `probe_secret_present=${String(summary.probe_secret_present).toLowerCase()}`,
            `probe_secret_length=${summary.probe_secret_length}`,
          ].join("\n"),
        },
      ],
    };
  }
);

server.tool(
  "bridge_report",
  "Write the current desktop extension config summary to a shared bridge file so Claude-style plugins can inspect it explicitly.",
  {},
  async () => {
    mkdirSync(STORE_DIR, { recursive: true });

    const bridge = {
      source: "sa-cowork-persist-extension",
      ...getConfigSummary(),
      bridge_file: BRIDGE_FILE,
    };

    writeFileSync(BRIDGE_FILE, `${JSON.stringify(bridge, null, 2)}\n`, "utf-8");

    return {
      content: [
        {
          type: "text",
          text: `Wrote bridge report to ${BRIDGE_FILE}`,
        },
      ],
    };
  }
);

const transport = new StdioServerTransport();
await server.connect(transport);
