import { spawn } from "node:child_process";
import { createInterface } from "node:readline/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

const child = spawn("node", ["src/server.mjs"], {
  cwd: root,
  stdio: ["pipe", "pipe", "pipe"]
});

child.stderr.on("data", (chunk) => {
  process.stderr.write(chunk);
});

const reader = createInterface({ input: child.stdout });
const pending = new Map();

reader.on("line", (line) => {
  const response = JSON.parse(line);
  const callback = pending.get(response.id);
  if (callback) {
    pending.delete(response.id);
    callback(response);
  }
});

let nextId = 1;

function request(method, params = {}) {
  const id = nextId++;
  const payload = { jsonrpc: "2.0", id, method, params };
  return new Promise((resolve) => {
    pending.set(id, resolve);
    child.stdin.write(`${JSON.stringify(payload)}\n`);
  });
}

function parseToolText(response) {
  const text = response.result.content[0].text;
  return JSON.parse(text);
}

function smokeBookingTime() {
  const seed = Math.floor(Date.now() / 1000);
  const dayOffset = seed % 3650;
  const hour = 10 + (seed % 10);
  const date = new Date(Date.UTC(2027, 0, 1 + dayOffset));
  return {
    requested_date: date.toISOString().slice(0, 10),
    requested_time_slot: `${String(hour).padStart(2, "0")}:00-${String(hour + 1).padStart(2, "0")}:00`
  };
}

const initialize = await request("initialize", {
  protocolVersion: "2025-06-18",
  capabilities: {},
  clientInfo: { name: "xiaoan-smoke-test", version: "0.1.0" }
});

const tools = await request("tools/list");
const services = parseToolText(await request("tools/call", { name: "list_services", arguments: {} }));
const bookingTime = smokeBookingTime();
const bookingResult = parseToolText(await request("tools/call", {
  name: "create_booking",
  arguments: {
    idempotency_key: `smoke-${Date.now()}`,
    service_id: "xiaoan-pt-60",
    customer_name: "测试用户",
    customer_phone: "13800138000",
    requested_date: bookingTime.requested_date,
    requested_time_slot: bookingTime.requested_time_slot,
    fitness_goal: "减脂和改善体态",
    health_risk: "none",
    health_note: "",
    user_confirmed: true,
    channel: "个人 Agent"
  }
}));

if (!bookingResult.ok) {
  throw new Error(`创建测试订单失败：${JSON.stringify(bookingResult)}`);
}

const queried = parseToolText(await request("tools/call", {
  name: "get_booking",
  arguments: {
    booking_id: bookingResult.booking.booking_id,
    phone_last4: "8000"
  }
}));

console.log(JSON.stringify({
  initialize: initialize.result.serverInfo,
  tools: tools.result.tools.map((tool) => tool.name),
  first_service: services.services[0].service_id,
  created_booking: bookingResult.booking.booking_id,
  queried_status: queried.booking.order_status
}, null, 2));

child.kill();
