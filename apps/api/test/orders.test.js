import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { buildApp } from "../src/server.js";
import { createDb, closeDb } from "@saas/db";

const hasDb = Boolean(process.env.DATABASE_URL);
const stamp = Date.now();
const state = {
  customers: [],
  users: [],
  products: [],
  orders: [],
  groups: [],
  shipments: [],
  payments: []
};

let app;
let adminToken;
let bangbangToken;
let sanleiToken;
let warehouseToken;
let pool;

async function login(username) {
  const response = await app.inject({
    method: "POST",
    url: "/api/auth/login",
    payload: { username, password: "Admin@123" }
  });
  assert.equal(response.statusCode, 200, response.body);
  return response.json().data.token;
}

async function call(method, url, token, payload) {
  return app.inject({
    method,
    url,
    headers: token ? { authorization: `Bearer ${token}` } : {},
    payload
  });
}

async function createFixture({ suffix, settlementMethod = "CREDIT", prepayRatio = 1, authorizeVehicle = "传祺M8" }) {
  const phone = `139${String(stamp + state.customers.length * 7).slice(-8)}`;
  const customerResponse = await call("POST", "/api/admin/customers", adminToken, {
    code: `QA-ORD-${suffix}-${stamp}`,
    name: `订单测试客户${suffix}`,
    province: "上海市",
    city: "上海市",
    channelType: "WHOLESALER",
    grade: "A",
    priceTier: "VIP",
    settlementMethod,
    paymentTermsDays: 30,
    creditLimit: 50000,
    prepayRatio,
    batchLimit: 3,
    phone
  });
  assert.equal(customerResponse.statusCode, 201, customerResponse.body);
  const customerId = customerResponse.json().data.id;
  state.customers.push(customerId);

  const productResponse = await call("POST", "/api/admin/products", adminToken, {
    sku: `QA-ORDP-${suffix}-${stamp}`,
    name: `订单测试产品${suffix}`,
    category: "球头",
    vehicleModel: "传祺M8",
    minPackage: 1,
    basePrice: 100,
    warrantyMonths: 12,
    warrantyKm: 60000
  });
  assert.equal(productResponse.statusCode, 201, productResponse.body);
  const productId = productResponse.json().data.id;
  state.products.push(productId);

  const priceResponse = await call("PUT", "/api/admin/prices", adminToken, {
    productId,
    tier: "VIP",
    price: 100
  });
  assert.equal(priceResponse.statusCode, 200, priceResponse.body);

  const authResponse = await call("PUT", `/api/admin/customers/${customerId}/authorizations`, adminToken, {
    vehicles: [authorizeVehicle]
  });
  assert.equal(authResponse.statusCode, 200, authResponse.body);

  await pool.query(
    `INSERT INTO inventory (id, product_id, warehouse_name, source_type, supplier_id, quantity, reserved, updated_at)
     VALUES (?, ?, '订单测试仓', 'REAL', NULL, 100, 0, ?)`,
    [`inv_${suffix}_${stamp}`, productId, new Date().toISOString()]
  );
  const userId = `user_${suffix}_${stamp}`;
  await pool.query(
    `INSERT INTO users (id, username, password_hash, display_name, phone, wechat_openid, role, customer_id, active, created_at)
     VALUES (?, ?, NULL, ?, ?, NULL, 'CUSTOMER_BUYER', ?, 1, ?)`,
    [userId, phone, `测试采购员${suffix}`, phone, customerId, new Date().toISOString()]
  );
  state.users.push(userId);
  const loginResponse = await call("POST", "/api/auth/dev-login", null, { phone });
  assert.equal(loginResponse.statusCode, 200, loginResponse.body);
  const customerToken = loginResponse.json().data.token;
  return { customerId, productId, customerToken, phone };
}

before(async () => {
  if (!hasDb) return;
  app = await buildApp({ logger: false });
  adminToken = await login("admin");
  bangbangToken = await login("bangbang");
  sanleiToken = await login("sanlei");
  warehouseToken = await login("warehouse");
  pool = createDb().pool;
});

