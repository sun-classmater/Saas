import assert from "node:assert/strict";
import http from "node:http";
import { after, before, test } from "node:test";
import { createDatabase } from "../server/database.js";
import { createRequestHandler } from "../server/routes.js";
import { readWorkbookRows, writeWorkbookRows } from "../server/xlsx.js";

let db;
let server;
let baseUrl;
const tokens = {};

before(async () => {
  process.env.WECHAT_MODE = "mock";
  db = createDatabase(":memory:");
  server = http.createServer(createRequestHandler({ db }));
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  baseUrl = `http://127.0.0.1:${address.port}`;
  tokens.customer1 = (await loginCustomer("13800000001")).token;
  tokens.customer2 = (await loginCustomer("13800000002")).token;
  tokens.customer3 = (await loginCustomer("13800000003")).token;
  tokens.admin = (await loginStaff("admin")).token;
  tokens.bangbang = (await loginStaff("bangbang")).token;
  tokens.sanlei = (await loginStaff("sanlei")).token;
  tokens.warehouse = (await loginStaff("warehouse")).token;
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
  db.close();
});

test("health endpoint is available", async () => {
  const result = await request("/api/health", { auth: false });
  assert.equal(result.status, 200);
  assert.equal(result.data.data.status, "ok");
});

test("customer specific price overrides the price tier", async () => {
  const customer1Catalog = await request("/api/mobile/catalog", { token: tokens.customer1 });
  const ballJoint = customer1Catalog.data.data.products.find((item) => item.id === "prod_ball_m8");
  assert.equal(ballJoint.price, 99);
  assert.equal(ballJoint.priceSource, "CUSTOMER_SPECIFIC");

  const customer2Catalog = await request("/api/mobile/catalog", { token: tokens.customer2 });
  const otherBallJoint = customer2Catalog.data.data.products.find((item) => item.id === "prod_ball_m8");
  assert.equal(otherBallJoint.price, 115.2);
  assert.equal(otherBallJoint.priceSource, "PRICE_TIER");
});

test("prepayment order completes payment, batch shipment and receipt", async () => {
  const created = await request("/api/mobile/orders", {
    method: "POST",
    token: tokens.customer2,
    body: {
      orderType: "PREPAY",
      note: "automated end-to-end order",
      items: [{ productId: "prod_ball_m8", quantity: 10 }]
    }
  });
  assert.equal(created.status, 201);
  const orderId = created.data.data.orderIds[0];

  const beforeConfirm = await getOrder(orderId, tokens.customer2);
  assert.equal(beforeConfirm.status, "PENDING_BANGBANG");

  await request(`/api/admin/orders/${orderId}/actions`, {
    method: "POST",
    token: tokens.bangbang,
    body: { action: "BANGBANG_CONFIRM" }
  });
  const afterConfirm = await getOrder(orderId, tokens.customer2);
  assert.equal(afterConfirm.status, "PENDING_PAYMENT");
  assert.equal(afterConfirm.items[0].reservedQuantity, 10);

  const payment = await request("/api/mobile/payments", {
    method: "POST",
    token: tokens.customer2,
    body: { orderId, amount: afterConfirm.totalAmount }
  });
  assert.equal(payment.data.data.mockMode, true);
  await request(`/api/mobile/payments/${payment.data.data.id}/mock-complete`, {
    method: "POST",
    token: tokens.customer2,
    body: {}
  });
  const afterPayment = await getOrder(orderId, tokens.customer2);
  assert.equal(afterPayment.status, "PENDING_SANLEI");
  assert.equal(afterPayment.paidAmount, afterPayment.totalAmount);

  await request(`/api/admin/orders/${orderId}/actions`, {
    method: "POST",
    token: tokens.sanlei,
    body: { action: "SANLEI_ACCEPT" }
  });
  const shipped = await request(`/api/admin/orders/${orderId}/actions`, {
    method: "POST",
    token: tokens.warehouse,
    body: {
      action: "SHIP",
      shipment: {
        logisticsCompany: "顺丰速运",
        trackingNo: "SF-TEST-001",
        deliveryMode: "DELIVERY",
        items: [{ orderItemId: afterPayment.items[0].id, quantity: 10 }]
      }
    }
  });
  assert.equal(shipped.status, 200);
  assert.equal(shipped.data.data.status, "SHIPPED");
  const shipmentId = shipped.data.data.shipments[0].id;

  const received = await request(`/api/mobile/shipments/${shipmentId}/receive`, {
    method: "POST",
    token: tokens.customer2,
    body: {}
  });
  assert.equal(received.data.data.status, "COMPLETED");
  assert.equal(received.data.data.paidAmount, received.data.data.totalAmount);
  assert.equal(received.data.data.shippedAmount, received.data.data.totalAmount);

  const stock = db.prepare(`
    SELECT SUM(quantity - reserved) AS available FROM inventory
    WHERE product_id = 'prod_ball_m8'
  `).get();
  assert.equal(stock.available, 120);
});

