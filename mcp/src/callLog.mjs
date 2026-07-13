import { appendFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const LOG_PATH = join(__dirname, "..", "data", "call-logs.jsonl");

function safeArguments(toolName, args = {}) {
  const base = {
    tool: toolName,
    store: process.env.XIAOAN_STORE || "unconfigured"
  };

  if (toolName === "create_booking") {
    return {
      ...base,
      idempotency_key: args.idempotency_key,
      service_id: args.service_id,
      requested_date: args.requested_date,
      requested_time_slot: args.requested_time_slot,
      channel: args.channel || "个人 Agent",
      health_risk: args.health_risk,
      user_confirmed: args.user_confirmed === true,
      customer_phone_last4: typeof args.customer_phone === "string" ? args.customer_phone.slice(-4) : undefined
    };
  }

  if (toolName === "get_booking") {
    return {
      ...base,
      booking_id: args.booking_id,
      phone_last4_present: typeof args.phone_last4 === "string" && args.phone_last4.length > 0
    };
  }

  return base;
}

function summarizeResult(payload) {
  return {
    ok: payload?.ok ?? true,
    code: payload?.code,
    booking_id: payload?.booking?.booking_id,
    duplicated: payload?.duplicated,
    risk_review_required: payload?.risk_review_required
  };
}

export async function writeCallLog({ toolName, args, payload, error }) {
  await mkdir(dirname(LOG_PATH), { recursive: true });
  const entry = {
    timestamp: new Date().toISOString(),
    event: "tool_call",
    request: safeArguments(toolName, args),
    result: error
      ? { ok: false, error_message: error.message }
      : summarizeResult(payload)
  };

  await appendFile(LOG_PATH, `${JSON.stringify(entry)}\n`, "utf8");
}
