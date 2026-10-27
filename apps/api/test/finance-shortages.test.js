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
  inventory: [],
  orders: [],
  groups: [],
  finance: { invoices: [], freight: [], adjustments: [] }
};

let app;
let adminToken;
let bangbangToken;
let sanleiToken;
let financeToken;
let bangbangFinanceToken;
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

async function createCustomer(suffix, phone) {
  const response = await call("POST", "/api/admin/customers", adminToken, {
    code: `QA-FIN-${suffix}-${stamp}`,
    name: `财务测试客户${suffix}`,
    province: "上海市",
    city: "上海市",
    channelType: "WHOLESALER",
    grade: "A",
    priceTier: "VIP",
    settlementMethod: "CREDIT",
    paymentTermsDays: 30,
    creditLimit: 50000,
    prepayRatio: 1,
    batchLimit: 3,
    phone
  });
  assert.equal(response.statusCode, 201, response.body);
  const customerId = response.json().data.id;
  state.customers.push(customerId);
  const userId = `user_fin_${suffix}_${stamp}`;
  await pool.query(
    `INSERT INTO users (id, username, password_hash, display_name, phone, wechat_openid, role, customer_id, active, created_at)
     VALUES (?, ?, NULL, ?, ?, NULL, 'CUSTOMER_BUYER', ?, 1, ?)`,
    [userId, phone, `财务采购员${suffix}`, phone, customerId, new Date().toISOString()]
  );
  state.users.push(userId);
  const loginResponse = await call("POST", "/api/auth/dev-login", null, { phone });
  assert.equal(loginResponse.statusCode, 200, loginResponse.body);
  return { customerId, userId, token: loginResponse.json().data.token };
}

async function createProduct(suffix, quantity = 100) {
  const response = await call("POST", "/api/admin/products", adminToken, {
    sku: `QA-FINP-${suffix}-${stamp}`,
    name: `财务测试产品${suffix}`,
    category: "球头",
    vehicleModel: "传祺M8",
    minPackage: 2,
    basePrice: 100,
    warrantyMonths: 12,
    warrantyKm: 60000
  });
  assert.equal(response.statusCode, 201, response.body);
  const productId = response.json().data.id;
  state.products.push(productId);
  await call("PUT", "/api/admin/prices", adminToken, { productId, tier: "VIP", price: 100 });
  await call("PUT", `/api/admin/customers/${state.customers[state.customers.length - 1]}/authorizations`, adminToken, {
    vehicles: ["传祺M8"]
  });
  const inventoryId = `inv_fin_${suffix}_${stamp}`;
  await pool.query(
    `INSERT INTO inventory (id, product_id, warehouse_name, source_type, supplier_id, quantity, reserved, updated_at)
     VALUES (?, ?, '财务测试仓', 'REAL', NULL, ?, 0, ?)`,
    [inventoryId, productId, quantity, new Date().toISOString()]
  );
  state.inventory.push(inventoryId);
  return productId;
}

async function createOrder(token, productId, quantity) {
  const response = await call("POST", "/api/mobile/orders", token, {
    orderType: "NORMAL",
    items: [{ productId, quantity }]
  });
  assert.equal(response.statusCode, 201, response.body);
  state.orders.push(...response.json().data.orderIds);
  state.groups.push(response.json().data.groupId);
  return response.json().data.orderIds[0];
}

before(async () => {
  if (!hasDb) return;
  app = await buildApp({ logger: false });
  adminToken = await login("admin");
  bangbangToken = await login("bangbang");
  sanleiToken = await login("sanlei");
  financeToken = await login("finance");
  bangbangFinanceToken = await login("bangbang-finance");
  pool = createDb().pool;
});

