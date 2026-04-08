import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

const STORE_DIR = join(homedir(), ".cowork-probe", "persist-probe");
const STORE_FILE = join(STORE_DIR, "persisted-value.txt");

const server = new McpServer({
  name: "sa-cowork-persist-mcp",
  version: "1.0.0",
});

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

const transport = new StdioServerTransport();
await server.connect(transport);
