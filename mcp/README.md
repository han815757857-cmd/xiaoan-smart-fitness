# 小安智能健身官方 MCP

> 阶段：M3.6
> 公网入口：`https://xiaoan.39-108-49-182.sslip.io/mcp`
> 存储：生产必须显式设置 `XIAOAN_STORE=feishu`；未配置时拒绝创建或查询订单。

## 当前工具

| 工具 | 作用 | 当前实现 |
|---|---|---|
| `list_services` | 查询可预约服务 | 返回 `1 对 1 健身私教训练` |
| `create_booking` | 创建预约订单 | 生产写入飞书；未配置时明确失败 |
| `get_booking` | 查询预约状态 | 生产查询飞书；未配置时明确失败 |

## 本地启动

stdio 模式：

```bash
npm start
```

HTTP 模式：

```bash
MCP_AUTH_TOKEN=请替换为长随机密钥 npm run start:http
```

本机地址：

- 健康检查：`http://127.0.0.1:3000/health`
- MCP 入口：`http://127.0.0.1:3000/mcp`

正式部署时由托管平台负责 HTTPS，服务端以 `HOST=0.0.0.0` 监听容器端口。

## 本地冒烟测试

```bash
npm run smoke:test
```

上述测试脚本会显式开启本地 mock。手工启动服务时，只有同时设置下列两项才允许 mock：

```bash
XIAOAN_STORE=local XIAOAN_ALLOW_MOCK=true npm start
```

未配置订单存储时必须拒绝创建订单，用下列回归测试验证：

```bash
npm run store:safety:test
```

HTTP 传输层验收：

```bash
npm run http:test
```

该测试会验证健康检查、访问令牌、协议协商、工具列表和商品查询。

## 飞书写入模式

```bash
XIAOAN_STORE=feishu npm run smoke:test
```

本机未设置应用凭证时，飞书模式沿用已登录的 `lark-cli`；云端设置应用凭证后，自动通过 `tenant_access_token` 直连飞书 OpenAPI。当前默认目标：

- Base Token：`IGcObGkCcaMoGRsbNb2cJ3KKnEe`
- Table ID：`tblm6yZvCk95yJmo`

云端环境变量（密钥只放在服务器，不写入代码、文档或 GitHub）：

```bash
XIAOAN_STORE=feishu
FEISHU_APP_ID=你的专用飞书应用ID
FEISHU_APP_SECRET=只保存在服务器上的应用密钥
FEISHU_BASE_TOKEN=IGcObGkCcaMoGRsbNb2cJ3KKnEe
FEISHU_TABLE_ID=tblm6yZvCk95yJmo
```

OpenAPI 存储适配器的无联网模拟测试：

```bash
npm run feishu:openapi:test
```

## M3.5 查单、防重复和日志验收

```bash
npm run m3-5:test
```

飞书模式：

```bash
XIAOAN_STORE=feishu npm run m3-5:test
```

该测试会验证：

- 首次创建订单成功
- 相同 `idempotency_key` 重试不会重复下单
- 同一教练同一日期时间段不会创建第二笔有效订单
- 可通过订单ID和手机号后四位查回公开状态
- 调用日志写入 `data/call-logs.jsonl`

成功时会看到类似结果：

```json
{
  "initialize": {
    "name": "xiaoan-smart-fitness-mcp",
    "version": "0.1.0-test"
  },
  "tools": [
    "list_services",
    "create_booking",
    "get_booking"
  ],
  "first_service": "xiaoan-pt-60",
  "created_booking": "XA-20260718-0001",
  "queried_status": "待确认"
}
```

## 重要说明

- 这一版是 MCP 服务骨架，不直接收集银行卡，也不代替支付。
- 测试阶段付款方式仍是“到店支付”。
- 金额字段在业务侧统一记为 `金额（元）=200`。
- 本地 mock 仅用于显式的开发测试，不得对用户表述为真实预约。
- HTTP 入口按 MCP Streamable HTTP 的单一 `/mcp` 端点设计；首版不启用服务端 SSE 推送。
- 已加入 Origin 校验、1 MB 请求体限制和可选 Bearer Token。公网部署时 `MCP_AUTH_TOKEN` 必须设置。
- 云端飞书模式使用专用应用的 `tenant_access_token`；应用密钥必须只保存在服务器环境变量中，不得写进 GitHub、日志或 MCP 返回值。
