// 全量功能验证脚本：使用内存数据库启动真实 HTTP 服务，逐个验证全部接口与核心业务链路。
// 运行：node scripts/verify-api.mjs
import assert from "node:assert/strict";
import http from "node:http";
import { createDatabase } from "../server/database.js";
import { createRequestHandler } from "../server/routes.js";
import { writeWorkbookRows } from "../server/xlsx.js";

process.env.WECHAT_MODE = "mock";
const db = createDatabase(":memory:");
const server = http.createServer(createRequestHandler({ db }));
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const base = `http://127.0.0.1:${server.address().port}`;

const checks = [];
const gaps = [];
async function step(name, fn) {
  try {
    await fn();
    checks.push({ name, pass: true });
    console.log(`  ✔ ${name}`);
  } catch (error) {
    checks.push({ name, pass: false, error: error.message });
    console.log(`  ✘ ${name}\n      ${error.message}`);
  }
}
function section(title) {
  console.log(`\n== ${title} ==`);
}
function gap(note) {
  gaps.push(note);
  console.log(`  ⚠ 业务缺口：${note}`);
}
function ok(condition, message) {
  assert.ok(condition, message);
}
function eq(actual, expected, message) {
  assert.equal(actual, expected, `${message}（实际 ${JSON.stringify(actual)}，期望 ${JSON.stringify(expected)}）`);
}

async function call(method, path, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (options.token) headers.Authorization = `Bearer ${options.token}`;
  let body;
  const bodyAllowed = method !== "GET" && method !== "HEAD";
  if (bodyAllowed && options.json !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(options.json);
  } else if (bodyAllowed && options.raw !== undefined) {
    body = options.raw;
    if (options.contentType) headers["Content-Type"] = options.contentType;
  }
  const response = await fetch(`${base}${path}`, { method, headers, body });
  const contentType = response.headers.get("content-type") || "";
  const result = { status: response.status, contentType, headers: response.headers };
  if (contentType.includes("application/json")) result.data = await response.json();
  else {
    result.buffer = Buffer.from(await response.arrayBuffer());
    result.text = result.buffer.toString("utf8");
  }
  return result;
}
async function get(path, token) { return call("GET", path, { token }); }
async function post(path, token, json) { return call("POST", path, { token, json }); }
async function put(path, token, json) { return call("PUT", path, { token, json }); }

const tokens = {};
async function login(username, password = "Admin@123") {
  const result = await post("/api/auth/login", null, { username, password });
  eq(result.status, 200, `登录 ${username}`);
  return result.data.data;
}
async function devLogin(phone) {
  const result = await post("/api/auth/dev-login", null, { phone });
  eq(result.status, 200, `手机号登录 ${phone}`);
  return result.data.data;
}

// ---------------------------------------------------------------- 运行环境
section("基础可用性");
await step("健康检查返回 ok 与 mock 支付模式", async () => {
  const result = await get("/api/health");
  eq(result.status, 200, "健康检查状态");
  eq(result.data.data.status, "ok", "status 字段");
  eq(result.data.data.wechatMode, "mock", "wechatMode 字段");
});
await step("管理端首页与静态资源可访问", async () => {
  const index = await get("/");
  eq(index.status, 200, "首页");
  ok(index.contentType.includes("text/html"), "首页 Content-Type");
  ok(index.text.includes("id=\"login-form\""), "首页包含登录表单");
  const app = await get("/app.js");
  eq(app.status, 200, "app.js");
  ok(app.contentType.includes("javascript"), "app.js Content-Type");
  const css = await get("/styles.css");
  eq(css.status, 200, "styles.css");
});
await step("静态目录穿越被拒绝", async () => {
  const result = await get("/..%2fserver%2froutes.js");
  ok([403, 404].includes(result.status), `预期 403/404，实际 ${result.status}`);
});
await step("OPTIONS 预检返回 204 且带 CORS 头", async () => {
  const result = await call("OPTIONS", "/api/health");
  eq(result.status, 204, "预检状态");
  eq(result.headers.get("access-control-allow-origin"), "*", "CORS 头");
});

// ---------------------------------------------------------------- 认证
section("登录与账号");
await step("全部内部角色可登录", async () => {
  for (const username of ["admin", "bangbang", "bangbang-finance", "sanlei", "warehouse", "finance", "service"]) {
    const data = await login(username);
    tokens[username] = data.token;
    ok(data.user.role, `${username} 返回角色`);
  }
});
await step("密码错误返回 401", async () => {
  const result = await post("/api/auth/login", null, { username: "admin", password: "wrong-pass" });
  eq(result.status, 401, "错误密码状态");
  eq(result.data.error.code, "INVALID_CREDENTIALS", "错误码");
});
await step("未知账号返回 401", async () => {
  const result = await post("/api/auth/login", null, { username: "nobody" });
  eq(result.status, 401, "未知账号状态");
});
await step("三个演示客户可手机号登录", async () => {
  for (const phone of ["13800000001", "13800000002", "13800000003"]) {
    const data = await devLogin(phone);
    tokens[phone] = data.token;
    ok(data.user.customerId, `${phone} 返回客户ID`);
  }
});
await step("未开通手机号登录被拒绝", async () => {
  const result = await post("/api/auth/dev-login", null, { phone: "13999999999" });
  eq(result.status, 401, "未开通手机号");
});
await step("正式模式微信登录在 mock 下被拒绝", async () => {
  const result = await post("/api/auth/wechat-login", null, { code: "x", phoneCode: "y" });
  eq(result.status, 400, "微信登录状态");
  eq(result.data.error.code, "WECHAT_MOCK_MODE", "错误码");
});
await step("未带 Token 访问受保护接口返回 401", async () => {
  const result = await get("/api/me");
  eq(result.status, 401, "无 Token 状态");
});
await step("/api/me 返回内部账号信息", async () => {
  const result = await get("/api/me", tokens.admin);
  eq(result.status, 200, "状态");
  eq(result.data.data.user.role, "SUPER_ADMIN", "角色");
});
await step("/api/me 为客户返回授信资料", async () => {
  const result = await get("/api/me", tokens["13800000001"]);
  eq(result.status, 200, "状态");
  ok(result.data.data.customer, "包含 customer");
  ok("creditLimit" in result.data.data.customer, "包含授信额度");
});
await step("修改密码：当前密码错误被拒绝", async () => {
  const result = await post("/api/auth/change-password", tokens.service, {
    currentPassword: "bad-password", newPassword: "NewPass@123"
  });
  eq(result.status, 400, "状态");
  eq(result.data.error.code, "CURRENT_PASSWORD_INVALID", "错误码");
});
await step("修改密码后旧会话失效、新密码可登录", async () => {
  const changed = await post("/api/auth/change-password", tokens.service, {
    currentPassword: "Admin@123", newPassword: "Service@456"
  });
  eq(changed.status, 200, "改密状态");
  const relogin = await login("service", "Service@456");
  tokens.service = relogin.token;
  const old = await post("/api/auth/login", null, { username: "service", password: "Admin@123" });
  eq(old.status, 401, "旧密码登录");
  const restore = await post("/api/auth/change-password", tokens.service, {
    currentPassword: "Service@456", newPassword: "Admin@123"
  });
  eq(restore.status, 200, "恢复密码状态");
});
await step("通知列表与已读标记可用", async () => {
  const list = await get("/api/notifications", tokens["13800000002"]);
  eq(list.status, 200, "通知列表状态");
  ok(Array.isArray(list.data.data), "通知为数组");
  if (list.data.data.length > 0) {
    const read = await post(`/api/notifications/${encodeURIComponent(list.data.data[0].id)}/read`, tokens["13800000002"], {});
    eq(read.status, 200, "标记已读状态");
  }
});

