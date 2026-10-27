import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { buildApp } from "../src/server.js";
import { createDb, closeDb } from "@saas/db";

const hasDb = Boolean(process.env.DATABASE_URL);
const stamp = Date.now();
const state = { customerId: null, userIds: [] };

let app;
let adminToken;
let sanleiToken;
let pool;

async function login(username, password = "Admin@123") {
  return app.inject({ method: "POST", url: "/api/auth/login", payload: { username, password } });
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
  const admin = await login("admin");
  adminToken = admin.json().data.token;
  const sanlei = await login("sanlei");
  sanleiToken = sanlei.json().data.token;
  pool = createDb().pool;

  const customer = await call("POST", "/api/admin/customers", adminToken, {
    code: `QA-USER-${stamp}`,
    name: "账号测试客户",
    province: "上海市",
    city: "上海市",
    channelType: "WHOLESALER",
    grade: "A",
    priceTier: "VIP",
    settlementMethod: "CREDIT",
    paymentTermsDays: 30,
    creditLimit: 10000,
    prepayRatio: 1,
    batchLimit: 3,
    phone: `139${String(stamp).slice(-8)}`
  });
  assert.equal(customer.statusCode, 201, customer.body);
  state.customerId = customer.json().data.id;
});

after(async () => {
  if (!hasDb) return;
  try {
    if (state.userIds.length) {
      const placeholders = state.userIds.map(() => "?").join(",");
      await pool.query(`DELETE FROM sessions WHERE user_id IN (${placeholders})`, state.userIds);
      await pool.query(`DELETE FROM audit_logs WHERE entity_id IN (${placeholders})`, state.userIds);
      await pool.query(`DELETE FROM users WHERE id IN (${placeholders})`, state.userIds);
    }
    if (state.customerId) {
      await pool.query("DELETE FROM customer_vehicle_authorizations WHERE customer_id = ?", [state.customerId]);
      await pool.query("DELETE FROM audit_logs WHERE entity_id = ?", [state.customerId]);
      await pool.query("DELETE FROM customers WHERE id = ?", [state.customerId]);
    }
  } finally {
    await closeDb(pool);
    await app.close();
  }
});

function skipUnlessDb() {
  return { skip: hasDb ? false : "未配置 DATABASE_URL" };
}

test("账号列表、客户子账号与手机号登录", skipUnlessDb(), async () => {
  const users = await call("GET", "/api/admin/users", adminToken);
  assert.equal(users.statusCode, 200);
  assert.ok(users.json().data.length >= 10);

  const phone = `139${String(stamp + 9).slice(-8)}`;
  const created = await call("POST", "/api/admin/users/customer", adminToken, {
    customerId: state.customerId,
    phone,
    displayName: "账号测试采购员"
  });
  assert.equal(created.statusCode, 201, created.body);
  state.userIds.push(created.json().data.id);
  assert.equal(created.json().data.role, "CUSTOMER_BUYER");
  assert.equal(created.json().data.active, true);

  const devLogin = await call("POST", "/api/auth/dev-login", null, { phone });
  assert.equal(devLogin.statusCode, 200);
  const me = await call("GET", "/api/me", devLogin.json().data.token);
  assert.equal(me.statusCode, 200);

  const duplicate = await call("POST", "/api/admin/users/customer", adminToken, {
    customerId: state.customerId,
    phone
  });
  assert.equal(duplicate.statusCode, 409);

  const denied = await call("GET", "/api/admin/users", sanleiToken);
  assert.equal(denied.statusCode, 403);
});

test("内部账号创建、停用与登录失效", skipUnlessDb(), async () => {
  const username = `qa-staff-${stamp}`;
  const created = await call("POST", "/api/admin/users/staff", adminToken, {
    username,
    displayName: "测试员工",
    role: "SANLEI_SALES",
    password: "TestPass@123",
    phone: `139${String(stamp + 8).slice(-8)}`
  });
  assert.equal(created.statusCode, 201, created.body);
  state.userIds.push(created.json().data.id);

  const staffLogin = await login(username, "TestPass@123");
  assert.equal(staffLogin.statusCode, 200);

  const disabled = await call("POST", `/api/admin/users/${created.json().data.id}/toggle`, adminToken, {
    active: false
  });
  assert.equal(disabled.statusCode, 200);
  assert.equal(disabled.json().data.active, false);

  const afterDisable = await login(username, "TestPass@123");
  assert.equal(afterDisable.statusCode, 401);

  const weak = await call("POST", "/api/admin/users/staff", adminToken, {
    username: `qa-weak-${stamp}`,
    displayName: "弱密码",
    role: "SANLEI_SALES",
    password: "123"
  });
  assert.equal(weak.statusCode, 400);
  assert.equal(weak.json().error.code, "WEAK_PASSWORD");

  const [adminRow] = await pool.query("SELECT id FROM users WHERE role = 'SUPER_ADMIN' LIMIT 1");
  const disableAdmin = await call("POST", `/api/admin/users/${adminRow[0].id}/toggle`, adminToken, { active: false });
  assert.equal(disableAdmin.statusCode, 409);
  assert.equal(disableAdmin.json().error.code, "CANNOT_DISABLE_ADMIN");

  const denied = await call("POST", "/api/admin/users/staff", sanleiToken, {
    username: "x",
    displayName: "x",
    role: "SANLEI_SALES",
    password: "TestPass@123"
  });
  assert.equal(denied.statusCode, 403);
});

test("审计日志可查询且仅管理员可见", skipUnlessDb(), async () => {
  const logs = await call("GET", "/api/admin/audit-logs", adminToken);
  assert.equal(logs.statusCode, 200);
  assert.ok(logs.json().data.length > 0);
  assert.ok(logs.json().data.some((item) => item.action === "CREATE_CUSTOMER"));

  const denied = await call("GET", "/api/admin/audit-logs", sanleiToken);
  assert.equal(denied.statusCode, 403);
});
