# 小安智能健身 MCP API 文档

## 服务端点

- **URL**: `http://39.108.49.182:3001/mcp`
- **协议**: MCP (Model Context Protocol) over HTTP
- **授权**: Bearer Token
- **Token**: `xiaoan-mcp-2026-secure-token-7d4f9a2b`

---

## 请求格式

所有请求使用 JSON-RPC 2.0 格式：

```http
POST /mcp HTTP/1.1
Host: 39.108.49.182:3001
Content-Type: application/json
Authorization: Bearer xiaoan-mcp-2026-secure-token-7d4f9a2b

{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "method_name",
  "params": { ... }
}
```

---

## 1. 初始化连接

### 请求

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "initialize",
  "params": {
    "protocolVersion": "2024-11-05",
    "capabilities": {},
    "clientInfo": {
      "name": "your-agent",
      "version": "1.0"
    }
  }
}
```

### 响应

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "protocolVersion": "2025-11-25",
    "capabilities": {
      "tools": {}
    },
    "serverInfo": {
      "name": "xiaoan-smart-fitness-mcp",
      "version": "0.3.0-test"
    }
  }
}
```

---

## 2. 查询服务列表

### 请求

```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "method": "tools/call",
  "params": {
    "name": "list_services",
    "arguments": {}
  }
}
```

### 响应

```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "result": {
    "content": [{
      "type": "text",
      "text": "{\"services\": [{\"service_id\": \"xiaoan-pt-60\", \"name\": \"1 对 1 健身私教训练\", \"duration_minutes\": 60, \"price_cny\": 200, ...}]}"
    }]
  }
}
```

---

## 3. 创建预约

### 请求

```json
{
  "jsonrpc": "2.0",
  "id": 3,
  "method": "tools/call",
  "params": {
    "name": "create_booking",
    "arguments": {
      "idempotency_key": "unique-request-id",
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
}
```

### 参数说明

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `idempotency_key` | string | 是 | 幂等键，防止重复提交 |
| `service_id` | string | 是 | 服务ID（xiaoan-pt-60） |
| `customer_name` | string | 是 | 客户姓名 |
| `customer_phone` | string | 是 | 手机号（11位） |
| `requested_date` | string | 是 | 预约日期（YYYY-MM-DD） |
| `requested_time_slot` | string | 是 | 时间段（HH:MM-HH:MM） |
| `fitness_goal` | string | 是 | 健身目标 |
| `health_risk` | string | 是 | 健康风险评估（none/minor/major） |
| `user_confirmed` | boolean | 是 | 用户确认（必须为 true） |

### 响应

```json
{
  "jsonrpc": "2.0",
  "id": 3,
  "result": {
    "content": [{
      "type": "text",
      "text": "{\"ok\": true, \"booking\": {\"booking_id\": \"XA-20260720-0001\", \"order_status\": \"待确认\", ...}}"
    }],
    "structuredContent": {
      "ok": true,
      "duplicated": false,
      "booking": {
        "booking_id": "XA-20260720-0001",
        "order_status": "待确认",
        "service_name": "1 对 1 健身私教训练",
        "requested_date": "2026-07-20 00:00:00",
        "requested_time_slot": "15:00-16:00"
      },
      "message": "预约已创建，并已写入飞书多维表格。"
    }
  }
}
```

---

## 4. 查询预约

### 请求

```json
{
  "jsonrpc": "2.0",
  "id": 4,
  "method": "tools/call",
  "params": {
    "name": "get_booking",
    "arguments": {
      "booking_id": "XA-20260720-0001",
      "customer_phone_last4": "8000"
    }
  }
}
```

### 参数说明

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `booking_id` | string | 是 | 订单号 |
| `customer_phone_last4` | string | 是 | 手机号后4位 |

### 响应

```json
{
  "jsonrpc": "2.0",
  "id": 4,
  "result": {
    "content": [{
      "type": "text",
      "text": "{\"ok\": true, \"booking\": {...}}"
    }]
  }
}
```

---

## 错误处理

### 授权失败

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "error": {
    "code": -32001,
    "message": "Unauthorized: missing or invalid MCP_AUTH_TOKEN"
  }
}
```

### 参数错误

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "error": {
    "code": -32602,
    "message": "Invalid params: customer_phone must be 11 digits"
  }
}
```

---

## 代码示例

### Python

```python
import requests

url = "http://39.108.49.182:3001/mcp"
headers = {
    "Content-Type": "application/json",
    "Authorization": "Bearer xiaoan-mcp-2026-secure-token-7d4f9a2b"
}

# 创建预约
payload = {
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
            "user_confirmed": True
        }
    }
}

response = requests.post(url, json=payload, headers=headers)
print(response.json())
```

### JavaScript

```javascript
const response = await fetch('http://39.108.49.182:3001/mcp', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer xiaoan-mcp-2026-secure-token-7d4f9a2b'
  },
  body: JSON.stringify({
    jsonrpc: '2.0',
    id: 1,
    method: 'tools/call',
    params: {
      name: 'create_booking',
      arguments: {
        idempotency_key: 'unique-key-123',
        service_id: 'xiaoan-pt-60',
        customer_name: '张三',
        customer_phone: '13800138000',
        requested_date: '2026-07-20',
        requested_time_slot: '15:00-16:00',
        fitness_goal: '减脂塑形',
        health_risk: 'none',
        user_confirmed: true
      }
    }
  })
});

const data = await response.json();
console.log(data);
```

---

## 注意事项

1. **幂等性**：使用 `idempotency_key` 防止重复提交
2. **授权**：所有请求必须带上 Bearer Token
3. **时间格式**：日期格式为 `YYYY-MM-DD`，时间段格式为 `HH:MM-HH:MM`
4. **手机号**：必须是11位数字
5. **订单查询**：需要订单号 + 手机号后4位双重验证

---

## 联系方式

- **技术支持**：GitHub Issues
- **商务合作**：138-0013-8000

**部署时间**：2026-07-14  
**版本**：0.3.0