// ---------------------------------------------------------------- 客户端
section("客户小程序接口");
await step("客户资料包含结算与授信字段", async () => {
  const result = await get("/api/mobile/profile", tokens["13800000001"]);
  eq(result.status, 200, "状态");
  ok(result.data.data.name, "客户名称");
  ok("prepayRatio" in result.data.data, "预付比例");
  ok("batchLimit" in result.data.data, "批次上限");
});
await step("产品目录按客户专属价与价格等级计价", async () => {
  const c1 = await get("/api/mobile/catalog", tokens["13800000001"]);
  eq(c1.status, 200, "客户1目录");
  const ball = c1.data.data.products.find((item) => item.id === "prod_ball_m8");
  eq(ball.price, 99, "客户1专属价");
  eq(ball.priceSource, "CUSTOMER_SPECIFIC", "价格来源");
  const c2 = await get("/api/mobile/catalog", tokens["13800000002"]);
  const ball2 = c2.data.data.products.find((item) => item.id === "prod_ball_m8");
  eq(ball2.price, 115.2, "客户2等级价");
  eq(ball2.priceSource, "PRICE_TIER", "价格来源2");
});
await step("订单列表与归属校验", async () => {
  const created = await post("/api/mobile/orders", tokens["13800000001"], {
    orderType: "NORMAL", note: "API验证-信用订单",
    items: [{ productId: "prod_ball_m8", quantity: 10 }]
  });
  eq(created.status, 201, "创建信用订单");
  const orderId = created.data.data.orderIds[0];
  const detail = await get(`/api/mobile/orders/${orderId}`, tokens["13800000001"]);
  eq(detail.status, 200, "订单详情");
  eq(detail.data.data.status, "PENDING_BANGBANG", "初始状态");
  const stolen = await get(`/api/mobile/orders/${orderId}`, tokens["13800000003"]);
  eq(stolen.status, 404, "跨客户访问");
});
await step("五种订单类型均可提交", async () => {
  const types = ["NORMAL", "PREPAY", "NEW_PRODUCT", "TEMPORARY"];
  for (const type of types) {
    const result = await post("/api/mobile/orders", tokens["13800000003"], {
      orderType: type,
      items: [{ productId: "prod_shock_gs", quantity: 2 }]
    });
    eq(result.status, 201, `${type} 订单`);
  }
  const planType = await post("/api/mobile/orders", tokens["13800000003"], {
    orderType: "PLAN", items: [{ productId: "prod_shock_gs", quantity: 2 }]
  });
  eq(planType.status, 400, "缺少计划号的计划订单应失败");
  eq(planType.data.error.code, "VALIDATION_ERROR", "计划订单错误码");
});
await step("数量必须为最小包装倍数", async () => {
  const result = await post("/api/mobile/orders", tokens["13800000001"], {
    orderType: "NORMAL", items: [{ productId: "prod_ball_m8", quantity: 5 }]
  });
  eq(result.status, 400, "状态");
  eq(result.data.error.code, "PACKAGE_QUANTITY", "错误码");
});
await step("信用订单确认→接单→发货→收货全链路", async () => {
  const list = await get("/api/mobile/orders", tokens["13800000001"]);
  const target = list.data.data.find((o) => o.status === "PENDING_BANGBANG" && o.orderType === "NORMAL");
  ok(target, "存在待确认信用订单");
  const confirmed = await post(`/api/admin/orders/${target.id}/actions`, tokens.bangbang, { action: "BANGBANG_CONFIRM" });
  eq(confirmed.status, 200, "邦邦确认");
  eq(confirmed.data.data.status, "PENDING_SANLEI", "确认后状态");
  const accepted = await post(`/api/admin/orders/${target.id}/actions`, tokens.sanlei, { action: "SANLEI_ACCEPT" });
  eq(accepted.status, 200, "三磊接单");
  eq(accepted.data.data.status, "PREPARING", "接单后状态");
  const itemId = accepted.data.data.items[0].id;
  const shipped = await post(`/api/admin/orders/${target.id}/actions`, tokens.warehouse, {
    action: "SHIP",
    shipment: {
      logisticsCompany: "顺丰速运", trackingNo: "SF-QA-001", deliveryMode: "DELIVERY",
      items: [{ orderItemId: itemId, quantity: 10 }]
    }
  });
  eq(shipped.status, 200, "发货");
  eq(shipped.data.data.status, "SHIPPED", "发货后状态");
  const shipmentId = shipped.data.data.shipments[0].id;
  const received = await post(`/api/mobile/shipments/${shipmentId}/receive`, tokens["13800000001"], {});
  eq(received.status, 200, "确认收货");
  eq(received.data.data.status, "COMPLETED", "收货后状态");
});
await step("预付款订单：部分付款→补足→接单→分批发货→收货", async () => {
  const created = await post("/api/mobile/orders", tokens["13800000002"], {
    orderType: "PREPAY", items: [{ productId: "prod_ball_m8", quantity: 10 }]
  });
  eq(created.status, 201, "创建预付订单");
  const orderId = created.data.data.orderIds[0];
  const confirmed = await post(`/api/admin/orders/${orderId}/actions`, tokens.bangbang, { action: "BANGBANG_CONFIRM" });
  eq(confirmed.data.data.status, "PENDING_PAYMENT", "确认后待付款");
  eq(confirmed.data.data.items[0].reservedQuantity, 10, "确认时预占库存");

  const pay1 = await post("/api/mobile/payments", tokens["13800000002"], { orderId, amount: 200 });
  eq(pay1.status, 201, "创建首笔付款");
  eq(pay1.data.data.mockMode, true, "测试支付模式");
  const done1 = await post(`/api/mobile/payments/${pay1.data.data.id}/mock-complete`, tokens["13800000002"], {});
  eq(done1.data.data.status, "PARTIALLY_PAID", "首笔后部分付款");

  const pay2 = await post("/api/mobile/payments", tokens["13800000002"], { orderId, amount: 376 });
  eq(pay2.status, 201, "创建补款");
  const done2 = await post(`/api/mobile/payments/${pay2.data.data.id}/mock-complete`, tokens["13800000002"], {});
  eq(done2.data.data.status, "PENDING_SANLEI", "补足后待接单");

  const accepted = await post(`/api/admin/orders/${orderId}/actions`, tokens.sanlei, { action: "SANLEI_ACCEPT" });
  eq(accepted.data.data.status, "PREPARING", "接单");
  const itemId = accepted.data.data.items[0].id;
  const ship1 = await post(`/api/admin/orders/${orderId}/actions`, tokens.warehouse, {
    action: "SHIP",
    shipment: { logisticsCompany: "德邦", trackingNo: "DB-QA-001", items: [{ orderItemId: itemId, quantity: 4 }] }
  });
  eq(ship1.status, 200, "首批发货");
  eq(ship1.data.data.status, "PARTIALLY_SHIPPED", "首批后状态");
  const receive1 = await post(`/api/mobile/shipments/${ship1.data.data.shipments[0].id}/receive`, tokens["13800000002"], {});
  eq(receive1.status, 200, "首批收货");
  eq(receive1.data.data.status, "PARTIALLY_SHIPPED", "仍有未发数量");

  const ship2 = await post(`/api/admin/orders/${orderId}/actions`, tokens.warehouse, {
    action: "SHIP",
    shipment: { logisticsCompany: "德邦", trackingNo: "DB-QA-002", items: [{ orderItemId: itemId, quantity: 6 }] }
  });
  eq(ship2.status, 409, "剩余批次超过预付款上限被阻止");
  eq(ship2.data.error.code, "SHIPMENT_EXCEEDS_PREPAYMENT", "超预付错误码");
  const topUp = await post("/api/mobile/payments", tokens["13800000002"], { orderId, amount: 576 });
  eq(topUp.status, 409, "分批发货后补款被阻止");
  eq(topUp.data.error.code, "INVALID_ORDER_STATUS", "补款错误码");
  gap("预付款订单分批发货后无法补款：付款仅允许 PENDING_PAYMENT/PARTIALLY_PAID，而部分发货后状态为 PARTIALLY_SHIPPED，导致剩余批次无法发货且客户无法补足尾款（订单卡死）。允许超付的客户可绕过。");
});
await step("订单取消释放预占库存", async () => {
  const created = await post("/api/mobile/orders", tokens["13800000003"], {
    orderType: "TEMPORARY", items: [{ productId: "prod_arm_m8", quantity: 2 }]
  });
  const orderId = created.data.data.orderIds[0];
  await post(`/api/admin/orders/${orderId}/actions`, tokens.bangbang, { action: "BANGBANG_CONFIRM" });
  const beforeStock = db.prepare("SELECT SUM(reserved) AS reserved FROM inventory WHERE product_id = 'prod_arm_m8'").get();
  ok(beforeStock.reserved > 0, "确认后存在预占");
  const cancelled = await post(`/api/mobile/orders/${orderId}/cancel`, tokens["13800000003"], { reason: "验证取消" });
  eq(cancelled.status, 200, "取消状态");
  eq(cancelled.data.data.status, "CANCELLED", "取消后状态");
  const afterStock = db.prepare("SELECT SUM(reserved) AS reserved FROM inventory WHERE product_id = 'prod_arm_m8'").get();
  eq(afterStock.reserved, 0, "取消后释放预占");
});
await step("采购计划完整审批链与计划订单限量", async () => {
  const created = await post("/api/mobile/plans", tokens["13800000002"], {
    planMonth: "2027-03", note: "API验证计划",
    items: [{ weekNo: 1, productId: "prod_arm_ae", quantity: 2 }]
  });
  eq(created.status, 201, "创建计划");
  const planId = created.data.data.id;
  eq(created.data.data.status, "DRAFT", "初始草稿");

  const updated = await put(`/api/mobile/plans/${planId}`, tokens["13800000002"], {
    planMonth: "2027-03", note: "修改后",
    items: [{ weekNo: 1, productId: "prod_arm_ae", quantity: 4 }]
  });
  eq(updated.status, 200, "修改草稿");
  eq(updated.data.data.items[0].quantity, 4, "修改生效");

  await post(`/api/mobile/plans/${planId}/actions`, tokens["13800000002"], { action: "SUBMIT" });
  const withdrawn = await post(`/api/mobile/plans/${planId}/actions`, tokens["13800000002"], { action: "WITHDRAW" });
  eq(withdrawn.data.data.status, "DRAFT", "撤回后草稿");
  await post(`/api/mobile/plans/${planId}/actions`, tokens["13800000002"], { action: "SUBMIT" });
  const rejected = await post(`/api/admin/plans/${planId}/actions`, tokens.bangbang, { action: "BANGBANG_REJECT", note: "退回补充" });
  eq(rejected.data.data.status, "REJECTED", "邦邦退回");
  const reEdited = await put(`/api/mobile/plans/${planId}`, tokens["13800000002"], {
    items: [{ weekNo: 1, productId: "prod_arm_ae", quantity: 4 }]
  });
  eq(reEdited.status, 200, "退回后可编辑");
  await post(`/api/mobile/plans/${planId}/actions`, tokens["13800000002"], { action: "SUBMIT" });
  await post(`/api/admin/plans/${planId}/actions`, tokens.bangbang, { action: "BANGBANG_APPROVE" });
  const approved = await post(`/api/admin/plans/${planId}/actions`, tokens.sanlei, { action: "SANLEI_APPROVE" });
  eq(approved.data.data.status, "APPROVED", "终审通过");

  const planOrder = await post("/api/mobile/orders", tokens["13800000002"], {
    orderType: "PLAN", planId, planWeek: 1, items: [{ productId: "prod_arm_ae", quantity: 2 }]
  });
  eq(planOrder.status, 201, "创建计划订单");
  const exceeded = await post("/api/mobile/orders", tokens["13800000002"], {
    orderType: "PLAN", planId, planWeek: 1, items: [{ productId: "prod_arm_ae", quantity: 4 }]
  });
  eq(exceeded.status, 400, "超计划数量");
  eq(exceeded.data.error.code, "PLAN_QUANTITY_EXCEEDED", "超量错误码");
});
await step("售后申请可由客户提交、售后人员处理", async () => {
  const orders = await get("/api/mobile/orders", tokens["13800000001"]);
  const order = orders.data.data[0];
  const created = await post("/api/mobile/after-sales", tokens["13800000001"], {
    orderId: order.id, type: "CLAIM", description: "API验证索赔", claimAmount: 50
  });
  eq(created.status, 201, "创建售后");
  const caseId = created.data.data.id;
  eq(created.data.data.status, "OPEN", "初始状态");
  const list = await get("/api/mobile/after-sales", tokens["13800000001"]);
  ok(list.data.data.some((item) => item.id === caseId), "列表包含售后单");
  const reviewing = await put(`/api/admin/after-sales/${caseId}`, tokens.service, { status: "REVIEWING", resolution: "处理中" });
  eq(reviewing.status, 200, "售后处理");
  eq(reviewing.data.data.status, "REVIEWING", "处理中状态");
  const closed = await put(`/api/admin/after-sales/${caseId}`, tokens.service, { status: "CLOSED", resolution: "已赔付" });
  eq(closed.data.data.status, "CLOSED", "关闭状态");
});

