import { createServer } from "node:http";
import { once } from "node:events";

const requests = [];
const expectedSecret = "test-secret-never-used-outside-this-test";

const mock = createServer(async (req, res) => {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const bodyText = Buffer.concat(chunks).toString("utf8");
  const body = bodyText ? JSON.parse(bodyText) : {};
  requests.push({ method: req.method, url: req.url, authorization: req.headers.authorization, body });

  res.setHeader("Content-Type", "application/json");
  if (req.url === "/open-apis/auth/v3/tenant_access_token/internal") {
    if (body.app_id !== "test-app" || body.app_secret !== expectedSecret) {
      res.end(JSON.stringify({ code: 10003, msg: "bad credentials" }));
      return;
    }
    res.end(JSON.stringify({ code: 0, msg: "ok", tenant_access_token: "test-token", expire: 7200 }));
    return;
  }

  if (req.url.startsWith("/open-apis/bitable/v1/apps/test-base/tables/test-table/records/search")) {
    res.end(JSON.stringify({
      code: 0,
      msg: "success",
      data: {
        has_more: false,
        items: [{
          record_id: "rec-test",
          fields: {
            "订单ID": [{ type: "text", text: "XA-20260714-0001" }],
            "预定日期": Date.parse("2026-07-14T00:00:00+08:00"),
            "订单状态": "待确认"
          }
        }]
      }
    }));
    return;
  }

  if (req.url === "/open-apis/bitable/v1/apps/test-base/tables/test-table/records") {
    res.end(JSON.stringify({ code: 0, msg: "success", data: { record: { record_id: "rec-created", fields: body.fields } } }));
    return;
  }

  res.statusCode = 404;
  res.end(JSON.stringify({ code: 404, msg: "not found" }));
});

mock.listen(0, "127.0.0.1");
await once(mock, "listening");
const { port } = mock.address();

process.env.FEISHU_APP_ID = "test-app";
process.env.FEISHU_APP_SECRET = expectedSecret;
process.env.FEISHU_BASE_TOKEN = "test-base";
process.env.FEISHU_TABLE_ID = "test-table";
process.env.FEISHU_API_BASE_URL = `http://127.0.0.1:${port}/open-apis`;

try {
  const { readFeishuBookings, writeFeishuBooking, resetFeishuTokenCacheForTests } = await import("../src/feishuStore.mjs");
  resetFeishuTokenCacheForTests();

  const rows = await readFeishuBookings();
  if (rows[0]["订单ID"] !== "XA-20260714-0001") throw new Error("文本字段未正确还原");
  if (rows[0]["预定日期"] !== "2026-07-14 00:00:00") throw new Error("日期字段未正确还原");

  const created = await writeFeishuBooking({
    "订单ID": "XA-20260715-0001",
    "下单时间": "2026-07-13 12:34:56",
    "预定日期": "2026-07-15 00:00:00",
    "确认时间": "",
    "更新时间": "2026-07-13 12:34:56",
    "金额（元）": 200
  });
  if (created.record_id !== "rec-created") throw new Error("新增记录响应未正确处理");

  const createRequest = requests.find((request) => request.url.endsWith("/records"));
  if (typeof createRequest.body.fields["预定日期"] !== "number") throw new Error("日期写入值不是毫秒时间戳");
  if ("确认时间" in createRequest.body.fields) throw new Error("空日期字段不应发送给飞书");
  if (requests.filter((request) => request.url.includes("tenant_access_token")).length !== 1) {
    throw new Error("tenant_access_token 未正确缓存");
  }
  if (!requests.filter((request) => request.url.includes("/records")).every((request) => request.authorization === "Bearer test-token")) {
    throw new Error("记录 API 未携带 tenant_access_token");
  }

  console.log(JSON.stringify({
    token_cached: true,
    text_normalized: rows[0]["订单ID"],
    date_normalized: rows[0]["预定日期"],
    created_record_id: created.record_id,
    empty_date_omitted: true
  }, null, 2));
} finally {
  mock.close();
  await once(mock, "close");
}