after(async () => {
  if (!hasDb) return;
  try {
    const orderIds = state.orders;
    const productIds = state.products;
    const customerIds = state.customers;
    const userIds = state.users;
    if (orderIds.length) {
      const placeholders = orderIds.map(() => "?").join(",");
      await pool.query(
        `DELETE si FROM shipment_items si JOIN shipments s ON s.id = si.shipment_id WHERE s.order_id IN (${placeholders})`,
        orderIds
      );
      await pool.query(`DELETE FROM shipments WHERE order_id IN (${placeholders})`, orderIds);
      await pool.query(
        `DELETE r FROM reservations r JOIN order_items oi ON oi.id = r.order_item_id WHERE oi.order_id IN (${placeholders})`,
        orderIds
      );
      await pool.query(`DELETE FROM payments WHERE order_id IN (${placeholders})`, orderIds);
      await pool.query(`DELETE FROM order_items WHERE order_id IN (${placeholders})`, orderIds);
      await pool.query(`DELETE FROM inventory_movements WHERE reference_id IN (${placeholders})`, orderIds);
      await pool.query(`DELETE FROM orders WHERE id IN (${placeholders})`, orderIds);
    }
    if (customerIds.length) {
      const placeholders = customerIds.map(() => "?").join(",");
      await pool.query(`DELETE FROM order_groups WHERE customer_id IN (${placeholders})`, customerIds);
    }
    if (productIds.length) {
      const placeholders = productIds.map(() => "?").join(",");
      await pool.query(
        `DELETE m FROM inventory_movements m JOIN inventory i ON i.id = m.inventory_id WHERE i.product_id IN (${placeholders})`,
        productIds
      );
      await pool.query(`DELETE FROM inventory WHERE product_id IN (${placeholders})`, productIds);
      await pool.query(`DELETE FROM customer_prices WHERE product_id IN (${placeholders})`, productIds);
      await pool.query(`DELETE FROM price_rules WHERE product_id IN (${placeholders})`, productIds);
    }
    if (userIds.length) {
      const placeholders = userIds.map(() => "?").join(",");
      await pool.query(`DELETE FROM notifications WHERE user_id IN (${placeholders})`, userIds);
      await pool.query(`DELETE FROM sessions WHERE user_id IN (${placeholders})`, userIds);
    }
    if (customerIds.length) {
      const placeholders = customerIds.map(() => "?").join(",");
      await pool.query(`DELETE FROM customer_prices WHERE customer_id IN (${placeholders})`, customerIds);
      await pool.query(`DELETE FROM customer_vehicle_authorizations WHERE customer_id IN (${placeholders})`, customerIds);
      await pool.query(`DELETE FROM users WHERE customer_id IN (${placeholders})`, customerIds);
      await pool.query(`DELETE FROM audit_logs WHERE entity_id IN (${placeholders})`, customerIds);
      await pool.query(`DELETE FROM customers WHERE id IN (${placeholders})`, customerIds);
    }
    if (productIds.length) {
      const placeholders = productIds.map(() => "?").join(",");
      await pool.query(`DELETE FROM audit_logs WHERE entity_id IN (${placeholders})`, productIds);
      await pool.query(`DELETE FROM products WHERE id IN (${placeholders})`, productIds);
    }
  } finally {
    await closeDb(pool);
    await app.close();
  }
});

function skipUnlessDb() {
  return { skip: hasDb ? false : "未配置 DATABASE_URL" };
}

async function createOrder(token, productId, quantity, orderType = "NORMAL") {
  const response = await call("POST", "/api/mobile/orders", token, {
    orderType,
    items: [{ productId, quantity }]
  });
  assert.equal(response.statusCode, 201, response.body);
  const orderIds = response.json().data.orderIds;
  state.orders.push(...orderIds);
  state.groups.push(response.json().data.groupId);
  return orderIds[0];
}

