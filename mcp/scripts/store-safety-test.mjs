import { createBooking } from "../src/bookingService.mjs";

delete process.env.XIAOAN_STORE;
delete process.env.XIAOAN_ALLOW_MOCK;

let blockedError;
try {
  await createBooking({
    idempotency_key: "store-safety-test",
    service_id: "xiaoan-pt-60",
    customer_name: "存储安全测试",
    customer_phone: "13800138000",
    requested_date: "2030-01-01",
    requested_time_slot: "10:00-11:00",
    fitness_goal: "验证未配置时拒绝伪成功",
    health_risk: "none",
    health_note: "",
    user_confirmed: true
  });
} catch (error) {
  blockedError = error;
}

if (blockedError?.code !== "ORDER_STORE_NOT_CONFIGURED") {
  throw new Error(`未配置存储时未正确拒绝：${blockedError?.message || "未抛出错误"}`);
}

console.log(JSON.stringify({
  unconfigured_store_blocked: true,
  code: blockedError.code,
  booking_created: false
}, null, 2));
