import test from "node:test";
import assert from "node:assert/strict";
import {
  asBoolean,
  cleanText,
  hashPassword,
  HttpError,
  money,
  nowIso,
  parsePositiveInteger,
  parsePositiveNumber,
  requireText,
  serialNumber,
  settlementWeek,
  shanghaiDate,
  verifyPassword
} from "../src/lib/core.js";
import {
  enforceLoginRateLimit,
  loginLimitKey,
  recordLoginFailure,
  resetLoginFailures
} from "../src/lib/login-rate-limit.js";

test("money 保留两位小数并处理浮点误差", () => {
  assert.equal(money(115.2 * 10), 1152);
  assert.equal(money(0.1 + 0.2), 0.3);
  assert.equal(money("99.999"), 100);
  assert.equal(money(null), 0);
});

test("cleanText/requireText 与旧实现一致", () => {
  assert.equal(cleanText("   abc  "), "abc");
  assert.equal(cleanText(null), "");
  assert.equal(cleanText("abcdef", 3), "abc");
  assert.throws(() => requireText("   ", "客户名称"), (error) => {
    assert.ok(error instanceof HttpError);
    assert.equal(error.status, 400);
    assert.equal(error.code, "VALIDATION_ERROR");
    return true;
  });
});

test("正数/正整数校验", () => {
  assert.equal(parsePositiveNumber("12.5", "金额"), 12.5);
  assert.throws(() => parsePositiveNumber(0, "金额"), /必须大于0/);
  assert.equal(parsePositiveInteger("10", "数量"), 10);
  assert.throws(() => parsePositiveInteger(1.5, "数量"), /必须为正整数/);
});

test("asBoolean 处理数据库 0/1", () => {
  assert.equal(asBoolean(1), true);
  assert.equal(asBoolean(0), false);
  assert.equal(asBoolean("1"), true);
});

test("上海时区日期与结算周计算", () => {
  const date = new Date("2026-10-24T02:00:00.000Z");
  assert.equal(shanghaiDate(date), "2026-10-24");
  assert.equal(settlementWeek(date), "2026-10-19");
  const monday = new Date("2026-10-19T02:00:00.000Z");
  assert.equal(settlementWeek(monday), "2026-10-19");
});

test("业务单号格式与时间戳", () => {
  const value = serialNumber("OD");
  assert.match(value, /^OD-\d{12}-\d{4}$/);
  assert.match(nowIso(), /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
});

test("密码 scrypt 哈希与校验", () => {
  const stored = hashPassword("Admin@123");
  assert.match(stored, /^[a-f0-9]{32}:[a-f0-9]{128}$/);
  assert.equal(verifyPassword("Admin@123", stored), true);
  assert.equal(verifyPassword("wrong", stored), false);
  assert.equal(verifyPassword("Admin@123", null), false);
});

test("登录失败 8 次触发限流，重置后恢复", () => {
  const key = `test-${Date.now()}|admin`;
  enforceLoginRateLimit(key);
  for (let index = 0; index < 8; index += 1) recordLoginFailure(key);
  assert.throws(() => enforceLoginRateLimit(key), (error) => {
    assert.equal(error.status, 429);
    assert.equal(error.code, "LOGIN_RATE_LIMITED");
    return true;
  });
  resetLoginFailures(key);
  enforceLoginRateLimit(key);
});

test("限流键按 IP + 用户名区分", () => {
  assert.notEqual(loginLimitKey({ ip: "1.1.1.1" }, "admin"), loginLimitKey({ ip: "1.1.1.1" }, "bangbang"));
  assert.notEqual(loginLimitKey({ ip: "1.1.1.1" }, "admin"), loginLimitKey({ ip: "2.2.2.2" }, "admin"));
});
