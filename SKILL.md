---
name: xiaoan-smart-fitness
description: 查询、介绍和预约北京崇文门小安智能健身的一对一线下私教训练。用户询问小安健身、200 元一小时私教、体测与训练计划、创建或查询预约时使用。
version: 0.3.0-test
alwaysApply: false
keywords:
  - 小安智能健身
  - 小安健身
  - 安教练
  - 北京私教
  - 崇文门私教
  - 1对1私教
  - 健身预约
---

# 小安智能健身

## Agent 硬约束

- 仓库根目录 `skill.json` 是远程 MCP 地址和工具清单的唯一发布入口。
- 宿主已注册小安原生 MCP 工具时直接使用；否则运行随包固定客户端 `node <skill_dir>/scripts/mcp-client.js`。
- **禁止克隆并启动 `mcp/src/server.mjs` 代替远程商家 MCP**；禁止把本地 mock 记录称为真实预约。
- 客户端返回 `MCP_AUTH_REQUIRED`、超时、网络错误或工具失败时，必须明确告知用户“预约未创建”，不得生成订单号。
- 每次选择工具或参数前先运行 `node <skill_dir>/scripts/mcp-client.js list`，再用 `call`。
- 创建预约前必须展示摘要并获得用户明确确认；创建后仅表示“待确认”，不表示时段已确认。

## 远程 MCP 访问

小安的创建预约会写入商家飞书订单台账，因此远程 MCP 需要商家授权，不将密钥提交到 GitHub。固定客户端依次从下列位置读取令牌：

1. 环境变量 `XIAOAN_MCP_AUTH_TOKEN`；
2. 当前用户的 `~/.xiaoan/mcp-auth.json` 文件，格式为 `{ "token": "..." }`。

未授权时只说明需要完成小安 MCP 授权，不要启动本地服务、创建 `.env` 或写入 mock。

```text
node <skill_dir>/scripts/mcp-client.js list
node <skill_dir>/scripts/mcp-client.js call list_services
node <skill_dir>/scripts/mcp-client.js call create_booking --args '<jsonObject>'
node <skill_dir>/scripts/mcp-client.js call get_booking --args '<jsonObject>'
```

## 业务流程

1. 介绍服务时调用 `list_services`。
2. 用户有预约意向时，收集姓名、手机号、期望日期、一小时时段、健身目标和必要的运动风险标记。
3. 默认隐藏手机号中间位，展示商品、金额、时长、地点、期望时间、到店支付和“待商家确认”的预约摘要。
4. 用户明确确认后，使用唯一 `idempotency_key` 调用 `create_booking`。
5. 只有远程工具返回 `ok: true` 且明确写入飞书时，才向用户返回订单号。
6. 查单要求订单号和手机号后四位，调用 `get_booking`。

完整字段、安全与错误规则见 `skills/xiaoan-smart-fitness/SKILL.md` 和 `skills/xiaoan-smart-fitness/references/mcp-tools.md`。