test("信用订单：目录→下单→确认→接单→发货→收货", skipUnlessDb(), async () => {
  const fixture = await createFixture({ suffix: "A" });
  const catalog = await call("GET", "/api/mobile/catalog", fixture.customerToken);
  assert.equal(catalog.statusCode, 200);
  const product = catalog.json().data.products.find((item) => item.id === fixture.productId);
  assert.equal(product.price, 100);
  assert.equal(product.priceSource, "PRICE_TIER");

  const orderId = await createOrder(fixture.customerToken, fixture.productId, 10);
  const detail = await call("GET", `/api/mobile/orders/${orderId}`, fixture.customerToken);
  assert.equal(detail.statusCode, 200);
  assert.equal(detail.json().data.status, "PENDING_BANGBANG");
  assert.equal(detail.json().data.items[0].unitPrice, 100);

  const confirmed = await call("POST", `/api/admin/orders/${orderId}/actions`, bangbangToken, { action: "BANGBANG_CONFIRM" });
  assert.equal(confirmed.statusCode, 200, confirmed.body);
  assert.equal(confirmed.json().data.status, "PENDING_SANLEI");
  assert.equal(confirmed.json().data.items[0].reservedQuantity, 10);

  const accepted = await call("POST", `/api/admin/orders/${orderId}/actions`, sanleiToken, { action: "SANLEI_ACCEPT" });
  assert.equal(accepted.statusCode, 200);
  assert.equal(accepted.json().data.status, "PREPARING");

  const shipped = await call("POST", `/api/admin/orders/${orderId}/actions`, warehouseToken, {
    action: "SHIP",
    shipment: {
      logisticsCompany: "顺丰速运",
      trackingNo: "SF-TEST-A",
      items: [{ orderItemId: accepted.json().data.items[0].id, quantity: 10 }]
    }
  });
  assert.equal(shipped.statusCode, 200, shipped.body);
  assert.equal(shipped.json().data.status, "SHIPPED");
  const shipmentId = shipped.json().data.shipments[0].id;
  state.shipments.push(shipmentId);

  const received = await call("POST", `/api/mobile/shipments/${shipmentId}/receive`, fixture.customerToken, {});
  assert.equal(received.statusCode, 200);
  assert.equal(received.json().data.status, "COMPLETED");

  const [stock] = await pool.query("SELECT quantity FROM inventory WHERE product_id = ?", [fixture.productId]);
  assert.equal(stock[0].quantity, 90);
});

test("订单价格快照不随价格调整变化", skipUnlessDb(), async () => {
  const fixture = await createFixture({ suffix: "B" });
  const firstOrder = await createOrder(fixture.customerToken, fixture.productId, 2);
  const firstDetail = await call("GET", `/api/mobile/orders/${firstOrder}`, fixture.customerToken);
  assert.equal(firstDetail.json().data.items[0].unitPrice, 100);

  const reprice = await call("PUT", "/api/admin/prices", adminToken, {
    productId: fixture.productId,
    tier: "VIP",
    price: 120
  });
  assert.equal(reprice.statusCode, 200);

  const oldDetail = await call("GET", `/api/mobile/orders/${firstOrder}`, fixture.customerToken);
  assert.equal(oldDetail.json().data.items[0].unitPrice, 100);
  const secondOrder = await createOrder(fixture.customerToken, fixture.productId, 3);
  const secondDetail = await call("GET", `/api/mobile/orders/${secondOrder}`, fixture.customerToken);
  assert.equal(secondDetail.json().data.items[0].unitPrice, 120);
});

