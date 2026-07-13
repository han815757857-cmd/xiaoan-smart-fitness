#!/usr/bin/env node

import { createServer } from "node:http";
import { timingSafeEqual } from "node:crypto";
import { stderr } from "node:process";
import {
  handleRequest,
  isNotification,
  SERVER_INFO,
  SUPPORTED_PROTOCOL_VERSIONS
} from "./mcpProtocol.mjs";

const host = process.env.HOST || "127.0.0.1";
const port = Number.parseInt(process.env.PORT || "3000", 10);
const authToken = process.env.MCP_AUTH_TOKEN || "";
const maxBodyBytes = Number.parseInt(process.env.MCP_MAX_BODY_BYTES || "1048576", 10);
const allowedOrigins = new Set(
  (process.env.MCP_ALLOWED_ORIGINS || "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean)
);

function json(res, statusCode, payload, extraHeaders = {}) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
    "Cache-Control": "no-store",
    ...extraHeaders
  });
  res.end(body);
}

function jsonRpcError(res, statusCode, code, message) {
  json(res, statusCode, {
    jsonrpc: "2.0",
    id: null,
    error: { code, message }
  });
}

function tokenMatches(headerValue) {
  if (!authToken) return true;
  if (typeof headerValue !== "string" || !headerValue.startsWith("Bearer ")) return false;

  const candidate = Buffer.from(headerValue.slice(7));
  const expected = Buffer.from(authToken);
  return candidate.length === expected.length && timingSafeEqual(candidate, expected);
}

function originAllowed(origin) {
  if (!origin) return true;
  if (allowedOrigins.has(origin)) return true;

  try {
    const url = new URL(origin);
    return url.hostname === "127.0.0.1" || url.hostname === "localhost" || url.hostname === "::1";
  } catch {
    return false;
  }
}

async function readJsonBody(req) {
  let size = 0;
  const chunks = [];

  for await (const chunk of req) {
    size += chunk.length;
    if (size > maxBodyBytes) {
      const error = new Error("请求体超过大小限制");
      error.code = "BODY_TOO_LARGE";
      throw error;
    }
    chunks.push(chunk);
  }

  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function acceptsMcpResponse(req) {
  const accept = req.headers.accept || "";
  return accept.includes("application/json") && accept.includes("text/event-stream");
}

function protocolVersionAllowed(req) {
  const version = req.headers["mcp-protocol-version"];
  return !version || SUPPORTED_PROTOCOL_VERSIONS.includes(version) || version === "2025-03-26";
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);

  if (req.method === "GET" && url.pathname === "/health") {
    json(res, 200, {
      ok: true,
      service: SERVER_INFO.name,
      version: SERVER_INFO.version,
      store: process.env.XIAOAN_STORE || "unconfigured"
    });
    return;
  }

  if (url.pathname !== "/mcp") {
    jsonRpcError(res, 404, -32004, "接口不存在");
    return;
  }

  if (!originAllowed(req.headers.origin)) {
    jsonRpcError(res, 403, -32003, "Origin 不在允许列表中");
    return;
  }

  if (!tokenMatches(req.headers.authorization)) {
    jsonRpcError(res, 401, -32001, "缺少或无效的访问令牌");
    return;
  }

  if (req.method === "GET") {
    res.writeHead(405, { Allow: "POST" });
    res.end();
    return;
  }

  if (req.method !== "POST") {
    res.writeHead(405, { Allow: "GET, POST" });
    res.end();
    return;
  }

  if (!acceptsMcpResponse(req)) {
    jsonRpcError(res, 406, -32006, "Accept 必须同时支持 application/json 和 text/event-stream");
    return;
  }

  if (!protocolVersionAllowed(req)) {
    jsonRpcError(res, 400, -32007, "不支持的 MCP-Protocol-Version");
    return;
  }

  let request;
  try {
    request = await readJsonBody(req);
  } catch (error) {
    const statusCode = error.code === "BODY_TOO_LARGE" ? 413 : 400;
    jsonRpcError(res, statusCode, -32700, error.message);
    return;
  }

  const response = await handleRequest(request);
  if (isNotification(request)) {
    res.writeHead(202, { "Cache-Control": "no-store" });
    res.end();
    return;
  }

  json(res, 200, response);
});

server.listen(port, host, () => {
  stderr.write(`${SERVER_INFO.name} ${SERVER_INFO.version} HTTP started at http://${host}:${port}/mcp\n`);
  if (!authToken) {
    stderr.write("warning: MCP_AUTH_TOKEN 未设置；仅适合本机测试，部署公网前必须配置访问控制\n");
  }
});

function shutdown() {
  server.close(() => process.exit(0));
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