after(async () => {
  if (!hasDb) return;
  try {
    if (state.finance.invoices.length) {
      const placeholders = state.finance.invoices.map(() => "?").join(",");
      await pool.query(`DELETE FROM invoices WHERE id IN (${placeholders})`, state.finance.invoices);
    }
    if (state.finance.freight.length) {
      const placeholders = state.finance.freight.map(() => "?").join(",");
      await pool.query(`DELETE FROM freight_charges WHERE id IN (${placeholders})`, state.finance.freight);
    }
    if (state.finance.adjustments.length) {
      const placeholders = state.finance.adjustments.map(() => "?").join(",");
      await pool.query(`DELETE FROM financial_adjustments WHERE id IN (${placeholders})`, state.finance.adjustments);
    }
    if (state.orders.length) {
      const placeholders = state.orders.map(() => "?").join(",");
      await pool.query(
        `DELETE r FROM reservations r JOIN order_items oi ON oi.id = r.order_item_id WHERE oi.order_id IN (${placeholders})`,
        state.orders
      );
      await pool.query(`DELETE FROM order_items WHERE order_id IN (${placeholders})`, state.orders);
      await pool.query(`DELETE FROM payments WHERE order_id IN (${placeholders})`, state.orders);
      await pool.query(`DELETE FROM orders WHERE id IN (${placeholders})`, state.orders);
    }
    if (state.groups.length) {
      const placeholders = state.groups.map(() => "?").join(",");
      await pool.query(`DELETE FROM order_groups WHERE id IN (${placeholders})`, state.groups);
    }
    if (state.customers.length) {
      const placeholders = state.customers.map(() => "?").join(",");
      await pool.query(`DELETE FROM notifications WHERE user_id IN (SELECT id FROM users WHERE customer_id IN (${placeholders}))`, state.customers);
      await pool.query(`DELETE FROM sessions WHERE user_id IN (SELECT id FROM users WHERE customer_id IN (${placeholders}))`, state.customers);
      await pool.query(`DELETE FROM customer_prices WHERE customer_id IN (${placeholders})`, state.customers);
      await pool.query(`DELETE FROM customer_vehicle_authorizations WHERE customer_id IN (${placeholders})`, state.customers);
      await pool.query(`DELETE FROM users WHERE customer_id IN (${placeholders})`, state.customers);
      await pool.query(`DELETE FROM customers WHERE id IN (${placeholders})`, state.customers);
    }
    if (state.products.length) {
      const placeholders = state.products.map(() => "?").join(",");
      await pool.query(
        `DELETE m FROM inventory_movements m JOIN inventory i ON i.id = m.inventory_id WHERE i.product_id IN (${placeholders})`,
        state.products
      );
      await pool.query(`DELETE FROM inventory WHERE product_id IN (${placeholders})`, state.products);
      await pool.query(`DELETE FROM price_rules WHERE product_id IN (${placeholders})`, state.products);
      await pool.query(`DELETE FROM products WHERE id IN (${placeholders})`, state.products);
    }
  } finally {
    await closeDb(pool);
    await app.close();
  }
});

function skipUnlessDb() {
  return { skip: hasDb ? false : "未配置 DATABASE_URL" };
}

