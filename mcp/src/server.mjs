#!/usr/bin/env node

import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output, stderr } from "node:process";
import { handleRequest, SERVER_INFO } from "./mcpProtocol.mjs";

function send(message) {
  output.write(`${JSON.stringify(message)}\n`);
}

async function main() {
  stderr.write(`${SERVER_INFO.name} ${SERVER_INFO.version} started\n`);

  const reader = createInterface({ input });
  for await (const line of reader) {
    if (!line.trim()) continue;

    let request;
    try {
      request = JSON.parse(line);
    } catch (error) {
      send({
        jsonrpc: "2.0",
        id: null,
        error: {
          code: -32700,
          message: `JSON 解析失败：${error.message}`
        }
      });
      continue;
    }

    const response = await handleRequest(request);
    if (response) send(response);
  }
}

main().catch((error) => {
  stderr.write(`${error.stack || error.message}\n`);
  process.exit(1);
});
