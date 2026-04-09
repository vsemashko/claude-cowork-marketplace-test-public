import { spawn } from "node:child_process";
import { promises as fs, constants as fsConstants } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PROTOCOL_VERSION = "2024-11-05";

function summarizeToken(token) {
  return {
    configured: Boolean(token),
    length: token ? token.length : 0,
  };
}

function envString(name, fallback = "") {
  return process.env[name] ?? fallback;
}

function createOptions(overrides = {}) {
  const strategy = overrides.strategy ?? envString("PROBE_STRATEGY", "path");

  return {
    strategy,
    pluginName: overrides.pluginName ?? envString("PROBE_PLUGIN_NAME", "cowork-probe"),
    pluginVersion: overrides.pluginVersion ?? envString("PROBE_PLUGIN_VERSION", "0.0.0"),
    pluginRoot: overrides.pluginRoot ?? envString("PROBE_PLUGIN_ROOT", process.cwd()),
    pluginData: overrides.pluginData ?? envString("PROBE_PLUGIN_DATA", ""),
    commandName: overrides.commandName ?? envString("PROBE_COMMAND_NAME", "cowork-probe-cli"),
    probeLabel: overrides.probeLabel ?? envString("PROBE_LABEL", "QWE"),
    probeEndpoint: overrides.probeEndpoint ?? envString("PROBE_ENDPOINT", "https://example.invalid/probe"),
    probeToken: overrides.probeToken ?? envString("PROBE_TOKEN", ""),
    bundledAsset: overrides.bundledAsset ?? envString("PROBE_BUNDLED_ASSET", ""),
    downloadUrl: overrides.downloadUrl ?? envString("PROBE_DOWNLOAD_URL", ""),
    cacheNamespace: overrides.cacheNamespace ?? envString("PROBE_CACHE_NAMESPACE", strategy),
    bootstrapOnStart: overrides.bootstrapOnStart ?? envString("PROBE_BOOTSTRAP_ON_START", "false") === "true",
  };
}

