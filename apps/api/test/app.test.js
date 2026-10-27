import test from "node:test";
import assert from "node:assert/strict";
import { buildApp } from "../src/server.js";

process.env.WECHAT_MODE = "mock";

const app = await buildApp({
  logger: false,
  db: { marker: "fake" },
  dbPing: async () => true
});
test.after(async () => {
  await app.close();
});

test("GET /api/health 返回契约结构", async () => {
  const response = await app.inject({ method: "GET", url: "/api/health" });
  assert.equal(response.statusCode, 200);
  const body = response.json();
  assert.equal(body.data.status, "ok");
  assert.equal(body.data.database, "mysql");
  assert.equal(body.data.wechatMode, "mock");
});

test("GET /api/health/db 探活成功", async () => {
  const response = await app.inject({ method: "GET", url: "/api/health/db" });
  assert.equal(response.statusCode, 200);
  assert.equal(response.json().data.ok, true);
});

test("未知接口返回 404 且统一错误结构", async () => {
  const response = await app.inject({ method: "GET", url: "/api/not-exist" });
  assert.equal(response.statusCode, 404);
  assert.equal(response.json().error.code, "NOT_FOUND");
});

test("非法 JSON 返回 400 INVALID_JSON", async () => {
  const response = await app.inject({
    method: "POST",
    url: "/api/auth/login",
    headers: { "content-type": "application/json" },
    payload: "{bad json"
  });
  assert.equal(response.statusCode, 400);
  assert.equal(response.json().error.code, "INVALID_JSON");
});

test("CORS 预检返回 204", async () => {
  const response = await app.inject({
    method: "OPTIONS",
    url: "/api/health",
    headers: { origin: "http://example.com", "access-control-request-method": "GET" }
  });
  assert.equal(response.statusCode, 204);
});

test("微信支付回调在 mock 模式返回未配置", async () => {
  const response = await app.inject({
    method: "POST",
    url: "/api/wechat/pay/notify",
    headers: { "content-type": "application/json" },
    payload: { resource: { ciphertext: "x", nonce: "y" } }
  });
  assert.equal(response.statusCode, 503);
  assert.equal(response.json().error.code, "WECHAT_NOT_CONFIGURED");
});
