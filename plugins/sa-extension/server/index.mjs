import { promises as fs } from "node:fs";
import path from "node:path";
import { homedir } from "node:os";

const PROTOCOL_VERSION = "2024-11-05";
const storeDir = path.join(homedir(), ".tmp-core", "sa-extension");
const storeFile = path.join(storeDir, "stored-value.txt");

function configuredPublicValue() {
  return process.env.EXTENSION_PUBLIC_VALUE || "extension-public-default";
}

function configuredSecretValue() {
  return process.env.EXTENSION_SECRET_VALUE || "";
}

async function ensureDir() {
  await fs.mkdir(storeDir, { recursive: true });
}

async function readStoredValue() {
  try {
    return await fs.readFile(storeFile, "utf8");
  } catch {
    return "";
  }
}

async function writeStoredValue(value) {
  await ensureDir();
  await fs.writeFile(storeFile, value, "utf8");
}

function toolDefinitions() {
  return [
    {
      name: "set_value",
      description: "Store a value in sa-extension.",
      inputSchema: {
        type: "object",
        properties: {
          value: { type: "string", description: "Value to store" },
        },
        required: ["value"],
      },
    },
    {
      name: "get_value",
      description: "Read the stored value from sa-extension.",
      inputSchema: {
        type: "object",
        properties: {},
      },
    },
    {
      name: "get_all",
      description: "Return the configured extension values plus the stored value.",
      inputSchema: {
        type: "object",
        properties: {},
      },
    },
  ];
}

function textResult(text) {
  return {
    content: [
      {
        type: "text",
        text,
      },
    ],
  };
}

async function handleToolCall(name, args) {
  switch (name) {
    case "set_value": {
      const value = typeof args?.value === "string" ? args.value : "";
      await writeStoredValue(value);
      return textResult(`source=sa-extension\nstored_value=${value}\nstate_file=${storeFile}`);
    }
    case "get_value": {
      const value = await readStoredValue();
      return textResult(`source=sa-extension\nstored_value=${value}\nstate_file=${storeFile}`);
    }
    case "get_all": {
      const value = await readStoredValue();
      return textResult(
        [
          "source=sa-extension",
          `configured_public_value=${configuredPublicValue()}`,
          `configured_secret_value=${configuredSecretValue()}`,
          `stored_value=${value}`,
          `state_file=${storeFile}`,
        ].join("\n"),
      );
    }
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

function send(message) {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}

process.stdin.setEncoding("utf8");
let buffer = "";

process.stdin.on("data", async (chunk) => {
  buffer += chunk;
  const lines = buffer.split("\n");
  buffer = lines.pop() ?? "";

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    let request;
    try {
      request = JSON.parse(line);
    } catch {
      continue;
    }

    const { id, method, params } = request;

    try {
      switch (method) {
        case "initialize":
          send({
            jsonrpc: "2.0",
            id,
            result: {
              protocolVersion: PROTOCOL_VERSION,
              capabilities: { tools: {} },
              serverInfo: {
                name: "sa-extension",
                version: "1.0.0",
              },
            },
          });
          break;
        case "notifications/initialized":
          break;
        case "tools/list":
          send({
            jsonrpc: "2.0",
            id,
            result: {
              tools: toolDefinitions(),
            },
          });
          break;
        case "tools/call":
          send({
            jsonrpc: "2.0",
            id,
            result: await handleToolCall(params?.name, params?.arguments || {}),
          });
          break;
        default:
          send({
            jsonrpc: "2.0",
            id,
            error: {
              code: -32601,
              message: `Method not found: ${method}`,
            },
          });
      }
    } catch (error) {
      send({
        jsonrpc: "2.0",
        id,
        error: {
          code: -32000,
          message: error instanceof Error ? error.message : String(error),
        },
      });
    }
  }
});
