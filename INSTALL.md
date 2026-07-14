# 小安智能健身 MCP 安装指南

## 给朋友的安装步骤

### 第一步：安装 Claude Desktop

如果还没有安装，请访问 [Claude Desktop 官网](https://claude.ai/download) 下载。

### 第二步：安装小安智能健身 Skill

在 Claude Desktop 中输入：

```
/install https://github.com/han815757857-cmd/xiaoan-smart-fitness
```

### 第三步：配置授权（重要！）

MCP 服务需要授权才能访问。请联系管理员获取授权 token。

收到 token 后，创建配置文件：

**Mac/Linux:**
```bash
mkdir -p ~/.xiaoan
echo '{"token": "你的token"}' > ~/.xiaoan/mcp-auth.json
```

**Windows:**
```powershell
New-Item -ItemType Directory -Force -Path "$env:USERPROFILE\.xiaoan"
'{"token": "你的token"}' | Out-File -FilePath "$env:USERPROFILE\.xiaoan\mcp-auth.json" -Encoding UTF8
```

### 第四步：开始使用

在 Claude 中说：

```
帮我预约小安健身，明天下午3点
```

或者：

```
查询小安健身有什么服务
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
