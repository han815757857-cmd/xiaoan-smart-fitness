#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const readline = require('node:readline');

const DEFAULT_ENDPOINT = 'http://127.0.0.1:3000/mcp';
const DEFAULT_ENV_PATH = path.resolve(__dirname, '..', 'mcp', '.env');
const PROTOCOL_VERSION = '2025-06-18';

function readEnvValue(filePath, key) {
  const source = fs.readFileSync(filePath, 'utf8');
  for (const line of source.split(/\r?\n/)) {
    if (!line || line.trimStart().startsWith('#')) continue;
    const separator = line.indexOf('=');
    if (separator < 1 || line.slice(0, separator).trim() !== key) continue;
    return line.slice(separator + 1).trim();
  }
  return '';
}

function loadConfig() {
  const endpoint = new URL(process.env.XIAOAN_MCP_URL || DEFAULT_ENDPOINT);
  const allowedHost = endpoint.hostname === '127.0.0.1' || endpoint.hostname === 'localhost';
  if (endpoint.protocol !== 'http:' || !allowedHost || endpoint.pathname !== '/mcp') {
    throw new Error('兼容桥只允许访问本机 HTTP MCP /mcp 端点。');
  }

  const envPath = process.env.XIAOAN_MCP_ENV_FILE || DEFAULT_ENV_PATH;
  const token = readEnvValue(envPath, 'MCP_AUTH_TOKEN');
  if (!token) throw new Error('未在商家 MCP .env 中找到 MCP_AUTH_TOKEN。');
  return { endpoint: endpoint.toString(), token };
}

function parseEventStream(text) {
  const payloads = [];
  let dataLines = [];
  for (const line of String(text).split(/\r?\n/)) {
    if (!line) {
      if (dataLines.length) payloads.push(dataLines.join('\n'));
      dataLines = [];
    } else if (line.startsWith('data:')) {
      dataLines.push(line.slice(5).trimStart());
    }
  }
  if (dataLines.length) payloads.push(dataLines.join('\n'));
  for (let index = payloads.length - 1; index >= 0; index -= 1) {
    try { return JSON.parse(payloads[index]); } catch {}
  }
  throw new Error('无法解析 MCP SSE 响应。');
}

function parsePayload(text, contentType) {
  const source = String(text || '').trim();
  if (!source) return null;
  if (String(contentType).includes('text/event-stream') || /^data:/m.test(source)) {
    return parseEventStream(source);
  }
  return JSON.parse(source);
}

function rpcError(id, message) {
  return {
    jsonrpc: '2.0',
    id: id ?? null,
    error: { code: -32603, message }
  };
}

function write(payload) {
  process.stdout.write(`${JSON.stringify(payload)}\n`);
}

async function forward(request, config) {
  const response = await fetch(config.endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
      Authorization: `Bearer ${config.token}`,
      'Mcp-Protocol-Version': PROTOCOL_VERSION
    },
    body: JSON.stringify(request)
  });

  const text = await response.text();
  if (!response.ok) throw new Error(`远程 MCP HTTP ${response.status}`);
  return parsePayload(text, response.headers.get('content-type') || '');
}

async function main() {
  const config = loadConfig();
  process.stderr.write('xiaoan MCP stdio compatibility bridge started\n');
  const lines = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });

  for await (const line of lines) {
    if (!line.trim()) continue;
    let request;
    try {
      request = JSON.parse(line);
    } catch {
      write({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'JSON 解析失败' } });
      continue;
    }

    try {
      const response = await forward(request, config);
      if (response) write(response);
    } catch (error) {
      if (request.id !== undefined) write(rpcError(request.id, error.message));
    }
  }
}

main().catch((error) => {
  process.stderr.write(`xiaoan MCP stdio compatibility bridge failed: ${error.message}\n`);
  process.exit(1);
});