async function exists(filePath) {
  try {
    await fs.access(filePath, fsConstants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function isExecutable(filePath) {
  try {
    await fs.access(filePath, fsConstants.X_OK);
    return true;
  } catch {
    return false;
  }
}

async function readJson(filePath) {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function writeJson(filePath, value) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function getCachePaths(options) {
  if (!options.pluginData) {
    return null;
  }

  const cacheDirectory = path.join(options.pluginData, options.cacheNamespace);
  const executablePath = path.join(cacheDirectory, "bin", options.commandName);

  return {
    cacheDirectory,
    executablePath,
    markerPath: path.join(cacheDirectory, "install.json"),
  };
}

function buildConfigSummary(options) {
  return {
    probe_label: options.probeLabel,
    probe_endpoint: options.probeEndpoint,
    probe_token: summarizeToken(options.probeToken),
  };
}

function buildMarker(options, sourceType, source) {
  return {
    strategy: options.strategy,
    pluginName: options.pluginName,
    pluginVersion: options.pluginVersion,
    commandName: options.commandName,
    sourceType,
    source,
    installedAt: new Date().toISOString(),
  };
}

async function ensureBundledExecutable(options) {
  const cachePaths = getCachePaths(options);
  if (!cachePaths) {
    return {
      ok: false,
      error: "CLAUDE_PLUGIN_DATA is not available, so the bundled probe cannot be cached.",
    };
  }

  if (!options.bundledAsset) {
    return {
      ok: false,
      error: "No bundled probe asset was configured for this bootstrap strategy.",
    };
  }

  const bundledAssetPath = path.resolve(options.bundledAsset);

  if (!(await exists(bundledAssetPath))) {
    return {
      ok: false,
      error: `Bundled probe asset not found at ${bundledAssetPath}.`,
    };
  }

  const marker = await readJson(cachePaths.markerPath);
  const executableReady = await isExecutable(cachePaths.executablePath);
  const sourceMatches = marker?.sourceType === "bundled" && marker?.source === bundledAssetPath;
  const versionMatches = marker?.pluginVersion === options.pluginVersion;

  if (marker && executableReady && sourceMatches && versionMatches) {
    return {
      ok: true,
      installStatus: "reused",
      cachePaths,
      marker,
    };
  }

  await fs.mkdir(path.dirname(cachePaths.executablePath), { recursive: true });
  await fs.copyFile(bundledAssetPath, cachePaths.executablePath);
  await fs.chmod(cachePaths.executablePath, 0o755);

  const nextMarker = buildMarker(options, "bundled", bundledAssetPath);
  await writeJson(cachePaths.markerPath, nextMarker);

  return {
    ok: true,
    installStatus: "fresh_install",
    cachePaths,
    marker: nextMarker,
  };
}

async function readDownloadSource(downloadUrl) {
  if (downloadUrl.startsWith("file://")) {
    return fs.readFile(fileURLToPath(downloadUrl));
  }

  const response = await fetch(downloadUrl);
  if (!response.ok) {
    throw new Error(`download failed with ${response.status} ${response.statusText}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

async function ensureDownloadedExecutable(options) {
  const cachePaths = getCachePaths(options);
  if (!cachePaths) {
    return {
      ok: false,
      error: "CLAUDE_PLUGIN_DATA is not available, so the downloaded probe cannot be cached.",
    };
  }

  if (!options.downloadUrl) {
    return {
      ok: false,
      error: "No download URL was configured for the download strategy.",
    };
  }

  const marker = await readJson(cachePaths.markerPath);
  const executableReady = await isExecutable(cachePaths.executablePath);
  const sourceMatches = marker?.sourceType === "download" && marker?.source === options.downloadUrl;
  const versionMatches = marker?.pluginVersion === options.pluginVersion;

  if (marker && executableReady && sourceMatches && versionMatches) {
    return {
      ok: true,
      installStatus: "reused",
      cachePaths,
      marker,
    };
  }

  try {
    const content = await readDownloadSource(options.downloadUrl);
    await fs.mkdir(path.dirname(cachePaths.executablePath), { recursive: true });
    await fs.writeFile(cachePaths.executablePath, content);
    await fs.chmod(cachePaths.executablePath, 0o755);

    const nextMarker = buildMarker(options, "download", options.downloadUrl);
    await writeJson(cachePaths.markerPath, nextMarker);

    return {
      ok: true,
      installStatus: "fresh_install",
      cachePaths,
      marker: nextMarker,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      error: `Unable to download probe from ${options.downloadUrl}: ${message}`,
    };
  }
}

async function resolveCommandOnPath(commandName) {
  const pathValue = process.env.PATH ?? "";
  const candidates = pathValue
    .split(path.delimiter)
    .filter(Boolean)
    .map((entry) => path.join(entry, commandName));

  for (const candidate of candidates) {
    if (await isExecutable(candidate)) {
      return candidate;
    }
  }

  return null;
}

function parseProbeOutput(stdout) {
  const result = {};
  for (const line of stdout.trim().split("\n")) {
    if (!line.includes("=")) {
      continue;
    }

    const [key, ...valueParts] = line.split("=");
    result[key] = valueParts.join("=");
  }
  return result;
}

async function executeProbe(executablePath, options) {
  const child = spawn(executablePath, [], {
    env: {
      ...process.env,
      PROBE_STRATEGY: options.strategy,
      PROBE_LABEL: options.probeLabel,
      PROBE_ENDPOINT: options.probeEndpoint,
      PROBE_TOKEN: options.probeToken,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  const stdout = [];
  const stderr = [];

  child.stdout.on("data", (chunk) => stdout.push(chunk));
  child.stderr.on("data", (chunk) => stderr.push(chunk));

  const exitCode = await new Promise((resolve, reject) => {
    child.on("error", reject);
    child.on("close", resolve);
  });

  const stdoutText = Buffer.concat(stdout).toString("utf8");
  const stderrText = Buffer.concat(stderr).toString("utf8");

  return {
    ok: exitCode === 0,
    exitCode,
    stdout: stdoutText,
    stderr: stderrText,
    parsedOutput: parseProbeOutput(stdoutText),
  };
}

async function buildCacheReport(options) {
  if (options.strategy === "path") {
    return {
      pluginDataRoot: options.pluginData || null,
      cacheDirectory: null,
      executablePath: null,
      executableExists: false,
      markerPath: null,
      marker: null,
      expectedReuseAcrossSessions: false,
      note: "PATH mode never installs or reuses a probe from plugin data.",
    };
  }

  const cachePaths = getCachePaths(options);
  if (!cachePaths) {
    return {
      pluginDataRoot: options.pluginData || null,
      cacheDirectory: null,
      executablePath: null,
      executableExists: false,
      markerPath: null,
      marker: null,
      expectedReuseAcrossSessions: false,
      note: "This strategy does not have a plugin-data cache configured.",
    };
  }

  const marker = await readJson(cachePaths.markerPath);

  return {
    pluginDataRoot: options.pluginData,
    cacheDirectory: cachePaths.cacheDirectory,
    executablePath: cachePaths.executablePath,
    executableExists: await isExecutable(cachePaths.executablePath),
    markerPath: cachePaths.markerPath,
    marker,
    expectedReuseAcrossSessions: options.strategy === "bootstrap" || options.strategy === "download",
  };
}

export async function createProbeService(overrides = {}) {
  const options = createOptions(overrides);
  let startupInstallStatus = "not_applicable";
  let startupInstallError = null;

  if (options.strategy === "bootstrap" && options.bootstrapOnStart) {
    const startupResult = await ensureBundledExecutable(options);
    startupInstallStatus = startupResult.ok ? startupResult.installStatus : "error";
    startupInstallError = startupResult.ok ? null : startupResult.error;
  }

  return {
    async reportEnv() {
      return {
        strategy: options.strategy,
        plugin_name: options.pluginName,
        plugin_version: options.pluginVersion,
        config: buildConfigSummary(options),
      };
    },

    async reportCache() {
      const cache = await buildCacheReport(options);
      return {
        strategy: options.strategy,
        startupInstallStatus,
        startupInstallError,
        cache,
      };
    },

    async runProbe() {
      const config = buildConfigSummary(options);

      if (options.strategy === "path") {
        const executablePath = await resolveCommandOnPath(options.commandName);
        if (!executablePath) {
          return {
            ok: false,
            strategy: options.strategy,
            resolvedExecutablePath: null,
            installStatus: "not_found",
            config,
            error: `Command ${options.commandName} was not found on PATH.`,
          };
        }

        const execution = await executeProbe(executablePath, options);
        return {
          ok: execution.ok,
          strategy: options.strategy,
          resolvedExecutablePath: executablePath,
          installStatus: "path_lookup",
          config,
          execution,
        };
      }

      const installer = options.strategy === "bootstrap" ? ensureBundledExecutable : ensureDownloadedExecutable;
      const installResult = await installer(options);

      if (!installResult.ok) {
        return {
          ok: false,
          strategy: options.strategy,
          resolvedExecutablePath: null,
          installStatus: "error",
          config,
          error: installResult.error,
        };
      }

      const execution = await executeProbe(installResult.cachePaths.executablePath, options);
      return {
        ok: execution.ok,
        strategy: options.strategy,
        resolvedExecutablePath: installResult.cachePaths.executablePath,
        installStatus: installResult.installStatus,
        config,
        cacheDirectory: installResult.cachePaths.cacheDirectory,
        marker: installResult.marker,
        execution,
      };
    },
  };
}

function toolSpec(name, description) {
  return {
    name,
    description,
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
  };
}

function toToolResult(payload, isError = false) {
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(payload, null, 2),
      },
    ],
    isError,
  };
}

function sendMessage(message) {
  const body = JSON.stringify(message);
  process.stdout.write(`Content-Length: ${Buffer.byteLength(body, "utf8")}\r\n\r\n${body}`);
}

async function handleRequest(request, service) {
  try {
    switch (request.method) {
      case "initialize":
        return {
          protocolVersion: PROTOCOL_VERSION,
          capabilities: {
            tools: {},
          },
          serverInfo: {
            name: envString("PROBE_PLUGIN_NAME", "cowork-probe"),
            version: envString("PROBE_PLUGIN_VERSION", "0.0.0"),
          },
        };
      case "notifications/initialized":
        return null;
      case "tools/list":
        return {
          tools: [
            toolSpec("report_env", "Report probe_label and probe_endpoint verbatim, plus probe_token as a redacted length."),
            toolSpec("run_probe", "Execute the configured probe strategy and report the resolved executable path plus config summary."),
            toolSpec("report_cache", "Report the plugin-data cache directory, install marker, and reuse expectations."),
          ],
        };
      case "tools/call": {
        const toolName = request.params?.name;
        if (!toolName || typeof service[toolName] !== "function") {
          return toToolResult({ error: `Unsupported tool: ${toolName}` }, true);
        }

        const payload = await service[toolName]();
        return toToolResult(payload, payload?.ok === false);
      }
      default:
        throw new Error(`Unsupported method: ${request.method}`);
    }
  } catch (error) {
    return {
      error: {
        code: -32000,
        message: error instanceof Error ? error.message : String(error),
      },
    };
  }
}

export async function startProbeServer(overrides = {}) {
  const service = await createProbeService(overrides);
  let buffer = Buffer.alloc(0);

  process.stdin.on("data", async (chunk) => {
    buffer = Buffer.concat([buffer, chunk]);

    while (true) {
      const headerEnd = buffer.indexOf("\r\n\r\n");
      if (headerEnd === -1) {
        return;
      }

      const headerText = buffer.slice(0, headerEnd).toString("utf8");
      const contentLengthHeader = headerText
        .split("\r\n")
        .find((line) => line.toLowerCase().startsWith("content-length:"));

      if (!contentLengthHeader) {
        buffer = Buffer.alloc(0);
        return;
      }

      const contentLength = Number.parseInt(contentLengthHeader.split(":")[1]?.trim() ?? "", 10);
      const messageStart = headerEnd + 4;
      const messageEnd = messageStart + contentLength;

      if (buffer.length < messageEnd) {
        return;
      }

      const payloadText = buffer.slice(messageStart, messageEnd).toString("utf8");
      buffer = buffer.slice(messageEnd);

      const request = JSON.parse(payloadText);
      const result = await handleRequest(request, service);

      if (request.id !== undefined && result !== null) {
        sendMessage({
          jsonrpc: "2.0",
          id: request.id,
          ...(result?.error ? { error: result.error } : { result }),
        });
      }
    }
  });
}
