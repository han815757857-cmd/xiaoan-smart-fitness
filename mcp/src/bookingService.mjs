import { SERVICE } from "./catalog.mjs";
import { readBookings, writeBookings } from "./localStore.mjs";
import { readFeishuBookings, writeFeishuBooking } from "./feishuStore.mjs";

const VALID_HEALTH_RISK = new Set(["none", "reported", "unsure"]);
const VALID_TIME_SLOT = /^([01]\d|2[0-3]):00-([01]\d|2[0-3]):00$/;
const VALID_DATE = /^\d{4}-\d{2}-\d{2}$/;

function publicBooking(record) {
  return {
    booking_id: record["订单ID"],
    order_status: record["订单状态"],
    service_name: record["商品名称"],
    requested_date: record["预定日期"],
    requested_time_slot: record["预定时间段"],
    confirmed_at: record["确认时间"] || "",
    payment_status: record["支付状态"],
    public_note: record["对外备注"]
  };
}

function isFeishuStore() {
  return process.env.XIAOAN_STORE === "feishu";
}

async function loadBookings() {
  return isFeishuStore() ? readFeishuBookings() : readBookings();
}

async function saveBooking(bookings, booking) {
  if (isFeishuStore()) {
    await writeFeishuBooking(booking);
    return;
  }

  bookings.push(booking);
  await writeBookings(bookings);
}

function requiredString(input, key) {
  if (typeof input[key] !== "string" || input[key].trim() === "") {
    throw new Error(`缺少必填字段：${key}`);
  }
  return input[key].trim();
}

function validateInput(input) {
  const serviceId = requiredString(input, "service_id");
  if (serviceId !== SERVICE.service_id) {
    throw new Error(`暂不支持的 service_id：${serviceId}`);
  }

  if (input.user_confirmed !== true) {
    throw new Error("必须在用户明确确认后才能创建订单：user_confirmed 需要为 true");
  }

  const requestedDate = requiredString(input, "requested_date");
  if (!VALID_DATE.test(requestedDate)) {
    throw new Error("预定日期格式应为 YYYY-MM-DD");
  }

  const requestedTimeSlot = requiredString(input, "requested_time_slot");
  if (!VALID_TIME_SLOT.test(requestedTimeSlot)) {
    throw new Error("预定时间段格式应为 HH:00-HH:00，例如 14:00-15:00");
  }

  const healthRisk = requiredString(input, "health_risk");
  if (!VALID_HEALTH_RISK.has(healthRisk)) {
    throw new Error("health_risk 只允许 none、reported、unsure");
  }

  return {
    idempotency_key: requiredString(input, "idempotency_key"),
    customer_name: requiredString(input, "customer_name"),
    customer_phone: requiredString(input, "customer_phone"),
    requested_date: requestedDate,
    requested_time_slot: requestedTimeSlot,
    fitness_goal: requiredString(input, "fitness_goal"),
    health_risk: healthRisk,
    health_note: typeof input.health_note === "string" ? input.health_note.trim() : "",
    channel: typeof input.channel === "string" && input.channel.trim() ? input.channel.trim() : "个人 Agent"
  };
}

function nextBookingId(bookings, requestedDate) {
  const datePart = requestedDate.replaceAll("-", "");
  const prefix = `XA-${datePart}-`;
  const maxSeq = bookings
    .map((booking) => booking["订单ID"])
    .filter((bookingId) => typeof bookingId === "string" && bookingId.startsWith(prefix))
    .map((bookingId) => Number.parseInt(bookingId.slice(prefix.length), 10))
    .filter((seq) => Number.isFinite(seq))
    .reduce((max, seq) => Math.max(max, seq), 0);

  return `${prefix}${String(maxSeq + 1).padStart(4, "0")}`;
}

function sameBookingDate(storedDate, requestedDate) {
  return typeof storedDate === "string" && storedDate.slice(0, 10) === requestedDate;
}

function formatBeijingDateTime(date = new Date()) {
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
  return `${get("year")}-${get("month")}-${get("day")} ${get("hour")}:${get("minute")}:${get("second")}`;
}

export async function createBooking(input) {
  const data = validateInput(input);
  const bookings = await loadBookings();

  const existingByIdempotency = bookings.find((booking) => booking["幂等键"] === data.idempotency_key);
  if (existingByIdempotency) {
    return {
      ok: true,
      duplicated: true,
      booking: publicBooking(existingByIdempotency),
      message: "检测到相同幂等键，已返回原订单，未重复创建。"
    };
  }

  const conflict = bookings.find((booking) => {
    return booking["教练"] === SERVICE.coach
      && sameBookingDate(booking["预定日期"], data.requested_date)
      && booking["预定时间段"] === data.requested_time_slot
      && booking["订单状态"] !== "已作废";
  });

  if (conflict) {
    return {
      ok: false,
      code: "TIME_SLOT_CONFLICT",
      message: "该教练在此日期和时间段已有未作废预约，请更换时间段。",
      conflict_booking: publicBooking(conflict)
    };
  }

  const now = formatBeijingDateTime();
  const riskReviewRequired = data.health_risk === "reported" || data.health_risk === "unsure";
  const booking = {
    "订单ID": nextBookingId(bookings, data.requested_date),
    "幂等键": data.idempotency_key,
    "订单状态": "待确认",
    "教练": SERVICE.coach,
    "商品 ID": SERVICE.service_id,
    "商品名称": SERVICE.name,
    "金额（元）": SERVICE.price_yuan,
    "服务时长（分钟）": SERVICE.duration_minutes,
    "客户名字": data.customer_name,
    "客户电话": data.customer_phone,
    "手机号后四位": data.customer_phone.slice(-4),
    "下单时间": now,
    "预定日期": `${data.requested_date} 00:00:00`,
    "预定时间段": data.requested_time_slot,
    "确认时间": "",
    "健身目标": data.fitness_goal,
    "健康风险": data.health_risk,
    "健康风险说明": data.health_note,
    "是否需人工评估": riskReviewRequired ? "是" : "否",
    "付款方式": "到店支付",
    "支付状态": "待付款",
    "下单渠道": data.channel,
    "更新时间": now,
    "商家备注": "",
    "对外备注": riskReviewRequired
      ? "预约已提交，因涉及健康风险信息，需商家人工评估后确认。"
      : "预约已提交，等待商家确认具体时间。"
  };

  await saveBooking(bookings, booking);

  return {
    ok: true,
    duplicated: false,
    risk_review_required: riskReviewRequired,
    booking: publicBooking(booking),
    message: isFeishuStore()
      ? "预约已创建，并已写入飞书多维表格。"
      : "预约已创建。本地骨架阶段暂写入 mock 存储，设置 XIAOAN_STORE=feishu 后可写入飞书。"
  };
}

export async function getBooking(input) {
  const bookingId = requiredString(input, "booking_id");
  const phoneLast4 = requiredString(input, "phone_last4");
  const bookings = await loadBookings();

  const booking = bookings.find((item) => {
    return item["订单ID"] === bookingId && item["手机号后四位"] === phoneLast4;
  });

  if (!booking) {
    return {
      ok: false,
      code: "BOOKING_NOT_FOUND",
      message: "未找到匹配订单，请检查订单ID和手机号后四位。"
    };
  }

  return {
    ok: true,
    booking: publicBooking(booking)
  };
}
