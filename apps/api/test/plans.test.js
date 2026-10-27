import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { buildApp } from "../src/server.js";
import { createDb, closeDb } from "@saas/db";

const hasDb = Boolean(process.env.DATABASE_URL);
const stamp = Date.now();
const state = { customerId: null, productId: null, userId: null, planId: null, orderIds: [], groupIds: [], caseIds: [] };

let app;
let adminToken;
let bangbangToken;
let sanleiToken;
let serviceToken;
let customerToken;
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

before(async () => {
  if (!hasDb) return;
  app = await buildApp({ logger: false });
  adminToken = await login("admin");
  bangbangToken = await login("bangbang");
  sanleiToken = await login("sanlei");
  serviceToken = await login("service");
  pool = createDb().pool;

  const phone = `139${String(stamp).slice(-8)}`;
  const customer = await call("POST", "/api/admin/customers", adminToken, {
    code: `QA-PLAN-${stamp}`,
    name: "计划测试客户",
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
  assert.equal(customer.statusCode, 201, customer.body);
  state.customerId = customer.json().data.id;

  const product = await call("POST", "/api/admin/products", adminToken, {
    sku: `QA-PLANP-${stamp}`,
    name: "计划测试产品",
    category: "摆臂",
    vehicleModel: "传祺M8",
    minPackage: 2,
    basePrice: 200,
    warrantyMonths: 12,
    warrantyKm: 60000
  });
  assert.equal(product.statusCode, 201, product.body);
  state.productId = product.json().data.id;

  await call("PUT", "/api/admin/prices", adminToken, { productId: state.productId, tier: "VIP", price: 200 });
  await call("PUT", `/api/admin/customers/${state.customerId}/authorizations`, adminToken, { vehicles: ["传祺M8"] });
  await pool.query(
    `INSERT INTO inventory (id, product_id, warehouse_name, source_type, supplier_id, quantity, reserved, updated_at)
     VALUES (?, ?, '计划测试仓', 'REAL', NULL, 100, 0, ?)`,
    [`inv_plan_${stamp}`, state.productId, new Date().toISOString()]
  );
  state.userId = `user_plan_${stamp}`;
  await pool.query(
    `INSERT INTO users (id, username, password_hash, display_name, phone, wechat_openid, role, customer_id, active, created_at)
     VALUES (?, ?, NULL, '计划采购员', ?, NULL, 'CUSTOMER_BUYER', ?, 1, ?)`,
    [state.userId, phone, phone, state.customerId, new Date().toISOString()]
  );
  const loginResponse = await call("POST", "/api/auth/dev-login", null, { phone });
  assert.equal(loginResponse.statusCode, 200, loginResponse.body);
  customerToken = loginResponse.json().data.token;
});

after(async () => {
  if (!hasDb) return;
  try {
    if (state.caseIds.length) {
      const placeholders = state.caseIds.map(() => "?").join(",");
      await pool.query(`DELETE FROM after_sales_cases WHERE id IN (${placeholders})`, state.caseIds);
      await pool.query(`DELETE FROM audit_logs WHERE entity_id IN (${placeholders})`, state.caseIds);
    }
    if (state.orderIds.length) {
      const placeholders = state.orderIds.map(() => "?").join(",");
      await pool.query(
        `DELETE si FROM shipment_items si JOIN shipments s ON s.id = si.shipment_id WHERE s.order_id IN (${placeholders})`,
        state.orderIds
      );
      await pool.query(`DELETE FROM shipments WHERE order_id IN (${placeholders})`, state.orderIds);
      await pool.query(
        `DELETE r FROM reservations r JOIN order_items oi ON oi.id = r.order_item_id WHERE oi.order_id IN (${placeholders})`,
        state.orderIds
      );
      await pool.query(`DELETE FROM payments WHERE order_id IN (${placeholders})`, state.orderIds);
      await pool.query(`DELETE FROM order_items WHERE order_id IN (${placeholders})`, state.orderIds);
      await pool.query(`DELETE FROM orders WHERE id IN (${placeholders})`, state.orderIds);
      await pool.query(`DELETE FROM audit_logs WHERE entity_id IN (${placeholders})`, state.orderIds);
    }
    if (state.planId) {
      await pool.query("DELETE FROM plan_items WHERE plan_id = ?", [state.planId]);
      await pool.query("DELETE FROM plans WHERE id = ?", [state.planId]);
      await pool.query("DELETE FROM audit_logs WHERE entity_id = ?", [state.planId]);
    }
    if (state.groupIds.length) {
      const placeholders = state.groupIds.map(() => "?").join(",");
      await pool.query(`DELETE FROM order_groups WHERE id IN (${placeholders})`, state.groupIds);
    }
    if (state.customerId) {
      await pool.query("DELETE FROM notifications WHERE user_id = ?", [state.userId]);
      await pool.query("DELETE FROM sessions WHERE user_id = ?", [state.userId]);
      await pool.query("DELETE FROM customer_prices WHERE customer_id = ?", [state.customerId]);
      await pool.query("DELETE FROM customer_vehicle_authorizations WHERE customer_id = ?", [state.customerId]);
      await pool.query("DELETE FROM users WHERE customer_id = ?", [state.customerId]);
      await pool.query("DELETE FROM audit_logs WHERE entity_id = ?", [state.customerId]);
      await pool.query("DELETE FROM customers WHERE id = ?", [state.customerId]);
    }
    if (state.productId) {
      await pool.query(
        "DELETE m FROM inventory_movements m JOIN inventory i ON i.id = m.inventory_id WHERE i.product_id = ?",
        [state.productId]
      );
      await pool.query("DELETE FROM inventory WHERE product_id = ?", [state.productId]);
      await pool.query("DELETE FROM price_rules WHERE product_id = ?", [state.productId]);
      await pool.query("DELETE FROM audit_logs WHERE entity_id = ?", [state.productId]);
      await pool.query("DELETE FROM products WHERE id = ?", [state.productId]);
    }
  } finally {
    await closeDb(pool);
    await app.close();
  }
});

function skipUnlessDb() {
  return { skip: hasDb ? false : "未配置 DATABASE_URL" };
}

async function planAction(planId, action, token, note) {
  return call("POST", `/api/mobile/plans/${planId}/actions`, token, { action, note });
}

test("采购计划：草稿→修改→提交→撤回→两级审核", skipUnlessDb(), async () => {
  const created = await call("POST", "/api/mobile/plans", customerToken, {
    planMonth: "2030-01",
    note: "计划测试",
    items: [{ weekNo: 1, productId: state.productId, quantity: 4 }]
  });
  assert.equal(created.statusCode, 201, created.body);
  state.planId = created.json().data.id;
  assert.equal(created.json().data.status, "DRAFT");
  assert.equal(created.json().data.totalQuantity, 4);

  const updated = await call("PUT", `/api/mobile/plans/${state.planId}`, customerToken, {
    planMonth: "2030-01",
    items: [{ weekNo: 1, productId: state.productId, quantity: 6 }]
  });
  assert.equal(updated.statusCode, 200, updated.body);
  assert.equal(updated.json().data.totalQuantity, 6);

  const submitted = await planAction(state.planId, "SUBMIT", customerToken);
  assert.equal(submitted.statusCode, 200);
  assert.equal(submitted.json().data.status, "BANGBANG_REVIEW");

  const withdrawn = await planAction(state.planId, "WITHDRAW", customerToken);
  assert.equal(withdrawn.statusCode, 200);
  assert.equal(withdrawn.json().data.status, "DRAFT");

  await planAction(state.planId, "SUBMIT", customerToken);
  const rejected = await call("POST", `/api/admin/plans/${state.planId}/actions`, bangbangToken, {
    action: "BANGBANG_REJECT",
    note: "请补充"
  });
  assert.equal(rejected.statusCode, 200);
  assert.equal(rejected.json().data.status, "REJECTED");

  const reEdited = await call("PUT", `/api/mobile/plans/${state.planId}`, customerToken, {
    items: [{ weekNo: 1, productId: state.productId, quantity: 6 }]
  });
  assert.equal(reEdited.statusCode, 200);
  assert.equal(reEdited.json().data.status, "DRAFT");

  await planAction(state.planId, "SUBMIT", customerToken);
  const bangbangApproved = await call("POST", `/api/admin/plans/${state.planId}/actions`, bangbangToken, {
    action: "BANGBANG_APPROVE"
  });
  assert.equal(bangbangApproved.statusCode, 200);
  assert.equal(bangbangApproved.json().data.status, "SANLEI_REVIEW");
  const approved = await call("POST", `/api/admin/plans/${state.planId}/actions`, sanleiToken, {
    action: "SANLEI_APPROVE"
  });
  assert.equal(approved.statusCode, 200);
  assert.equal(approved.json().data.status, "APPROVED");

  const list = await call("GET", "/api/mobile/plans?status=APPROVED", customerToken);
  assert.equal(list.statusCode, 200);
  assert.ok(list.json().data.some((plan) => plan.id === state.planId));
});

test("计划订单限量与超量拦截", skipUnlessDb(), async () => {
  const created = await call("POST", "/api/mobile/orders", customerToken, {
    orderType: "PLAN",
    planId: state.planId,
    planWeek: 1,
    items: [{ productId: state.productId, quantity: 4 }]
  });
  assert.equal(created.statusCode, 201, created.body);
  state.orderIds.push(...created.json().data.orderIds);
  state.groupIds.push(created.json().data.groupId);

  const exceeded = await call("POST", "/api/mobile/orders", customerToken, {
    orderType: "PLAN",
    planId: state.planId,
    planWeek: 1,
    items: [{ productId: state.productId, quantity: 4 }]
  });
  assert.equal(exceeded.statusCode, 400);
  assert.equal(exceeded.json().error.code, "PLAN_QUANTITY_EXCEEDED");

  const missingPlan = await call("POST", "/api/mobile/orders", customerToken, {
    orderType: "PLAN",
    items: [{ productId: state.productId, quantity: 2 }]
  });
  assert.equal(missingPlan.statusCode, 400);
});

test("经营概览与计划执行报表", skipUnlessDb(), async () => {
  const dashboard = await call("GET", "/api/admin/dashboard", adminToken);
  assert.equal(dashboard.statusCode, 200, dashboard.body);
  const metrics = dashboard.json().data.metrics;
  assert.equal(typeof metrics.pendingPlan, "number");
  assert.equal(typeof metrics.monthAmount, "number");
  assert.ok(Array.isArray(dashboard.json().data.lowStock));
  assert.ok(Array.isArray(dashboard.json().data.recentOrders));

  const report = await call("GET", "/api/admin/reports/plan-execution", adminToken);
  assert.equal(report.statusCode, 200);
  const row = report.json().data.find((item) => item.planMonth === "2030-01");
  assert.ok(row, "报表包含测试计划");
  assert.equal(row.plannedQuantity, 6);
  assert.equal(row.orderedQuantity, 4);
  assert.equal(row.executionRate, 66.67);
});

test("售后：客户申请、售后处理、客户可见", skipUnlessDb(), async () => {
  const orderId = state.orderIds[0];
  const created = await call("POST", "/api/mobile/after-sales", customerToken, {
    orderId,
    type: "CLAIM",
    description: "集成测试：产品异响需要更换",
    claimAmount: 88
  });
  assert.equal(created.statusCode, 201, created.body);
  state.caseIds.push(created.json().data.id);
  assert.equal(created.json().data.status, "OPEN");

  const list = await call("GET", "/api/mobile/after-sales", customerToken);
  assert.equal(list.statusCode, 200);
  assert.ok(list.json().data.some((item) => item.id === created.json().data.id));

  const reviewing = await call("PUT", `/api/admin/after-sales/${created.json().data.id}`, serviceToken, {
    status: "REVIEWING",
    resolution: "已安排检测"
  });
  assert.equal(reviewing.statusCode, 200, reviewing.body);
  assert.equal(reviewing.json().data.status, "REVIEWING");

  const closed = await call("PUT", `/api/admin/after-sales/${created.json().data.id}`, serviceToken, {
    status: "CLOSED",
    resolution: "已赔付"
  });
  assert.equal(closed.statusCode, 200);
  assert.equal(closed.json().data.status, "CLOSED");

  const invalidStatus = await call("PUT", `/api/admin/after-sales/${created.json().data.id}`, serviceToken, {
    status: "UNKNOWN"
  });
  assert.equal(invalidStatus.statusCode, 400);
  const invalidType = await call("POST", "/api/mobile/after-sales", customerToken, {
    orderId,
    type: "UNKNOWN",
    description: "类型非法"
  });
  assert.equal(invalidType.statusCode, 400);
});
