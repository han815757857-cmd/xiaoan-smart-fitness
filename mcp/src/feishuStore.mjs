import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const DEFAULT_BASE_TOKEN = "IGcObGkCcaMoGRsbNb2cJ3KKnEe";
const DEFAULT_TABLE_ID = "tblm6yZvCk95yJmo";
const DEFAULT_API_BASE_URL = "https://open.feishu.cn/open-apis";

const PROJECT_FIELDS = [
  "订单ID",
  "幂等键",
  "订单状态",
  "教练",
  "商品名称",
  "手机号后四位",
  "预定日期",
  "预定时间段",
  "确认时间",
  "支付状态",
  "对外备注"
];

const DATE_ONLY_FIELDS = new Set(["预定日期"]);
const DATE_TIME_FIELDS = new Set(["下单时间", "确认时间", "更新时间"]);
const RETRYABLE_FEISHU_CODES = new Set([1254290, 1254607, 1255040]);
const TOKEN_SAFETY_WINDOW_MS = 5 * 60 * 1000;

let tokenCache = null;

function config() {
  return {
    appId: process.env.FEISHU_APP_ID || "",
    appSecret: process.env.FEISHU_APP_SECRET || "",
    baseToken: process.env.FEISHU_BASE_TOKEN || DEFAULT_BASE_TOKEN,
    tableId: process.env.FEISHU_TABLE_ID || DEFAULT_TABLE_ID,
    apiBaseUrl: (process.env.FEISHU_API_BASE_URL || DEFAULT_API_BASE_URL).replace(/\/$/, "")
  };
}

function useOpenApi() {
  const { appId, appSecret } = config();
  if (appId && appSecret) return true;
  if (appId || appSecret) {
    throw new Error("FEISHU_APP_ID 和 FEISHU_APP_SECRET 必须同时设置");
  }
  return false;
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function beijingTimestamp(value) {
  if (typeof value === "number") return value;
  if (typeof value !== "string" || value.trim() === "") return value;

  const normalized = value.trim().replace(" ", "T");
  const hasTime = normalized.includes("T");
  const iso = hasTime ? `${normalized}+08:00` : `${normalized}T00:00:00+08:00`;
  const timestamp = Date.parse(iso);
  if (!Number.isFinite(timestamp)) throw new Error(`无法转换飞书日期：${value}`);
  return timestamp;
}

function formatBeijingTimestamp(value, dateOnly) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return value;

  const parts = new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  }).formatToParts(date);
  const get = (type) => parts.find((part) => part.type === type)?.value;
  const day = `${get("year")}-${get("month")}-${get("day")}`;
  return dateOnly ? `${day} 00:00:00` : `${day} ${get("hour")}:${get("minute")}:${get("second")}`;
}

function normalizeTextArray(value) {
  if (!Array.isArray(value)) return value;
  if (value.every((item) => item && typeof item === "object" && typeof item.text === "string")) {
    return value.map((item) => item.text).join("");
  }
  return value.length === 1 ? value[0] : value;
}

function normalizeFieldValue(field, value) {
  if ((DATE_ONLY_FIELDS.has(field) || DATE_TIME_FIELDS.has(field)) && typeof value === "number") {
    return formatBeijingTimestamp(value, DATE_ONLY_FIELDS.has(field));
  }
  return normalizeTextArray(value);
}

function normalizeRecord(record) {
  return Object.fromEntries(
    Object.entries(record.fields || {}).map(([field, value]) => [field, normalizeFieldValue(field, value)])
  );
}

function prepareFieldsForWrite(booking) {
  const fields = {};
  for (const [field, value] of Object.entries(booking)) {
    if ((DATE_ONLY_FIELDS.has(field) || DATE_TIME_FIELDS.has(field))) {
      if (value === "" || value === null || value === undefined) continue;
      fields[field] = beijingTimestamp(value);
      continue;
    }
    fields[field] = value;
  }
  return fields;
}

