#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const token = fs.readFileSync(0, 'utf8').trim();
if (!token || /\s/.test(token)) {
  process.stderr.write('授权写入失败：请通过标准输入传入一个不含空白字符的 Token。\n');
  process.exit(1);
}

const authDir = path.join(os.homedir(), '.xiaoan');
const authPath = path.join(authDir, 'mcp-auth.json');
const tempPath = path.join(authDir, `.mcp-auth-${process.pid}.tmp`);

fs.mkdirSync(authDir, { recursive: true, mode: 0o700 });
fs.chmodSync(authDir, 0o700);
fs.writeFileSync(tempPath, `${JSON.stringify({ token })}\n`, { mode: 0o600 });
fs.renameSync(tempPath, authPath);
fs.chmodSync(authPath, 0o600);

process.stdout.write(`小安 MCP 授权已安全保存到 ${authPath}（权限 600）。\n`);
