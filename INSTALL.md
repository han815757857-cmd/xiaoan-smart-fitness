# 小安智能健身 MCP 接入指南

**任何 AI Agent 都可以连接到小安智能健身 MCP 服务，实现自然语言预约健身私教。**

---

## 🚀 快速接入（3种方式）

### 方式一：Claude Desktop（推荐，最简单）

1. 安装 [Claude Desktop](https://claude.ai/download)
2. 在对话中输入：
   ```
   /install https://github.com/han815757857-cmd/xiaoan-smart-fitness
   ```
3. 开始使用：
   ```
   帮我预约小安健身，明天下午3点
   ```

### 方式二：通用 MCP 客户端

**服务器配置：**
```json
{
  "mcpServers": {
    "xiaoan-smart-fitness": {
      "transport": "streamable-http",
      "url": "http://39.108.49.182:3001/mcp",
      "headers": {
        "Authorization": "Bearer xiaoan-mcp-2026-secure-token-7d4f9a2b"
      }
    }
  }
}
```

**支持的工具：**
- `list_services` - 查询服务目录
- `create_booking` - 创建预约
- `get_booking` - 查询预约状态

### 方式三：直接 HTTP 调用

**示例：创建预约**

```bash
curl -X POST http://39.108.49.182:3001/mcp \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer xiaoan-mcp-2026-secure-token-7d4f9a2b" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "tools/call",
    "params": {
      "name": "create_booking",
      "arguments": {
        "idempotency_key": "unique-key-123",
        "service_id": "xiaoan-pt-60",
        "customer_name": "张三",
        "customer_phone": "13800138000",
        "requested_date": "2026-07-20",
        "requested_time_slot": "15:00-16:00",
        "fitness_goal": "减脂塑形",
        "health_risk": "none",
        "user_confirmed": true
      }
    }
  }'
```

**返回示例：**
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "content": [{
      "type": "text",
      "text": "{\"ok\": true, \"booking\": {\"booking_id\": \"XA-20260720-0001\", ...}}"
    }]
  }
}
```

---

## 服务信息

- **服务商**：北京崇文门小安智能健身
- **服务内容**：1 对 1 私教训练
- **价格**：200 元 / 60 分钟
- **支付方式**：到店支付
- **预约方式**：通过 Claude 对话即可预约

---

## 技术信息

- **MCP 服务器**：http://39.108.49.182:3001/mcp
- **存储方式**：飞书多维表格
- **授权方式**：Bearer Token

---

## 常见问题

**Q: 为什么需要授权 token？**  
A: 为了防止滥用，保护小安的预约系统。

**Q: 预约后需要付款吗？**  
A: 测试阶段到店支付，预约成功会收到确认信息。

**Q: 可以取消预约吗？**  
A: 请联系小安客服：138-0013-8000

---

**部署完成时间**：2026-07-14  
**版本**：0.3.0
