import { listServices } from "./catalog.mjs";
import { createBooking, getBooking } from "./bookingService.mjs";
import { writeCallLog } from "./callLog.mjs";

export const SUPPORTED_PROTOCOL_VERSIONS = ["2025-11-25", "2025-06-18"];

export const SERVER_INFO = {
  name: "xiaoan-smart-fitness-mcp",
  title: "小安智能健身官方 MCP",
  version: "0.2.0-test",
  description: "查询小安智能健身服务、创建一对一私教预约并查询预约状态。"
};

export const TOOL_DEFINITIONS = [
  {
    name: "list_services",
    description: "查询小安智能健身当前可预约服务。首版只有 1 对 1 健身私教训练。",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false
    }
  },
  {
    name: "create_booking",
    description: "用户明确确认后，创建 1 对 1 私教训练预约订单并写入订单台账。",
    inputSchema: {
      type: "object",
      required: [
        "idempotency_key",
        "service_id",
        "customer_name",
        "customer_phone",
        "requested_date",
        "requested_time_slot",
        "fitness_goal",
        "health_risk",
        "user_confirmed"
      ],
      properties: {
        idempotency_key: { type: "string", description: "客户端生成的唯一防重复键。" },
        service_id: { type: "string", enum: ["xiaoan-pt-60"] },
        customer_name: { type: "string" },
        customer_phone: { type: "string" },
        requested_date: { type: "string", description: "YYYY-MM-DD" },
        requested_time_slot: { type: "string", description: "一小时时间段，例如 14:00-15:00" },
        fitness_goal: { type: "string" },
        health_risk: { type: "string", enum: ["none", "reported", "unsure"] },
        health_note: { type: "string" },
        user_confirmed: { type: "boolean", const: true },
        channel: { type: "string", enum: ["个人 Agent", "美团", "千问", "其他"] }
      },
      additionalProperties: false
    }
  },
  {
    name: "get_booking",
    description: "通过订单ID和手机号后四位查询预约公开状态。",
    inputSchema: {
      type: "object",
      required: ["booking_id", "phone_last4"],
      properties: {
        booking_id: { type: "string" },
        phone_last4: { type: "string" }
      },
      additionalProperties: false
    }
  }
];

function textResult(payload) {
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(payload, null, 2)
      }
    ],
    structuredContent: payload
  };
}

function errorResponse(id, code, message) {
  return {
    jsonrpc: "2.0",
    id: id ?? null,
    error: { code, message }
  };
}

function negotiatedVersion(requestedVersion) {
  return SUPPORTED_PROTOCOL_VERSIONS.includes(requestedVersion)
    ? requestedVersion
    : SUPPORTED_PROTOCOL_VERSIONS[0];
}

export function isNotification(request) {
  return request && request.id === undefined;
}

export async function handleRequest(request) {
  if (!request || request.jsonrpc !== "2.0" || typeof request.method !== "string") {
    return errorResponse(request?.id, -32600, "无效的 JSON-RPC 请求");
  }

  const { id, method, params } = request;

  try {
    if (method === "initialize") {
      return {
        jsonrpc: "2.0",
        id,
        result: {
          protocolVersion: negotiatedVersion(params?.protocolVersion),
          capabilities: { tools: {} },
          serverInfo: SERVER_INFO,
          instructions: "仅在用户确认服务、日期、时段、姓名和手机号后创建预约；涉及健康风险时提示需要人工评估。"
        }
      };
    }

    if (method === "ping") {
      return { jsonrpc: "2.0", id, result: {} };
    }

    if (method === "tools/list") {
      return {
        jsonrpc: "2.0",
        id,
        result: { tools: TOOL_DEFINITIONS }
      };
    }

    if (method === "tools/call") {
      const toolName = params?.name;
      const args = params?.arguments ?? {};
      let payload;

      try {
        if (toolName === "list_services") {
          payload = listServices();
        } else if (toolName === "create_booking") {
          payload = await createBooking(args);
        } else if (toolName === "get_booking") {
          payload = await getBooking(args);
        } else {
          return errorResponse(id, -32602, `未知工具：${toolName}`);
        }

        await writeCallLog({ toolName, args, payload });
      } catch (error) {
        await writeCallLog({ toolName, args, error });
        throw error;
      }

      return {
        jsonrpc: "2.0",
        id,
        result: textResult(payload)
      };
    }

    if (method === "notifications/initialized" || method === "notifications/cancelled") {
      return null;
    }

    return errorResponse(id, -32601, `暂不支持的方法：${method}`);
  } catch (error) {
    return errorResponse(id, -32603, error.message);
  }
}
