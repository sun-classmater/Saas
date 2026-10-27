import test from "node:test";
import assert from "node:assert/strict";
import { buildApp } from "../src/server.js";

const hasDb = Boolean(process.env.DATABASE_URL);
const adminPassword = process.env.TEST_ADMIN_PASSWORD || "Admin@123";

let app;
if (hasDb) {
  app = await buildApp({ logger: false });
}
test.after(async () => {
  if (app) await app.close();
});

function skipUnlessDb() {
  return { skip: hasDb ? false : "未配置 DATABASE_URL，跳过 MySQL 集成测试" };
}

test("健康检查连接真实 MySQL", skipUnlessDb(), async () => {
  const response = await app.inject({ method: "GET", url: "/api/health/db" });
  assert.equal(response.statusCode, 200);
  assert.equal(response.json().data.ok, true);
});

test("管理员登录、/api/me、通知列表", skipUnlessDb(), async () => {
  const login = await app.inject({
    method: "POST",
    url: "/api/auth/login",
    payload: { username: "admin", password: adminPassword }
  });
  assert.equal(login.statusCode, 200, login.body);
  const token = login.json().data.token;
  assert.ok(token);

  const me = await app.inject({
    method: "GET",
    url: "/api/me",
    headers: { authorization: `Bearer ${token}` }
  });
  assert.equal(me.statusCode, 200);
  assert.equal(me.json().data.user.role, "SUPER_ADMIN");

  const notifications = await app.inject({
    method: "GET",
    url: "/api/notifications",
    headers: { authorization: `Bearer ${token}` }
  });
  assert.equal(notifications.statusCode, 200);
  assert.ok(Array.isArray(notifications.json().data));
});

test("客户手机号登录与客户资料", skipUnlessDb(), async () => {
  const login = await app.inject({
    method: "POST",
    url: "/api/auth/dev-login",
    payload: { phone: "13800000001" }
  });
  assert.equal(login.statusCode, 200, login.body);
  const token = login.json().data.token;
  const me = await app.inject({
    method: "GET",
    url: "/api/me",
    headers: { authorization: `Bearer ${token}` }
  });
  assert.equal(me.statusCode, 200);
  assert.ok(me.json().data.customer);
  assert.ok("creditLimit" in me.json().data.customer);
});

test("无 Token 访问受保护接口返回 401", skipUnlessDb(), async () => {
  const response = await app.inject({ method: "GET", url: "/api/me" });
  assert.equal(response.statusCode, 401);
  assert.equal(response.json().error.code, "UNAUTHORIZED");
});

test("注销后 Token 失效", skipUnlessDb(), async () => {
  const login = await app.inject({
    method: "POST",
    url: "/api/auth/login",
    payload: { username: "admin", password: adminPassword }
  });
  const token = login.json().data.token;
  const logout = await app.inject({
    method: "POST",
    url: "/api/auth/logout",
    headers: { authorization: `Bearer ${token}` },
    payload: {}
  });
  assert.equal(logout.statusCode, 200);
  const me = await app.inject({
    method: "GET",
    url: "/api/me",
    headers: { authorization: `Bearer ${token}` }
  });
  assert.equal(me.statusCode, 401);
});
