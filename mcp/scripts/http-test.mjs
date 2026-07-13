import { spawn } from "node:child_process";
import { once } from "node:events";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const port = 31000 + Math.floor(Math.random() * 1000);
const token = `http-test-${Date.now()}`;
const baseUrl = `http://127.0.0.1:${port}`;

const child = spawn("node", ["src/httpServer.mjs"], {
  cwd: root,
  stdio: ["ignore", "pipe", "pipe"],
  env: {
    ...process.env,
    HOST: "127.0.0.1",
    PORT: String(port),
    MCP_AUTH_TOKEN: token,
    XIAOAN_STORE: "local",
    XIAOAN_ALLOW_MOCK: "true"
  }
});

let stderrText = "";
child.stderr.on("data", (chunk) => {
  stderrText += chunk.toString();
});

async function waitUntilReady() {
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${baseUrl}/health`);
      if (response.ok) return response.json();
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }
  throw new Error(`HTTP 服务未按时启动：${stderrText}`);
}

async function rpc(id, method, params = {}, protocolVersion) {
  const headers = {
    "Content-Type": "application/json",
    Accept: "application/json, text/event-stream",
    Authorization: `Bearer ${token}`
  };
  if (protocolVersion) headers["MCP-Protocol-Version"] = protocolVersion;

  const response = await fetch(`${baseUrl}/mcp`, {
    method: "POST",
    headers,
    body: JSON.stringify({ jsonrpc: "2.0", id, method, params })
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${await response.text()}`);
  return response.json();
}

try {
  const health = await waitUntilReady();

  const unauthorized = await fetch(`${baseUrl}/mcp`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream"
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: 0, method: "ping" })
  });
  if (unauthorized.status !== 401) {
    throw new Error(`访问令牌校验失败，预期 401，实际 ${unauthorized.status}`);
  }

  const initialize = await rpc(1, "initialize", {
    protocolVersion: "2025-11-25",
    capabilities: {},
    clientInfo: { name: "xiaoan-http-test", version: "0.1.0" }
  });
  const tools = await rpc(2, "tools/list", {}, initialize.result.protocolVersion);
  const services = await rpc(3, "tools/call", {
    name: "list_services",
    arguments: {}
  }, initialize.result.protocolVersion);

  console.log(JSON.stringify({
    health,
    unauthorized_status: unauthorized.status,
    negotiated_protocol: initialize.result.protocolVersion,
    endpoint: "/mcp",
    tools: tools.result.tools.map((tool) => tool.name),
    first_service: services.result.structuredContent.services[0].service_id
  }, null, 2));
} finally {
  child.kill("SIGTERM");
  await Promise.race([
    once(child, "exit"),
    new Promise((resolve) => setTimeout(resolve, 1000))
  ]);
}