test("预付款：支付门槛、分批发货上限与补款限制", skipUnlessDb(), async () => {
  const fixture = await createFixture({ suffix: "P", settlementMethod: "PREPAY", prepayRatio: 0.5 });
  const orderId = await createOrder(fixture.customerToken, fixture.productId, 10, "PREPAY");
  const total = 1000;
  const confirmed = await call("POST", `/api/admin/orders/${orderId}/actions`, bangbangToken, { action: "BANGBANG_CONFIRM" });
  assert.equal(confirmed.statusCode, 200, confirmed.body);
  assert.equal(confirmed.json().data.status, "PENDING_PAYMENT");

  const payment = await call("POST", "/api/mobile/payments", fixture.customerToken, { orderId, amount: total * 0.5 });
  assert.equal(payment.statusCode, 201, payment.body);
  assert.equal(payment.json().data.mockMode, true);
  const paid = await call("POST", `/api/mobile/payments/${payment.json().data.id}/mock-complete`, fixture.customerToken, {});
  assert.equal(paid.statusCode, 200, paid.body);
  assert.equal(paid.json().data.status, "PENDING_SANLEI");
  assert.equal(paid.json().data.paidAmount, 500);

  const accepted = await call("POST", `/api/admin/orders/${orderId}/actions`, sanleiToken, { action: "SANLEI_ACCEPT" });
  assert.equal(accepted.statusCode, 200);
  const itemId = accepted.json().data.items[0].id;
  const shipment = await call("POST", `/api/admin/orders/${orderId}/actions`, warehouseToken, {
    action: "SHIP",
    shipment: { logisticsCompany: "德邦", trackingNo: "DB-TEST-P", items: [{ orderItemId: itemId, quantity: 5 }] }
  });
  assert.equal(shipment.statusCode, 200, shipment.body);
  assert.equal(shipment.json().data.status, "PARTIALLY_SHIPPED");
  state.shipments.push(shipment.json().data.shipments[0].id);
  const received = await call("POST", `/api/mobile/shipments/${shipment.json().data.shipments[0].id}/receive`, fixture.customerToken, {});
  assert.equal(received.statusCode, 200);
  assert.equal(received.json().data.status, "PARTIALLY_SHIPPED");

  const secondShipment = await call("POST", `/api/admin/orders/${orderId}/actions`, warehouseToken, {
    action: "SHIP",
    shipment: { logisticsCompany: "德邦", trackingNo: "DB-TEST-P2", items: [{ orderItemId: itemId, quantity: 5 }] }
  });
  assert.equal(secondShipment.statusCode, 409);
  assert.equal(secondShipment.json().error.code, "SHIPMENT_EXCEEDS_PREPAYMENT");

  const topUp = await call("POST", "/api/mobile/payments", fixture.customerToken, { orderId, amount: 500 });
  assert.equal(topUp.statusCode, 409);
  assert.equal(topUp.json().error.code, "INVALID_ORDER_STATUS");
});

test("取消订单释放库存预占", skipUnlessDb(), async () => {
  const fixture = await createFixture({ suffix: "C" });
  const orderId = await createOrder(fixture.customerToken, fixture.productId, 4);
  const confirmed = await call("POST", `/api/admin/orders/${orderId}/actions`, bangbangToken, { action: "BANGBANG_CONFIRM" });
  assert.equal(confirmed.statusCode, 200);
  const [reserved] = await pool.query("SELECT SUM(reserved) AS total FROM inventory WHERE product_id = ?", [fixture.productId]);
  assert.equal(Number(reserved[0].total), 4);

  const cancelled = await call("POST", `/api/mobile/orders/${orderId}/cancel`, fixture.customerToken, { reason: "测试取消" });
  assert.equal(cancelled.statusCode, 200, cancelled.body);
  assert.equal(cancelled.json().data.status, "CANCELLED");
  const [after] = await pool.query("SELECT SUM(reserved) AS total FROM inventory WHERE product_id = ?", [fixture.productId]);
  assert.equal(Number(after[0].total), 0);
});

test("客户隔离与移动端/管理端路由边界", skipUnlessDb(), async () => {
  const fixture = await createFixture({ suffix: "I" });
  const orderId = await createOrder(fixture.customerToken, fixture.productId, 1);

  const otherLogin = await call("POST", "/api/auth/dev-login", null, { phone: "13800000003" });
  assert.equal(otherLogin.statusCode, 200);
  const otherToken = otherLogin.json().data.token;
  const stolen = await call("GET", `/api/mobile/orders/${orderId}`, otherToken);
  assert.equal(stolen.statusCode, 404);
  assert.equal(stolen.json().error.code, "ORDER_NOT_FOUND");

  const staffMobile = await call("GET", "/api/mobile/orders", adminToken);
  assert.equal(staffMobile.statusCode, 404);
  const customerAdmin = await call("GET", "/api/admin/orders", fixture.customerToken);
  assert.equal(customerAdmin.statusCode, 404);
});