await step("跨车型订单自动拆单并归并到同一总单", async () => {
  const created = await post("/api/mobile/orders", tokens["13800000001"], {
    orderType: "NORMAL", note: "多车型拆单验证",
    items: [
      { productId: "prod_ball_m8", quantity: 10 },
      { productId: "prod_arm_ae", quantity: 2 }
    ]
  });
  eq(created.status, 201, "创建多车型订单");
  eq(created.data.data.orderIds.length, 2, "按车型拆为两张子单");
  const first = await get(`/api/mobile/orders/${created.data.data.orderIds[0]}`, tokens["13800000001"]);
  const second = await get(`/api/mobile/orders/${created.data.data.orderIds[1]}`, tokens["13800000001"]);
  eq(first.data.data.groupId, second.data.data.groupId, "同一总单");
  eq(first.data.data.group.siblingOrders.length, 2, "总单下两张子单");
  ok(first.data.data.vehicleModel !== second.data.data.vehicleModel, "按车型拆分");
  const sum = first.data.data.group.siblingOrders.reduce((total, item) => total + item.totalAmount, 0);
  eq(Math.round(sum * 100) / 100, created.data.data.totalAmount, "子单金额合计等于总单金额");
});
await step("授信额度不足时邦邦确认被拦截", async () => {
  const customer = await post("/api/admin/customers", tokens.admin, {
    code: "CUS-QA-CREDIT", name: "授信验证客户", province: "上海市", city: "上海市",
    channelType: "WHOLESALER", grade: "B", priceTier: "STANDARD", settlementMethod: "CREDIT",
    paymentTermsDays: 30, creditLimit: 100, prepayRatio: 1, batchLimit: 3, phone: "13900000088"
  });
  eq(customer.status, 201, "创建低授信客户");
  const user = await post("/api/admin/users/customer", tokens.admin, {
    customerId: customer.data.data.id, phone: "13900000088", displayName: "授信验证采购员"
  });
  eq(user.status, 201, "开通客户账号");
  const session = await devLogin("13900000088");
  const order = await post("/api/mobile/orders", session.token, {
    orderType: "NORMAL", items: [{ productId: "prod_shock_gs", quantity: 2 }]
  });
  eq(order.status, 201, "创建信用订单");
  const denied = await post(`/api/admin/orders/${order.data.data.orderIds[0]}/actions`, tokens.bangbang, {
    action: "BANGBANG_CONFIRM"
  });
  eq(denied.status, 409, "超授信状态");
  eq(denied.data.error.code, "CREDIT_LIMIT_EXCEEDED", "超授信错误码");
});
await step("客户目录不泄露基础价与成本", async () => {
  const catalog = await get("/api/mobile/catalog", tokens["13800000001"]);
  const product = catalog.data.data.products[0];
  ok(!("basePrice" in product), "目录不含基础价");
  ok(!("cost" in product), "目录不含成本");
  ok(product.price > 0 && product.priceSource, "仅暴露生效价格与来源");
});