test("customers cannot read another customer's order", async () => {
  const orders = await request("/api/mobile/orders", { token: tokens.customer2 });
  const orderId = orders.data.data[0].id;
  const result = await request(`/api/mobile/orders/${orderId}`, {
    token: tokens.customer3,
    expectError: true
  });
  assert.equal(result.status, 404);
  assert.equal(result.data.error.code, "ORDER_NOT_FOUND");
});

test("plan review chain and plan order quantity are enforced", async () => {
  const created = await request("/api/mobile/plans", {
    method: "POST",
    token: tokens.customer2,
    body: {
      planMonth: "2026-12",
      note: "automated plan",
      items: [{ weekNo: 1, productId: "prod_arm_ae", quantity: 2 }]
    }
  });
  const planId = created.data.data.id;
  await request(`/api/mobile/plans/${planId}/actions`, {
    method: "POST",
    token: tokens.customer2,
    body: { action: "SUBMIT" }
  });
  await request(`/api/admin/plans/${planId}/actions`, {
    method: "POST",
    token: tokens.bangbang,
    body: { action: "BANGBANG_APPROVE" }
  });
  const approved = await request(`/api/admin/plans/${planId}/actions`, {
    method: "POST",
    token: tokens.sanlei,
    body: { action: "SANLEI_APPROVE" }
  });
  assert.equal(approved.data.data.status, "APPROVED");

  const planOrder = await request("/api/mobile/orders", {
    method: "POST",
    token: tokens.customer2,
    body: {
      orderType: "PLAN",
      planId,
      planWeek: 1,
      items: [{ productId: "prod_arm_ae", quantity: 2 }]
    }
  });
  assert.equal(planOrder.status, 201);

  const exceeded = await request("/api/mobile/orders", {
    method: "POST",
    token: tokens.customer2,
    body: {
      orderType: "PLAN",
      planId,
      planWeek: 1,
      items: [{ productId: "prod_arm_ae", quantity: 2 }]
    },
    expectError: true
  });
  assert.equal(exceeded.status, 400);
  assert.equal(exceeded.data.error.code, "PLAN_QUANTITY_EXCEEDED");
});

test("unauthorized staff role cannot confirm orders", async () => {
  const created = await request("/api/mobile/orders", {
    method: "POST",
    token: tokens.customer2,
    body: {
      orderType: "PREPAY",
      items: [{ productId: "prod_ball_m8", quantity: 10 }]
    }
  });
  const orderId = created.data.data.orderIds[0];
  const denied = await request(`/api/admin/orders/${orderId}/actions`, {
    method: "POST",
    token: tokens.warehouse,
    body: { action: "BANGBANG_CONFIRM" },
    expectError: true
  });
  assert.equal(denied.status, 403);
  assert.equal(denied.data.error.code, "FORBIDDEN");
});

test("shortage allocation produces a stock-bounded package-aligned plan", async () => {
  const pendingOrders = db.prepare(`
    SELECT oi.id, oi.quantity
    FROM order_items oi JOIN orders o ON o.id = oi.order_id
    WHERE oi.product_id = 'prod_ball_m8' AND o.status = 'PENDING_BANGBANG'
  `).all();
  assert.ok(pendingOrders.length > 0);
  db.prepare(`
    UPDATE inventory SET quantity = reserved + 5 WHERE product_id = 'prod_ball_m8'
  `).run();
  const preview = await request("/api/admin/shortages/prod_ball_m8/preview", {
    token: tokens.admin
  });
  assert.equal(preview.status, 200);
  assert.ok(preview.data.data.candidates.length >= 1);
  const target = preview.data.data.candidates.reduce((sum, item) => sum + item.suggestedQuantity, 0);
  assert.ok(target <= preview.data.data.physicalStock);
  assert.equal(target % 10, 0);
  const applied = await request("/api/admin/shortages/prod_ball_m8/apply", {
    method: "POST",
    token: tokens.admin,
    body: {
      targets: preview.data.data.candidates.map((item) => ({
        orderItemId: item.orderItemId,
        quantity: item.suggestedQuantity
      }))
    }
  });
  assert.equal(applied.status, 200);
});

test("finance records can be created and settled", async () => {
  const order = db.prepare("SELECT * FROM orders WHERE status = 'PENDING_BANGBANG' LIMIT 1").get();
  const invoice = await request("/api/admin/finance/invoices", {
    method: "POST",
    token: tokens.admin,
    body: {
      orderId: order.id,
      title: "测试客户有限公司",
      taxNumber: "91310000TEST",
      amount: order.total_amount,
      taxRate: 13
    }
  });
  assert.equal(invoice.status, 201);
  const issued = await request(`/api/admin/finance/invoices/${invoice.data.data.id}/status`, {
    method: "POST",
    token: tokens.admin,
    body: { status: "ISSUED" }
  });
  assert.equal(issued.data.data.status, "ISSUED");

  const freight = await request("/api/admin/finance/freight", {
    method: "POST",
    token: tokens.admin,
    body: { orderId: order.id, amount: 88, payer: "CUSTOMER", description: "测试运费" }
  });
  assert.equal(freight.status, 201);
  const settled = await request(`/api/admin/finance/freight/${freight.data.data.id}/settle`, {
    method: "POST",
    token: tokens.admin,
    body: {}
  });
  assert.ok(settled.data.data.freight.some((item) => item.id === freight.data.data.id && item.status === "SETTLED"));
});

