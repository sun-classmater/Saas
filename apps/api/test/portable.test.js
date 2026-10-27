import test from "node:test";
import assert from "node:assert/strict";
import { getTemplate, getXlsxTemplate, parseCsv, toCsv } from "../src/lib/csv.js";
import { readWorkbookRows, writeWorkbookRows } from "../src/lib/xlsx.js";
import { assertRealWechatConfigured, isWechatMock } from "../src/lib/wechat.js";

test("CSV 解析支持 BOM、CRLF、引号与转义", () => {
  const csv = "\uFEFF客户编码,客户名称,地址\r\nCUS-1,\"测试,客户\",\"路1号\"\r\nCUS-2,普通,\"含\"\"引号\"\"\"\r\n";
  const rows = parseCsv(csv);
  assert.equal(rows.length, 2);
  assert.equal(rows[0]["客户名称"], "测试,客户");
  assert.equal(rows[1]["地址"], '含"引号"');
});

test("CSV 序列化带 BOM 且正确转义", () => {
  const csv = toCsv(["a", "b"], [["1", 'x,y'], ['"', "z"]]);
  assert.ok(csv.startsWith("\uFEFF"));
  assert.ok(csv.includes('"x,y"'));
  assert.ok(csv.includes('""""'));
});

test("导入模板包含标准表头", () => {
  assert.ok(getTemplate("customers").includes("客户编码"));
  assert.ok(getTemplate("products").includes("物料号"));
  assert.ok(getTemplate("inventory").includes("仓库名称"));
  assert.throws(() => getTemplate("unknown"), (error) => error.code === "TEMPLATE_NOT_FOUND");
});

test("XLSX 模板可写出并读回", () => {
  const buffer = getXlsxTemplate("customers");
  assert.equal(buffer.subarray(0, 2).toString(), "PK");
  const rows = readWorkbookRows(buffer);
  assert.equal(rows.length, 0);
});

test("XLSX 写入读取往返", () => {
  const buffer = writeWorkbookRows(
    ["物料号", "品名", "基础价"],
    [["SL-001", "转向球头", "128.5"], ["SL-002", "摆臂", "460"]]
  );
  const rows = readWorkbookRows(buffer);
  assert.equal(rows.length, 2);
  assert.equal(rows[0]["物料号"], "SL-001");
  assert.equal(String(rows[1]["基础价"]), "460");
});

test("微信 mock 模式判断与真实模式缺配置报错", () => {
  const previous = process.env.WECHAT_MODE;
  process.env.WECHAT_MODE = "mock";
  assert.equal(isWechatMock(), true);
  process.env.WECHAT_MODE = "real";
  assert.equal(isWechatMock(), false);

  const keys = [
    "WECHAT_APP_ID", "WECHAT_APP_SECRET", "WECHAT_MCH_ID", "WECHAT_API_V3_KEY",
    "WECHAT_CERT_SERIAL", "WECHAT_PRIVATE_KEY_PATH", "WECHAT_NOTIFY_URL", "WECHAT_PLATFORM_CERT_PATH"
  ];
  const saved = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  for (const key of keys) delete process.env[key];
  assert.throws(() => assertRealWechatConfigured(), (error) => error.status === 503 && error.code === "WECHAT_NOT_CONFIGURED");
  for (const [key, value] of Object.entries(saved)) {
    if (value !== undefined) process.env[key] = value;
  }
  process.env.WECHAT_MODE = previous ?? "mock";
});