// ---------------------------------------------------------------- 业务规则
section("关键业务规则");
await step("车型授权实时过滤客户产品目录", async () => {
  const list = await get("/api/admin/customers", tokens.admin);
  let customer = list.data.data.find((item) => item.code === "CUS-QA-001");
  if (!customer) {
    const created = await post("/api/admin/customers", tokens.admin, {
      code: "CUS-QA-001", name: "API验证客户", province: "江苏省", city: "南京市",
      channelType: "WHOLESALER", grade: "A", priceTier: "VIP", settlementMethod: "CREDIT",
      paymentTermsDays: 30, creditLimit: 10000, prepayRatio: 1, batchLimit: 3, phone: "13900000001"
    });
    eq(created.status, 201, "创建验证客户");
    customer = created.data.data;
  }
  const auth = await put(`/api/admin/customers/${customer.id}/authorizations`, tokens.admin, { vehicles: ["传祺M8"] });
  eq(auth.status, 200, "授权传祺M8");
  const user = await post("/api/admin/users/customer", tokens.admin, {
    customerId: customer.id, phone: "13900000001", displayName: "授权验证采购员"
  });
  eq(user.status, 201, "开通该客户账号");
  const session = await devLogin("13900000001");
  const catalog = await get("/api/mobile/catalog", session.token);
  eq(catalog.status, 200, "目录状态");
  ok(catalog.data.data.products.length > 0, "目录非空");
  ok(catalog.data.data.products.every((item) => item.vehicleModel === "传祺M8"), "仅返回已授权车型");
});
await step("订单价格快照不随价格调整变化", async () => {
  const list = await get("/api/admin/customers", tokens.admin);
  const customer = list.data.data.find((item) => item.code === "CUS-001");
  const first = await post("/api/mobile/orders", tokens["13800000001"], {
    orderType: "NORMAL", items: [{ productId: "prod_ball_m8", quantity: 10 }]
  });
  const firstDetail = await get(`/api/mobile/orders/${first.data.data.orderIds[0]}`, tokens["13800000001"]);
  eq(firstDetail.data.data.items[0].unitPrice, 99, "建单时价格");
  const reprice = await put("/api/admin/prices", tokens.admin, {
    scope: "CUSTOMER", customerId: customer.id, productId: "prod_ball_m8", price: 77
  });
  eq(reprice.status, 200, "调整专属价");
  const oldDetail = await get(`/api/mobile/orders/${first.data.data.orderIds[0]}`, tokens["13800000001"]);
  eq(oldDetail.data.data.items[0].unitPrice, 99, "历史订单价格保持不变");
  const second = await post("/api/mobile/orders", tokens["13800000001"], {
    orderType: "NORMAL", items: [{ productId: "prod_ball_m8", quantity: 10 }]
  });
  const secondDetail = await get(`/api/mobile/orders/${second.data.data.orderIds[0]}`, tokens["13800000001"]);
  eq(secondDetail.data.data.items[0].unitPrice, 77, "新订单使用新价格");
  await put("/api/admin/prices", tokens.admin, {
    scope: "CUSTOMER", customerId: customer.id, productId: "prod_ball_m8", price: 99
  });
});
await step("发货批次上限被强制执行", async () => {
  const created = await post("/api/mobile/orders", tokens["13800000001"], {
    orderType: "NORMAL", items: [{ productId: "prod_ball_m8", quantity: 40 }]
  });
  eq(created.status, 201, "创建 40 件订单");
  const orderId = created.data.data.orderIds[0];
  const confirmed = await post(`/api/admin/orders/${orderId}/actions`, tokens.bangbang, { action: "BANGBANG_CONFIRM" });
  eq(confirmed.data.data.batchLimit, 3, "批次上限 3");
  await post(`/api/admin/orders/${orderId}/actions`, tokens.sanlei, { action: "SANLEI_ACCEPT" });
  const detail = await get(`/api/admin/orders/${orderId}`, tokens.admin);
  const itemId = detail.data.data.items[0].id;
  for (let batch = 1; batch <= 3; batch += 1) {
    const shipped = await post(`/api/admin/orders/${orderId}/actions`, tokens.warehouse, {
      action: "SHIP",
      shipment: { logisticsCompany: "顺丰速运", trackingNo: `SF-BATCH-${batch}`, items: [{ orderItemId: itemId, quantity: 10 }] }
    });
    eq(shipped.status, 200, `第 ${batch} 批发货`);
  }
  const fourth = await post(`/api/admin/orders/${orderId}/actions`, tokens.warehouse, {
    action: "SHIP",
    shipment: { logisticsCompany: "顺丰速运", trackingNo: "SF-BATCH-4", items: [{ orderItemId: itemId, quantity: 10 }] }
  });
  eq(fourth.status, 409, "第 4 批被拒绝");
  eq(fourth.data.error.code, "BATCH_LIMIT_REACHED", "批次上限错误码");
});
await step("计划执行率按已下单数量计算", async () => {
  const created = await post("/api/mobile/plans", tokens["13800000002"], {
    planMonth: "2029-01", items: [{ weekNo: 1, productId: "prod_arm_ae", quantity: 4 }]
  });
  const planId = created.data.data.id;
  await post(`/api/mobile/plans/${planId}/actions`, tokens["13800000002"], { action: "SUBMIT" });
  await post(`/api/admin/plans/${planId}/actions`, tokens.bangbang, { action: "BANGBANG_APPROVE" });
  await post(`/api/admin/plans/${planId}/actions`, tokens.sanlei, { action: "SANLEI_APPROVE" });
  const order = await post("/api/mobile/orders", tokens["13800000002"], {
    orderType: "PLAN", planId, planWeek: 1, items: [{ productId: "prod_arm_ae", quantity: 2 }]
  });
  eq(order.status, 201, "计划下单");
  const report = await get("/api/admin/reports/plan-execution", tokens.admin);
  const row = report.data.data.find((item) => item.planMonth === "2029-01");
  ok(row, "报表包含该计划");
  eq(row.plannedQuantity, 4, "计划数量");
  eq(row.orderedQuantity, 2, "已下单数量");
  eq(row.executionRate, 50, "执行率");
});
await step("客户不能替他人订单付款", async () => {
  const created = await post("/api/mobile/orders", tokens["13800000002"], {
    orderType: "PREPAY", items: [{ productId: "prod_ball_m8", quantity: 10 }]
  });
  const orderId = created.data.data.orderIds[0];
  await post(`/api/admin/orders/${orderId}/actions`, tokens.bangbang, { action: "BANGBANG_CONFIRM" });
  const stolen = await post("/api/mobile/payments", tokens["13800000003"], { orderId, amount: 10 });
  eq(stolen.status, 404, "跨客户付款");
  eq(stolen.data.error.code, "ORDER_NOT_FOUND", "错误码");
});

