import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createInterface } from "node:readline";

const __dirname = dirname(fileURLToPath(import.meta.url));
const proxyPath = join(__dirname, "..", "..", "scripts", "mcp-stdio-proxy.js");
const tempDir = await mkdtemp(join(tmpdir(), "xiaoan-stdio-proxy-"));
const envPath = join(tempDir, ".env");
const token = "stdio-proxy-test-token";
await writeFile(envPath, `MCP_AUTH_TOKEN=${token}\n`, { mode: 0o600 });

const server = createServer(async (req, res) => {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const request = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  if (req.headers.authorization !== `Bearer ${token}`) {
    res.writeHead(401).end();
    return;
  }
  const payload = request.method === "tools/list"
    ? { jsonrpc: "2.0", id: request.id, result: { tools: [{ name: "list_services" }] } }
    : { jsonrpc: "2.0", id: request.id, result: {} };
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify(payload));
});

server.listen(0, "127.0.0.1");
await once(server, "listening");
const address = server.address();

const child = spawn("node", [proxyPath], {
  stdio: ["pipe", "pipe", "pipe"],
  env: {
    ...process.env,
    XIAOAN_MCP_URL: `http://127.0.0.1:${address.port}/mcp`,
    XIAOAN_MCP_ENV_FILE: envPath
  }
});
const output = createInterface({ input: child.stdout });
const responsePromise = once(output, "line").then(([line]) => JSON.parse(line));
child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} })}\n`);
const response = await responsePromise;

if (response?.result?.tools?.[0]?.name !== "list_services") {
  throw new Error(`stdio 兼容桥验收失败：${JSON.stringify(response)}`);
}

console.log(JSON.stringify({
  stdio_proxy_connected: true,
  authorization_forwarded: true,
  first_tool: response.result.tools[0].name
}, null, 2));

child.kill("SIGTERM");
server.close();