test("vehicle authorization controls the customer catalog", async () => {
  const customer = db.prepare("SELECT id FROM customers WHERE code = 'CUS-001'").get();
  const updated = await request(`/api/admin/customers/${customer.id}/authorizations`, {
    method: "PUT",
    token: tokens.admin,
    body: { vehicles: ["传祺M8"] }
  });
  assert.deepEqual(updated.data.data.authorizedVehicles, ["传祺M8"]);
  const catalog = await request("/api/mobile/catalog", { token: tokens.customer1 });
  assert.ok(catalog.data.data.products.length > 0);
  assert.ok(catalog.data.data.products.every((item) => item.vehicleModel === "传祺M8"));
});

test("CSV import is transactional and creates a customer", async () => {
  const csv = [
    "客户编码,客户名称,省份,城市,渠道类型,客户等级,价格等级,结算方式,账期天数,授信额度,预付款比例,最多发货批次,手机号,地址",
    "CUS-IMPORT-001,测试导入客户,江苏省,南京市,WHOLESALER,A,VIP,CREDIT,30,30000,1,3,13900000000,测试路1号"
  ].join("\r\n");
  const result = await request("/api/admin/imports/customers", {
    method: "POST",
    token: tokens.admin,
    rawText: csv,
    contentType: "text/csv; charset=utf-8"
  });
  assert.equal(result.status, 200);
  assert.equal(result.data.data.imported, 1);
  const customer = db.prepare("SELECT * FROM customers WHERE code = 'CUS-IMPORT-001'").get();
  assert.equal(customer.name, "测试导入客户");
});

test("XLSX files import and export through the API", async () => {
  const buffer = writeWorkbookRows(
    ["物料号", "品名", "分类", "车型", "最小包装", "基础价", "质保月数", "质保公里", "说明"],
    [["SL-XLSX-001", "Excel导入产品", "摆臂", "传祺M8", "2", "399", "12", "60000", "XLSX导入测试"]]
  );
  const result = await request("/api/admin/imports/products/xlsx", {
    method: "POST",
    token: tokens.admin,
    body: { fileBase64: Buffer.from(buffer).toString("base64") }
  });
  assert.equal(result.status, 200);
  assert.equal(result.data.data.imported, 1);

  const response = await fetch(`${baseUrl}/api/admin/exports/orders/xlsx`, {
    headers: { Authorization: `Bearer ${tokens.admin}` }
  });
  assert.equal(response.status, 200);
  const exported = Buffer.from(await response.arrayBuffer());
  const rows = readWorkbookRows(exported);
  assert.ok(rows.length > 0);
  assert.ok("订单号" in rows[0]);
});

test("internal users can change their password and revoke other sessions", async () => {
  const result = await request("/api/auth/change-password", {
    method: "POST",
    token: tokens.admin,
    body: {
      currentPassword: "Admin@123",
      newPassword: "Changed@123"
    }
  });
  assert.equal(result.status, 200);
  const login = await request("/api/auth/login", {
    method: "POST",
    auth: false,
    body: { username: "admin", password: "Changed@123" }
  });
  assert.ok(login.data.data.token);
  const oldPassword = await request("/api/auth/login", {
    method: "POST",
    auth: false,
    body: { username: "admin", password: "Admin@123" },
    expectError: true
  });
  assert.equal(oldPassword.status, 401);
});

async function getOrder(orderId, token) {
  const result = await request(`/api/mobile/orders/${orderId}`, { token });
  return result.data.data;
}

async function loginCustomer(phone) {
  const result = await request("/api/auth/dev-login", {
    method: "POST",
    auth: false,
    body: { phone }
  });
  return result.data.data;
}

async function loginStaff(username) {
  const result = await request("/api/auth/login", {
    method: "POST",
    auth: false,
    body: { username, password: "Admin@123" }
  });
  return result.data.data;
}

async function request(path, options = {}) {
  const headers = {};
  if (options.token) headers.Authorization = `Bearer ${options.token}`;
  let body;
  if (options.rawText !== undefined) {
    headers["Content-Type"] = options.contentType || "text/plain";
    body = options.rawText;
  } else if (options.body !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(options.body);
  }
  const response = await fetch(`${baseUrl}${path}`, {
    method: options.method || "GET",
    headers,
    body
  });
  const data = await response.json();
  if (!options.expectError && !response.ok) {
    assert.fail(`HTTP ${response.status}: ${JSON.stringify(data)}`);
  }
  return { status: response.status, data };
}