// ---------------------------------------------------------------- 管理端
section("管理端接口");
await step("各内部角色经营概览可用", async () => {
  for (const username of ["admin", "bangbang", "bangbang-finance", "sanlei", "warehouse", "finance", "service"]) {
    const result = await get("/api/admin/dashboard", tokens[username]);
    eq(result.status, 200, `${username} 概览`);
    ok(result.data.data.metrics, `${username} 指标`);
  }
});
await step("客户档案增改查与有效价格、车型授权", async () => {
  const list = await get("/api/admin/customers", tokens.admin);
  eq(list.status, 200, "列表");
  ok(list.data.data.length >= 3, "演示客户");
  const created = await post("/api/admin/customers", tokens.admin, {
    code: "CUS-QA-001", name: "API验证客户", province: "江苏省", city: "南京市",
    channelType: "WHOLESALER", grade: "A", priceTier: "VIP", settlementMethod: "CREDIT",
    paymentTermsDays: 30, creditLimit: 10000, prepayRatio: 1, batchLimit: 3, phone: "13900000001"
  });
  ok([201, 409].includes(created.status), `创建或复用客户（${created.status}）`);
  const customerId = created.status === 201
    ? created.data.data.id
    : list.data.data.find((item) => item.code === "CUS-QA-001").id;
  const updated = await put(`/api/admin/customers/${customerId}`, tokens.admin, { name: "API验证客户（改名）" });
  eq(updated.status, 200, "修改客户");
  eq(updated.data.data.name, "API验证客户（改名）", "改名生效");
  const prices = await get(`/api/admin/customers/${customerId}/effective-prices`, tokens.admin);
  eq(prices.status, 200, "有效价格");
  const auth = await get(`/api/admin/customers/${customerId}/authorizations`, tokens.admin);
  eq(auth.status, 200, "授权读取");
  ok(auth.data.data.allVehicles.length >= 3, "全部车型");
  const authSaved = await put(`/api/admin/customers/${customerId}/authorizations`, tokens.admin, { vehicles: ["传祺M8"] });
  eq(authSaved.status, 200, "授权保存");
  eq(authSaved.data.data.authorizedVehicles.length, 1, "授权数量");
  const badAuth = await put(`/api/admin/customers/${customerId}/authorizations`, tokens.admin, { vehicles: ["不存在车型"] });
  eq(badAuth.status, 400, "非法车型");
});
await step("产品档案增改查与最小包装校验", async () => {
  const created = await post("/api/admin/products", tokens.admin, {
    sku: "SL-QA-001", name: "API验证产品", category: "球头", vehicleModel: "传祺M8",
    minPackage: 4, basePrice: 250, warrantyMonths: 12, warrantyKm: 60000
  });
  eq(created.status, 201, "创建产品");
  const productId = created.data.data.id;
  eq(created.data.data.available, 0, "新产品质量可用为 0");
  const updated = await put(`/api/admin/products/${productId}`, tokens.admin, { name: "API验证产品（改名）", basePrice: 260 });
  eq(updated.status, 200, "修改产品");
  eq(updated.data.data.name, "API验证产品（改名）", "改名生效");
  const duplicate = await post("/api/admin/products", tokens.admin, {
    sku: "SL-QA-001", name: "重复物料号", category: "球头", vehicleModel: "传祺M8", minPackage: 1, basePrice: 1
  });
  eq(duplicate.status, 409, "重复物料号");
  eq(duplicate.data.error.code, "PRODUCT_SKU_EXISTS", "重复错误码");
});
await step("价格矩阵与价格设置（等级价 / 客户专属价）", async () => {
  const matrix = await get("/api/admin/prices", tokens.admin);
  eq(matrix.status, 200, "价格矩阵");
  ok(matrix.data.data.tiers.length >= 3, "价格等级");
  const tierPrice = await put("/api/admin/prices", tokens.admin, { productId: "prod_ball_m8", tier: "VIP", price: 98 });
  eq(tierPrice.status, 200, "设置等级价");
  const customer = db.prepare("SELECT id FROM customers WHERE code = 'CUS-002'").get();
  const customerPrice = await put("/api/admin/prices", tokens.admin, {
    scope: "CUSTOMER", customerId: customer.id, productId: "prod_ball_m8", price: 111
  });
  eq(customerPrice.status, 200, "设置客户专属价");
  const catalog = await get("/api/mobile/catalog", tokens["13800000002"]);
  const ball = catalog.data.data.products.find((item) => item.id === "prod_ball_m8");
  eq(ball.price, 111, "客户2专属价生效");
  const missing = await put("/api/admin/prices", tokens.admin, { productId: "prod_missing", tier: "VIP", price: 1 });
  eq(missing.status, 404, "不存在产品");
});
await step("库存查询、移库、流水与调整", async () => {
  const list = await get("/api/admin/inventory", tokens.admin);
  eq(list.status, 200, "库存列表");
  ok(list.data.data.length >= 12, "库存行数");
  const low = await get("/api/admin/inventory?lowStock=true", tokens.admin);
  eq(low.status, 200, "低库存筛选");
  const ball = list.data.data.filter((item) => item.productId === "prod_ball_m8");
  const real = ball.find((item) => item.sourceType === "REAL");
  const virtual = ball.find((item) => item.sourceType === "VIRTUAL");
  const transfer = await post("/api/admin/inventory/transfer", tokens.warehouse, {
    sourceId: real.id, destinationId: virtual.id, quantity: 5
  });
  eq(transfer.status, 201, "移库");
  ok(transfer.data.data.transferNo, "移库单号");
  const movements = await get("/api/admin/inventory/movements?productId=prod_ball_m8", tokens.admin);
  eq(movements.status, 200, "库存流水");
  ok(movements.data.data.some((item) => item.type === "TRANSFER_OUT"), "包含移出流水");
  const adjust = await post(`/api/admin/inventory/${real.id}/adjust`, tokens.warehouse, { quantity: 3, note: "盘点增益" });
  eq(adjust.status, 200, "库存调整");
  eq(adjust.data.data.quantity, real.quantity - 5 + 3, "调整后数量");
  const negative = await post(`/api/admin/inventory/${real.id}/adjust`, tokens.warehouse, { quantity: -99999 });
  eq(negative.status, 409, "过度扣减被拒绝");
});
await step("供应商档案增改查", async () => {
  const list = await get("/api/admin/suppliers", tokens.admin);
  eq(list.status, 200, "供应商列表");
  const created = await post("/api/admin/suppliers", tokens.admin, {
    name: "API验证供应商", type: "INTEGRATOR", contact: "李经理", phone: "021-12345678"
  });
  eq(created.status, 201, "创建供应商");
  const updated = await put(`/api/admin/suppliers/${created.data.data.id}`, tokens.admin, { name: "API验证供应商（改名）" });
  eq(updated.status, 200, "修改供应商");
  const bad = await post("/api/admin/suppliers", tokens.admin, { name: "类型错误", type: "UNKNOWN" });
  eq(bad.status, 400, "非法类型");
  const bySales = await post("/api/admin/suppliers", tokens.sanlei, { name: "销售创建供应商", type: "FACTORY" });
  eq(bySales.status, 201, "三磊销售可创建供应商");
});
await step("订单中心查询、详情与非法动作", async () => {
  const list = await get("/api/admin/orders", tokens.admin);
  eq(list.status, 200, "管理端订单列表");
  ok(list.data.data.length > 0, "存在订单");
  const orderId = list.data.data[0].id;
  const detail = await get(`/api/admin/orders/${orderId}`, tokens.admin);
  eq(detail.status, 200, "订单详情");
  const invalid = await post(`/api/admin/orders/${orderId}/actions`, tokens.admin, { action: "NOT_EXIST" });
  eq(invalid.status, 400, "非法动作");
  eq(invalid.data.error.code, "INVALID_ORDER_ACTION", "非法动作错误码");
});
await step("收款对账与管理员模拟到账", async () => {
  const payments = await get("/api/admin/payments", tokens.admin);
  eq(payments.status, 200, "收款列表");
  const created = await post("/api/mobile/orders", tokens["13800000002"], {
    orderType: "PREPAY", items: [{ productId: "prod_shock_ae", quantity: 2 }]
  });
  const orderId = created.data.data.orderIds[0];
  await post(`/api/admin/orders/${orderId}/actions`, tokens.bangbang, { action: "BANGBANG_CONFIRM" });
  const mock = await post("/api/admin/payments/mock", tokens.admin, { orderId, amount: 20000 });
  eq(mock.status, 400, "超过订单金额被拒绝");
  eq(mock.data.error.code, "PAYMENT_EXCEEDS_TOTAL", "超付错误码");
  const mockOk = await post("/api/admin/payments/mock", tokens.admin, { orderId, amount: 100 });
  eq(mockOk.status, 200, "模拟到账");
  ok(["PARTIALLY_PAID", "PENDING_SANLEI"].includes(mockOk.data.data.status), "到账后状态合理");
});
await step("财务：发票、运费、调整款与结算", async () => {
  const finance = await get("/api/admin/finance", tokens.finance);
  eq(finance.status, 200, "财务总览");
  const order = db.prepare("SELECT * FROM orders WHERE status != 'CANCELLED' LIMIT 1").get();
  const invoice = await post("/api/admin/finance/invoices", tokens.finance, {
    orderId: order.id, title: "API验证公司", taxNumber: "91310000QA", amount: 100, taxRate: 13
  });
  eq(invoice.status, 201, "开票申请");
  const issued = await post(`/api/admin/finance/invoices/${invoice.data.data.id}/status`, tokens.finance, { status: "ISSUED" });
  eq(issued.data.data.status, "ISSUED", "发票已开");
  const freight = await post("/api/admin/finance/freight", tokens.finance, {
    orderId: order.id, amount: 66, payer: "CUSTOMER", description: "API验证运费"
  });
  eq(freight.status, 201, "运费");
  const settled = await post(`/api/admin/finance/freight/${freight.data.data.id}/settle`, tokens.finance, {});
  eq(settled.status, 200, "运费结算");
  ok(settled.data.data.freight.find((item) => item.id === freight.data.data.id).status === "SETTLED", "运费已结");
  const adjustment = await post("/api/admin/finance/adjustments", tokens.finance, {
    customerId: order.customer_id, orderId: order.id, type: "CLAIM", amount: -30, description: "API验证调整"
  });
  eq(adjustment.status, 201, "调整款");
  const adjSettled = await post(`/api/admin/finance/adjustment/${adjustment.data.data.id}/settle`, tokens.finance, {});
  eq(adjSettled.status, 200, "调整款结算");
  const zero = await post("/api/admin/finance/adjustments", tokens.finance, {
    customerId: order.customer_id, type: "OTHER", amount: 0
  });
  eq(zero.status, 400, "零金额调整被拒绝");
});
await step("缺货公平分配预览与确认", async () => {
  db.prepare("UPDATE inventory SET quantity = reserved + 4 WHERE product_id = 'prod_shock_ae'").run();
  const createdA = await post("/api/mobile/orders", tokens["13800000001"], {
    orderType: "PREPAY", items: [{ productId: "prod_shock_ae", quantity: 2 }]
  });
  const createdB = await post("/api/mobile/orders", tokens["13800000003"], {
    orderType: "PREPAY", items: [{ productId: "prod_shock_ae", quantity: 2 }]
  });
  await post(`/api/admin/orders/${createdA.data.data.orderIds[0]}/actions`, tokens.bangbang, { action: "BANGBANG_CONFIRM" });
  await post(`/api/admin/orders/${createdB.data.data.orderIds[0]}/actions`, tokens.bangbang, { action: "BANGBANG_CONFIRM" });
  const list = await get("/api/admin/shortages", tokens.admin);
  eq(list.status, 200, "缺货产品列表");
  const preview = await get("/api/admin/shortages/prod_shock_ae/preview", tokens.admin);
  eq(preview.status, 200, "分配预览");
  ok(preview.data.data.candidates.length >= 2, "至少两个候选订单");
  const total = preview.data.data.candidates.reduce((sum, item) => sum + item.suggestedQuantity, 0);
  ok(total <= preview.data.data.physicalStock, "分配不超过实物库存");
  ok(total % 2 === 0, "按最小包装取整");
  const applied = await post("/api/admin/shortages/prod_shock_ae/apply", tokens.admin, {
    targets: preview.data.data.candidates.map((item) => ({ orderItemId: item.orderItemId, quantity: item.suggestedQuantity }))
  });
  eq(applied.status, 200, "确认分配");
});
await step("计划执行报表可用", async () => {
  const report = await get("/api/admin/reports/plan-execution", tokens.admin);
  eq(report.status, 200, "报表");
  ok(Array.isArray(report.data.data), "报表为数组");
});
await step("账号权限：列表、开客户号、开内部号、启停用", async () => {
  const users = await get("/api/admin/users", tokens.admin);
  eq(users.status, 200, "账号列表");
  const customer = db.prepare("SELECT id FROM customers WHERE code = 'CUS-001'").get();
  const customerUser = await post("/api/admin/users/customer", tokens.admin, {
    customerId: customer.id, phone: "13900000077", displayName: "API验证子账号"
  });
  eq(customerUser.status, 201, "开客户子账号");
  const staff = await post("/api/admin/users/staff", tokens.admin, {
    username: "qa-staff", displayName: "API验证员工", role: "SANLEI_SALES", password: "QaStaff@123", phone: "13900000078"
  });
  eq(staff.status, 201, "开内部账号");
  const disabled = await post(`/api/admin/users/${staff.data.data.id}/toggle`, tokens.admin, { active: false });
  eq(disabled.status, 200, "停用账号");
  eq(disabled.data.data.active, false, "停用生效");
  const weak = await post("/api/admin/users/staff", tokens.admin, {
    username: "qa-weak", displayName: "弱密码", role: "SANLEI_SALES", password: "123"
  });
  eq(weak.status, 400, "弱密码被拒绝");
  const adminUser = db.prepare("SELECT id FROM users WHERE role = 'SUPER_ADMIN'").get();
  const selfDisable = await post(`/api/admin/users/${adminUser.id}/toggle`, tokens.admin, { active: false });
  eq(selfDisable.status, 409, "禁止停用超级管理员");
});
await step("审计日志记录关键操作", async () => {
  const logs = await get("/api/admin/audit-logs", tokens.admin);
  eq(logs.status, 200, "审计日志");
  ok(logs.data.data.length > 0, "存在日志");
  ok(logs.data.data.some((item) => item.action === "CREATE_ORDER"), "包含建单审计");
});

