export const CATALOG_VERSION = "v1.0-test";

export const SERVICE = {
  service_id: "xiaoan-pt-60",
  name: "1 对 1 健身私教训练",
  merchant_name: "小安智能健身",
  coach: "安教练",
  city: "北京",
  address: "崇文门地铁站 G 口东 200 米底商 1 层",
  price_yuan: 200,
  price_cents: 20000,
  duration_minutes: 60,
  business_hours: "每天 10:00–20:00",
  payment_method: "测试阶段到店支付",
  booking_rule: "每次预约 60 分钟；同一教练、同一日期、同一时间段只保留一笔未作废订单。",
  cancellation_rule: "首版测试阶段如需改期或取消，请至少提前 12 小时联系商家。",
  health_rule: "如用户报告健康风险或不确定是否适合训练，订单需商家人工评估后确认。"
};

export function listServices() {
  return {
    catalog_version: CATALOG_VERSION,
    services: [SERVICE]
  };
}