test("财务：发票、运费、调整款与结算", skipUnlessDb(), async () => {
  const phone = `139${String(stamp).slice(-8)}`;
  const fixture = await createCustomer("A", phone);
  const productId = await createProduct("A");
  const orderId = await createOrder(fixture.token, productId, 2);

  const finance = await call("GET", "/api/admin/finance", financeToken);
  assert.equal(finance.statusCode, 200);
  assert.ok(Array.isArray(finance.json().data.invoices));

  const invoice = await call("POST", "/api/admin/finance/invoices", financeToken, {
    orderId,
    title: "测试开票公司",
    taxNumber: "91310000TEST",
    amount: 200,
    taxRate: 13
  });
  assert.equal(invoice.statusCode, 201, invoice.body);
  state.finance.invoices.push(invoice.json().data.id);
  assert.equal(invoice.json().data.status, "PENDING");
  const issued = await call("POST", `/api/admin/finance/invoices/${invoice.json().data.id}/status`, financeToken, {
    status: "ISSUED"
  });
  assert.equal(issued.statusCode, 200);
  assert.equal(issued.json().data.status, "ISSUED");
  assert.ok(issued.json().data.issuedAt);

  const freight = await call("POST", "/api/admin/finance/freight", financeToken, {
    orderId,
    amount: 66,
    payer: "CUSTOMER",
    description: "测试运费"
  });
  assert.equal(freight.statusCode, 201, freight.body);
  state.finance.freight.push(freight.json().data.id);
  const settled = await call("POST", `/api/admin/finance/freight/${freight.json().data.id}/settle`, financeToken, {});
  assert.equal(settled.statusCode, 200);
  assert.equal(settled.json().data.freight.find((item) => item.id === freight.json().data.id).status, "SETTLED");

  const adjustment = await call("POST", "/api/admin/finance/adjustments", financeToken, {
    customerId: fixture.customerId,
    orderId,
    type: "CLAIM",
    amount: -30,
    description: "测试调整"
  });
  assert.equal(adjustment.statusCode, 201, adjustment.body);
  state.finance.adjustments.push(adjustment.json().data.id);
  const adjustmentSettled = await call(
    "POST",
    `/api/admin/finance/adjustment/${adjustment.json().data.id}/settle`,
    financeToken,
    {}
  );
  assert.equal(adjustmentSettled.statusCode, 200);

  const zero = await call("POST", "/api/admin/finance/adjustments", financeToken, {
    customerId: fixture.customerId,
    type: "OTHER",
    amount: 0
  });
  assert.equal(zero.statusCode, 400);

  const denied = await call("POST", "/api/admin/finance/invoices", bangbangFinanceToken, { orderId, title: "x" });
  assert.equal(denied.statusCode, 403);
  const salesDenied = await call("GET", "/api/admin/finance", sanleiToken);
  assert.equal(salesDenied.statusCode, 403);
});

test("缺货公平分配：预览、边界与确认", skipUnlessDb(), async () => {
  const phoneA = `139${String(stamp + 1).slice(-8)}`;
  const phoneB = `139${String(stamp + 2).slice(-8)}`;
  const customerA = await createCustomer("B", phoneA);
  const customerB = await createCustomer("C", phoneB);
  const productId = await createProduct("B", 4);

  await call("PUT", `/api/admin/customers/${customerB.customerId}/authorizations`, adminToken, { vehicles: ["传祺M8"] });
  const orderA = await createOrder(customerA.token, productId, 2);
  const orderB = await createOrder(customerB.token, productId, 2);
  for (const orderId of [orderA, orderB]) {
    const confirmed = await call("POST", `/api/admin/orders/${orderId}/actions`, bangbangToken, {
      action: "BANGBANG_CONFIRM"
    });
    assert.equal(confirmed.statusCode, 200, confirmed.body);
  }

  const list = await call("GET", "/api/admin/shortages", adminToken);
  assert.equal(list.statusCode, 200);
  const item = list.json().data.find((row) => row.productId === productId);
  assert.ok(item, "缺货列表包含测试产品");
  assert.equal(item.pendingDemand, 4);
  assert.equal(item.available, 0);

  const preview = await call("GET", `/api/admin/shortages/${productId}/preview`, adminToken);
  assert.equal(preview.statusCode, 200, preview.body);
  assert.equal(preview.json().data.physicalStock, 4);
  assert.equal(preview.json().data.candidates.length, 2);
  const suggestedTotal = preview.json().data.candidates.reduce((sum, row) => sum + row.suggestedQuantity, 0);
  assert.ok(suggestedTotal <= 4);
  assert.equal(suggestedTotal % 2, 0);

  const applied = await call("POST", `/api/admin/shortages/${productId}/apply`, adminToken, {
    targets: preview.json().data.candidates.map((row) => ({
      orderItemId: row.orderItemId,
      quantity: row.suggestedQuantity
    }))
  });
  assert.equal(applied.statusCode, 200, applied.body);

  const badTarget = await call("POST", `/api/admin/shortages/${productId}/apply`, adminToken, {
    targets: [{ orderItemId: "missing-item", quantity: 2 }]
  });
  assert.equal(badTarget.statusCode, 400);
  assert.equal(badTarget.json().error.code, "ALLOCATION_ITEM_NOT_FOUND");

  const shortageDenied = await call("GET", "/api/admin/shortages", financeToken);
  assert.equal(shortageDenied.statusCode, 403);
});