// ---------------------------------------------------------------- 导出/导入
section("导入导出与模板");
for (const kind of ["orders", "inventory", "payments", "plans"]) {
  await step(`导出 ${kind}（CSV + XLSX）`, async () => {
    const csv = await get(`/api/admin/exports/${kind}`, tokens.admin);
    eq(csv.status, 200, "CSV 状态");
    ok(csv.contentType.includes("text/csv"), "CSV 类型");
    ok(csv.text.length > 10, "CSV 内容");
    const xlsx = await get(`/api/admin/exports/${kind}/xlsx`, tokens.admin);
    eq(xlsx.status, 200, "XLSX 状态");
    ok(xlsx.buffer.length > 100, "XLSX 内容");
    eq(xlsx.buffer.subarray(0, 2).toString(), "PK", "XLSX 文件头");
  });
}
await step("非法导出类型返回 404", async () => {
  const result = await get("/api/admin/exports/unknown", tokens.admin);
  eq(result.status, 404, "状态");
  eq(result.data.error.code, "EXPORT_NOT_FOUND", "错误码");
});
for (const kind of ["customers", "products", "prices", "inventory"]) {
  await step(`下载 ${kind} 导入模板（CSV + XLSX）`, async () => {
    const csv = await get(`/api/admin/import-templates/${kind}`, tokens.admin);
    eq(csv.status, 200, "CSV 模板");
    ok(csv.text.includes(","), "含表头");
    const xlsx = await get(`/api/admin/import-templates/${kind}/xlsx`, tokens.admin);
    eq(xlsx.status, 200, "XLSX 模板");
    eq(xlsx.buffer.subarray(0, 2).toString(), "PK", "XLSX 文件头");
  });
}
await step("CSV 导入客户/产品/价格/库存", async () => {
  const customers = await call("POST", "/api/admin/imports/customers", {
    token: tokens.admin, contentType: "text/csv; charset=utf-8",
    raw: "客户编码,客户名称,省份,城市,渠道类型,客户等级,价格等级,结算方式,账期天数,授信额度,预付款比例,最多发货批次,手机号,地址\n" +
      "CUS-QA-IMP,导入客户,浙江省,宁波市,CHAIN,B,STANDARD,CREDIT,15,5000,1,2,13911112222,验证路1号"
  });
  eq(customers.status, 200, "导入客户");
  eq(customers.data.data.imported, 1, "客户导入行数");
  const products = await call("POST", "/api/admin/imports/products", {
    token: tokens.admin, contentType: "text/csv; charset=utf-8",
    raw: "物料号,品名,分类,车型,最小包装,基础价,质保月数,质保公里,说明\nSL-QA-IMP,导入产品,摆臂,传祺M8,2,300,12,60000,CSV导入"
  });
  eq(products.status, 200, "导入产品");
  const prices = await call("POST", "/api/admin/imports/prices", {
    token: tokens.admin, contentType: "text/csv; charset=utf-8",
    raw: "范围,价格等级或客户编码,物料号,价格\n等级,GOLD,SL-QA-IMP,280"
  });
  eq(prices.status, 200, "导入价格");
  const inventory = await call("POST", "/api/admin/imports/inventory", {
    token: tokens.admin, contentType: "text/csv; charset=utf-8",
    raw: "物料号,仓库名称,库存类型,数量,供应商名称\nSL-QA-IMP,验证仓,VIRTUAL,8,三磊工厂直供"
  });
  eq(inventory.status, 200, "导入库存");
  const row = db.prepare("SELECT SUM(quantity) AS q FROM inventory WHERE product_id = (SELECT id FROM products WHERE sku='SL-QA-IMP')").get();
  eq(row.q, 8, "库存导入生效");
});
await step("XLSX 导入产品", async () => {
  const buffer = writeWorkbookRows(
    ["物料号", "品名", "分类", "车型", "最小包装", "基础价", "质保月数", "质保公里", "说明"],
    [["SL-QA-XLSX", "Excel导入产品", "球头", "埃安Y", "2", "399", "12", "60000", "XLSX导入"]]
  );
  const result = await post("/api/admin/imports/products/xlsx", tokens.admin, { fileBase64: buffer.toString("base64") });
  eq(result.status, 200, "XLSX 导入");
  eq(result.data.data.imported, 1, "导入行数");
  const missing = await post("/api/admin/imports/products/xlsx", tokens.admin, {});
  eq(missing.status, 400, "缺少文件内容");
});
await step("导入整批事务回滚（存在非法行时全部回滚）", async () => {
  const result = await call("POST", "/api/admin/imports/customers", {
    token: tokens.admin, contentType: "text/csv; charset=utf-8",
    raw: "客户编码,客户名称,省份,城市,渠道类型,客户等级,价格等级,结算方式,账期天数,授信额度,预付款比例,最多发货批次,手机号,地址\n" +
      "CUS-QA-ROLLBACK-1,回滚客户1,江苏省,南京市,WHOLESALER,A,VIP,CREDIT,30,1000,1,3,13922223333,回滚路1号\n" +
      "CUS-QA-ROLLBACK-2,,江苏省,南京市,WHOLESALER,A,VIP,CREDIT,30,1000,1,3,13922223334,回滚路2号"
  });
  eq(result.status, 400, "状态");
  eq(result.data.error.code, "IMPORT_VALIDATION_FAILED", "错误码");
  const row = db.prepare("SELECT COUNT(*) AS c FROM customers WHERE code LIKE 'CUS-QA-ROLLBACK%'").get();
  eq(row.c, 0, "整批回滚");
});
await step("空导入与非法 JSON 处理", async () => {
  const empty = await call("POST", "/api/admin/imports/customers", {
    token: tokens.admin, contentType: "text/csv; charset=utf-8", raw: "客户编码,客户名称\n"
  });
  eq(empty.status, 400, "空导入");
  eq(empty.data.error.code, "EMPTY_IMPORT", "空导入错误码");
  const badJson = await call("POST", "/api/admin/customers", {
    token: tokens.admin, headers: { "Content-Type": "application/json" }, raw: "{bad json"
  });
  eq(badJson.status, 400, "非法 JSON");
  eq(badJson.data.error.code, "INVALID_JSON", "JSON 错误码");
});

