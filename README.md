# 小安智能健身

小安智能健身官方 Agent 接入仓库，包含两部分：

- 根目录 `SKILL.md` + `skill.json` + `scripts/mcp-client.js`：面向 Agent 安装的正式入口，固定调用商家远程 MCP。
- `skills/xiaoan-smart-fitness/`：帮助个人 Agent 发现、理解并正确沟通服务。
- `mcp/`：查询服务、创建预约和查询订单的 MCP 服务端。

首版商品为“1 对 1 健身私教训练”，200 元 / 60 分钟，测试阶段到店支付。订单写入商家授权的飞书多维表格。

## 个人 Agent 授权

在 Agent 所在设备上，由商家通过标准输入将 MCP Token 传给配置脚本。脚本不接受命令行参数，避免 Token 落入 shell 历史：

```bash
sed -n 's/^MCP_AUTH_TOKEN=//p' ~/xiaoan-smart-fitness/mcp/.env | node ~/xiaoan-smart-fitness/scripts/configure-auth.js
node ~/xiaoan-smart-fitness/scripts/mcp-client.js list
```

授权保存在当前用户的 `~/.xiaoan/mcp-auth.json`，文件权限为 `600`；不得提交到 GitHub。

### OpenClaw 2026.3.x 兼容

OpenClaw 2026.3.x 可保存 HTTP MCP 配置，但部分版本只向 Agent 投射 stdio MCP。仓库提供 `scripts/mcp-stdio-proxy.js` 作为宿主机兼容桥：

- OpenClaw 仅启动该 stdio 进程；
- 兼容桥只访问本机 `http://127.0.0.1:3000/mcp`；
- Token 仅从商家服务器 `mcp/.env` 读取，不进入 Agent 沙箱和 OpenClaw 配置；
- 订单仍由同一个云端 MCP 写入飞书，不使用 mock。

兼容桥回归测试：

```bash
cd mcp
npm run stdio:proxy:test
```

## 安全边界

- MCP 不收集银行卡信息，也不代替支付。
- 创建预约前必须获得用户明确确认。
- 飞书应用密钥和 MCP 访问令牌只保存在服务器 `.env`，不得提交到 GitHub。
- 完整手机号、健康风险说明和商家备注不通过查单接口对外返回。
- 未配置真实飞书存储时，创建预约会直接失败；只有同时显式设置 `XIAOAN_STORE=local` 和 `XIAOAN_ALLOW_MOCK=true` 才允许本地 mock 测试。

## MCP 本地验收

```bash
cd mcp
npm run smoke:test
npm run http:test
npm run feishu:openapi:test
```

## 容器运行

复制 `mcp/.env.example` 为 `mcp/.env` 并填写真实密钥，然后执行：

```bash
cd mcp
docker compose up -d --build
```

容器只绑定服务器本机 `127.0.0.1:3000`；公网访问必须通过带有效证书的 HTTPS 反向代理。

如果服务器无法访问 Docker Hub，可直接使用服务器自带的 Node.js 22 和用户级 systemd：

```bash
mkdir -p ~/.config/systemd/user mcp/data
cp mcp/deploy/xiaoan-mcp.service ~/.config/systemd/user/
systemctl --user daemon-reload
systemctl --user enable --now xiaoan-mcp
```

服务文件强制监听 `127.0.0.1:3000`，并设置自动重启；启用用户 linger 后可在服务器重启后自动运行。