async function getTenantAccessToken({ forceRefresh = false } = {}) {
  const { appId, appSecret, apiBaseUrl } = config();
  if (!appId || !appSecret) throw new Error("云端飞书模式缺少 FEISHU_APP_ID 或 FEISHU_APP_SECRET");

  if (!forceRefresh && tokenCache && tokenCache.expiresAt - TOKEN_SAFETY_WINDOW_MS > Date.now()) {
    return tokenCache.token;
  }

  const response = await fetch(`${apiBaseUrl}/auth/v3/tenant_access_token/internal`, {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify({ app_id: appId, app_secret: appSecret })
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.code !== 0 || !payload.tenant_access_token) {
    throw new Error(`飞书应用鉴权失败（HTTP ${response.status} / code ${payload.code ?? "unknown"}）：${payload.msg || "未知错误"}`);
  }

  tokenCache = {
    token: payload.tenant_access_token,
    expiresAt: Date.now() + Number(payload.expire || 7200) * 1000
  };
  return tokenCache.token;
}

async function feishuRequest(path, options = {}) {
  let lastError;
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    try {
      const token = await getTenantAccessToken({ forceRefresh: attempt > 1 && lastError?.tokenExpired });
      const response = await fetch(`${config().apiBaseUrl}${path}`, {
        ...options,
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json; charset=utf-8",
          ...(options.headers || {})
        }
      });
      const payload = await response.json().catch(() => ({}));
      if (response.ok && payload.code === 0) return payload.data;

      const error = new Error(`飞书 OpenAPI 调用失败（HTTP ${response.status} / code ${payload.code ?? "unknown"}）：${payload.msg || "未知错误"}`);
      error.retryable = response.status === 429 || response.status >= 500 || RETRYABLE_FEISHU_CODES.has(payload.code);
      error.tokenExpired = response.status === 401 || payload.code === 99991663 || payload.code === 99991664;
      if (error.tokenExpired) tokenCache = null;
      throw error;
    } catch (error) {
      lastError = error;
      const networkRetryable = error instanceof TypeError;
      if (attempt === 4 || (!error.retryable && !error.tokenExpired && !networkRetryable)) throw error;
      await delay(attempt * 500);
    }
  }
  throw lastError;
}

async function readBookingsOpenApi() {
  const { baseToken, tableId } = config();
  const records = [];
  let pageToken = "";

  do {
    const query = new URLSearchParams({ page_size: "500" });
    if (pageToken) query.set("page_token", pageToken);
    const data = await feishuRequest(
      `/bitable/v1/apps/${encodeURIComponent(baseToken)}/tables/${encodeURIComponent(tableId)}/records/search?${query}`,
      { method: "POST", body: JSON.stringify({ field_names: PROJECT_FIELDS }) }
    );
    records.push(...(data.items || []).map(normalizeRecord));
    pageToken = data.has_more ? data.page_token || "" : "";
  } while (pageToken);

  return records;
}

async function writeBookingOpenApi(booking) {
  const { baseToken, tableId } = config();
  const data = await feishuRequest(
    `/bitable/v1/apps/${encodeURIComponent(baseToken)}/tables/${encodeURIComponent(tableId)}/records`,
    { method: "POST", body: JSON.stringify({ fields: prepareFieldsForWrite(booking) }) }
  );
  return data.record;
}

async function larkBase(args) {
  const maxAttempts = 5;
  let lastError;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const { stdout, stderr } = await execFileAsync("lark-cli", ["base", ...args], {
        maxBuffer: 1024 * 1024 * 10
      });

      const parsed = JSON.parse(stdout);
      if (!parsed.ok) throw new Error(parsed.error?.message || stderr || "lark-cli 调用失败");
      return parsed;
    } catch (error) {
      lastError = error;
      let message = error.message || "";
      const cliOutput = error.stdout || error.stderr;
      if (cliOutput) {
        try {
          const parsedError = JSON.parse(cliOutput);
          message = parsedError.error?.message || message;
        } catch {
          message = `${message}\n${cliOutput}`;
        }
      }
      const retryable = message.includes("TLS handshake timeout")
        || message.includes("Client.Timeout")
        || message.includes("connection reset")
        || message.includes("temporarily unavailable");
      if (!retryable || attempt === maxAttempts) break;
      await delay(attempt * 1000);
    }
  }

  throw lastError;
}

function rowToRecord(fields, row) {
  const record = {};
  fields.forEach((field, index) => {
    const value = row[index];
    record[field] = Array.isArray(value) && value.length === 1 ? value[0] : value;
  });
  return record;
}

async function readBookingsCli() {
  const { baseToken, tableId } = config();
  const args = [
    "+record-list",
    "--base-token", baseToken,
    "--table-id", tableId,
    "--limit", "200",
    "--format", "json"
  ];
  for (const field of PROJECT_FIELDS) args.push("--field-id", field);
  const result = await larkBase(args);
  const fields = result.data.fields;
  return result.data.data.map((row) => rowToRecord(fields, row));
}

async function writeBookingCli(booking) {
  const { baseToken, tableId } = config();
  const result = await larkBase([
    "+record-upsert",
    "--base-token", baseToken,
    "--table-id", tableId,
    "--json", JSON.stringify(booking)
  ]);
  return result.data;
}

export async function readFeishuBookings() {
  return useOpenApi() ? readBookingsOpenApi() : readBookingsCli();
}

export async function writeFeishuBooking(booking) {
  return useOpenApi() ? writeBookingOpenApi(booking) : writeBookingCli(booking);
}

export function resetFeishuTokenCacheForTests() {
  tokenCache = null;
}
