import { spawn } from "node:child_process";
import { createInterface } from "node:readline/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

const child = spawn("node", ["src/server.mjs"], {
  cwd: root,
  stdio: ["pipe", "pipe", "pipe"],
  env: process.env
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
  return new Promise((resolve) => {
    pending.set(id, resolve);
    child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`);
  });
}

function parseToolText(response) {
  if (response.error) throw new Error(JSON.stringify(response.error));
  return JSON.parse(response.result.content[0].text);
}

function testBookingTime() {
  const seed = Math.floor(Date.now() / 1000);
  const dayOffset = seed % 3650;
  const hour = 10 + (seed % 10);
  const date = new Date(Date.UTC(2038, 0, 1 + dayOffset));
  return {
    requested_date: date.toISOString().slice(0, 10),
    requested_time_slot: `${String(hour).padStart(2, "0")}:00-${String(hour + 1).padStart(2, "0")}:00`
  };
}

await request("initialize", {
  protocolVersion: "2025-06-18",
  capabilities: {},
  clientInfo: { name: "m3-5-test", version: "0.1.0" }
});

const bookingTime = testBookingTime();
const createArgs = {
  idempotency_key: `m3-5-${Date.now()}`,
  service_id: "xiaoan-pt-60",
  customer_name: "M3.5测试用户",
  customer_phone: "13900139000",
  requested_date: bookingTime.requested_date,
  requested_time_slot: bookingTime.requested_time_slot,
  fitness_goal: "验证查单、防重复和调用日志",
  health_risk: "none",
  health_note: "",
  user_confirmed: true,
  channel: "个人 Agent"
};

const created = parseToolText(await request("tools/call", {
  name: "create_booking",
  arguments: createArgs
}));
if (!created.ok) throw new Error(`首次创建失败：${JSON.stringify(created)}`);

const repeated = parseToolText(await request("tools/call", {
  name: "create_booking",
  arguments: createArgs
}));
if (!repeated.ok || repeated.duplicated !== true) {
  throw new Error(`幂等重复校验失败：${JSON.stringify(repeated)}`);
}

const conflict = parseToolText(await request("tools/call", {
  name: "create_booking",
  arguments: {
    ...createArgs,
    idempotency_key: `m3-5-conflict-${Date.now()}`,
    customer_name: "M3.5冲突测试用户",
    customer_phone: "13700137000"
  }
}));
if (conflict.ok !== false || conflict.code !== "TIME_SLOT_CONFLICT") {
  throw new Error(`时间冲突校验失败：${JSON.stringify(conflict)}`);
}

const queried = parseToolText(await request("tools/call", {
  name: "get_booking",
  arguments: {
    booking_id: created.booking.booking_id,
    phone_last4: "9000"
  }
}));
if (!queried.ok || queried.booking.booking_id !== created.booking.booking_id) {
  throw new Error(`查单失败：${JSON.stringify(queried)}`);
}

console.log(JSON.stringify({
  store: process.env.XIAOAN_STORE || "local",
  created_booking: created.booking.booking_id,
  repeated_returned_same_booking: repeated.booking.booking_id === created.booking.booking_id,
  conflict_code: conflict.code,
  queried_status: queried.booking.order_status,
  call_log: "data/call-logs.jsonl"
}, null, 2));

child.kill();