// ---------------------------------------------------------------- 权限矩阵
section("角色权限与越权防护");
const denials = [
  ["客户访问管理端接口", tokens["13800000001"], "GET", "/api/admin/dashboard", 404],
  ["仓库读取价格矩阵", tokens.warehouse, "GET", "/api/admin/prices", 403],
  ["售后新建产品", tokens.service, "POST", "/api/admin/products", 403],
  ["财务创建客户", tokens.finance, "POST", "/api/admin/customers", 403],
  ["销售开内部账号", tokens.sanlei, "POST", "/api/admin/users/staff", 403],
  ["邦邦读取审计日志", tokens.bangbang, "GET", "/api/admin/audit-logs", 403],
  ["仓库确认订单", tokens.warehouse, "POST", "/api/admin/orders/x/actions", 403, { action: "BANGBANG_CONFIRM" }],
  ["客户发起发货", tokens["13800000001"], "POST", "/api/admin/orders/x/actions", 404],
  ["邦邦财务登记开票（界面按钮可见）", tokens["bangbang-finance"], "POST", "/api/admin/finance/invoices", 403, { orderId: "x" }],
  ["邦邦运营登记运费（界面按钮可见）", tokens.bangbang, "POST", "/api/admin/finance/freight", 403, { orderId: "x" }],
  ["三磊销售调整库存（界面按钮可见）", tokens.sanlei, "POST", "/api/admin/inventory/x/adjust", 403, { quantity: 1 }],
];
for (const [name, token, method, path, expected, payload] of denials) {
  await step(`权限：${name} → ${expected}`, async () => {
    const result = await call(method, path, { token, json: payload || {} });
    eq(result.status, expected, "状态码");
  });
}
await step("权限：邦邦确认订单被拒（非本角色）", async () => {
  const order = db.prepare("SELECT id FROM orders WHERE status = 'PENDING_BANGBANG' LIMIT 1").get();
  ok(order, "存在待确认订单");
  const denied = await post(`/api/admin/orders/${order.id}/actions`, tokens.warehouse, { action: "BANGBANG_CONFIRM" });
  eq(denied.status, 403, "状态码");
  eq(denied.data.error.code, "FORBIDDEN", "错误码");
});
await step("权限：客户不能访问其他客户计划与售后", async () => {
  const plans = await get("/api/mobile/plans", tokens["13800000001"]);
  ok(plans.status === 200, "计划列表");
  const otherPlan = db.prepare("SELECT id FROM plans LIMIT 1").get();
  const result = await put(`/api/mobile/plans/${otherPlan.id}`, tokens["13800000003"], {
    items: [{ weekNo: 1, productId: "prod_arm_ae", quantity: 2 }]
  });
  ok([404].includes(result.status), `预期 404，实际 ${result.status}`);
});

// ---------------------------------------------------------------- 收尾
await step("注销后 Token 失效", async () => {
  const session = await login("finance");
  const before = await get("/api/me", session.token);
  eq(before.status, 200, "注销前可用");
  const logout = await post("/api/auth/logout", session.token, {});
  eq(logout.status, 200, "注销");
  const after = await get("/api/me", session.token);
  eq(after.status, 401, "注销后失效");
});
await step("未知接口返回 404", async () => {
  const result = await get("/api/not-exist", tokens.admin);
  eq(result.status, 404, "状态");
  eq(result.data.error.code, "NOT_FOUND", "错误码");
});
await step("微信支付回调在 mock 模式返回未配置（503）", async () => {
  const result = await post("/api/wechat/pay/notify", null, { resource: { ciphertext: "x", nonce: "y" } });
  eq(result.status, 503, "状态");
  eq(result.data.error.code, "WECHAT_NOT_CONFIGURED", "错误码");
});
await step("登录失败 8 次后触发限流", async () => {
  let last;
  for (let index = 0; index < 9; index += 1) {
    last = await post("/api/auth/login", null, { username: "admin", password: "wrong" });
  }
  eq(last.status, 429, "限流状态");
  eq(last.data.error.code, "LOGIN_RATE_LIMITED", "限流错误码");
});

// ---------------------------------------------------------------- 汇总
const passed = checks.filter((item) => item.pass).length;
const failed = checks.filter((item) => !item.pass);
console.log(`\n========== 验证结果 ==========`);
console.log(`通过 ${passed}/${checks.length} 项${failed.length ? `，失败 ${failed.length} 项` : ""}`);
if (failed.length) {
  console.log("\n失败项：");
  for (const item of failed) console.log(` - ${item.name}\n   ${item.error}`);
}
if (gaps.length) {
  console.log("\n业务缺口：");
  for (const note of gaps) console.log(` - ${note}`);
}
server.close();
db.close();
process.exitCode = failed.length ? 1 : 0;
