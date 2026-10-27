import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { buildApp } from "../src/server.js";
import { createDb, closeDb } from "@saas/db";
import { writeWorkbookRows } from "../src/lib/xlsx.js";

const hasDb = Boolean(process.env.DATABASE_URL);
const stamp = Date.now();
const state = { customers: [], products: [], suppliers: [] };

let app;
let adminToken;
let pool;

async function call(method, url, token, payload, headers = {}) {
  return app.inject({
    method,
    url,
    headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...headers },
    payload
  });
}

before(async () => {
  if (!hasDb) return;
  app = await buildApp({ logger: false });
  const login = await call("POST", "/api/auth/login", null, { username: "admin", password: "Admin@123" });
  adminToken = login.json().data.token;
  pool = createDb().pool;
});

after(async () => {
  if (!hasDb) return;
  try {
    if (state.products.length) {
      const placeholders = state.products.map(() => "?").join(",");
      await pool.query(
        `DELETE m FROM inventory_movements m JOIN inventory i ON i.id = m.inventory_id WHERE i.product_id IN (${placeholders})`,
        state.products
      );
      await pool.query(`DELETE FROM inventory WHERE product_id IN (${placeholders})`, state.products);
      await pool.query(`DELETE FROM price_rules WHERE product_id IN (${placeholders})`, state.products);
      await pool.query(`DELETE FROM customer_prices WHERE product_id IN (${placeholders})`, state.products);
      await pool.query(`DELETE FROM products WHERE id IN (${placeholders})`, state.products);
    }
    if (state.customers.length) {
      const placeholders = state.customers.map(() => "?").join(",");
      await pool.query(`DELETE FROM customer_prices WHERE customer_id IN (${placeholders})`, state.customers);
      await pool.query(`DELETE FROM customer_vehicle_authorizations WHERE customer_id IN (${placeholders})`, state.customers);
      await pool.query(`DELETE FROM users WHERE customer_id IN (${placeholders})`, state.customers);
      await pool.query(`DELETE FROM customers WHERE id IN (${placeholders})`, state.customers);
    }
    if (state.suppliers.length) {
      const placeholders = state.suppliers.map(() => "?").join(",");
      await pool.query(`DELETE FROM suppliers WHERE id IN (${placeholders})`, state.suppliers);
    }
  } finally {
    await closeDb(pool);
    await app.close();
  }
});

function skipUnlessDb() {
  return { skip: hasDb ? false : "未配置 DATABASE_URL" };
}

test("导出：订单/库存/收款/计划 CSV 与 XLSX", skipUnlessDb(), async () => {
  for (const kind of ["orders", "inventory", "payments", "plans"]) {
    const csv = await call("GET", `/api/admin/exports/${kind}`, adminToken);
    assert.equal(csv.statusCode, 200, `${kind} csv`);
    assert.match(csv.headers["content-type"], /text\/csv/);
    assert.ok(csv.body.length > 10);
    const xlsx = await call("GET", `/api/admin/exports/${kind}/xlsx`, adminToken);
    assert.equal(xlsx.statusCode, 200, `${kind} xlsx`);
    assert.equal(xlsx.rawPayload.subarray(0, 2).toString(), "PK");
  }
  const missing = await call("GET", "/api/admin/exports/unknown", adminToken);
  assert.equal(missing.statusCode, 404);
  assert.equal(missing.json().error.code, "EXPORT_NOT_FOUND");
});

test("导入模板：CSV 与 XLSX", skipUnlessDb(), async () => {
  for (const kind of ["customers", "products", "prices", "inventory"]) {
    const csv = await call("GET", `/api/admin/import-templates/${kind}`, adminToken);
    assert.equal(csv.statusCode, 200);
    assert.ok(csv.body.includes(","));
    const xlsx = await call("GET", `/api/admin/import-templates/${kind}/xlsx`, adminToken);
    assert.equal(xlsx.statusCode, 200);
    assert.equal(xlsx.rawPayload.subarray(0, 2).toString(), "PK");
  }
});

test("CSV 导入客户/产品/价格/库存", skipUnlessDb(), async () => {
  const customerCode = `QA-IO-C-${stamp}`;
  const customers = await call(
    "POST",
    "/api/admin/imports/customers",
    adminToken,
    "客户编码,客户名称,省份,城市,渠道类型,客户等级,价格等级,结算方式,账期天数,授信额度,预付款比例,最多发货批次,手机号,地址\n" +
      `${customerCode},导入客户,浙江省,宁波市,CHAIN,B,STANDARD,CREDIT,15,5000,1,2,13911112222,导入路1号\n`,
    { "content-type": "text/csv; charset=utf-8" }
  );
  assert.equal(customers.statusCode, 200, customers.body);
  assert.equal(customers.json().data.imported, 1);
  const [customerRow] = await pool.query("SELECT id FROM customers WHERE code = ?", [customerCode]);
  assert.ok(customerRow[0]);
  state.customers.push(customerRow[0].id);

  const sku = `QA-IO-P-${stamp}`;
  const products = await call(
    "POST",
    "/api/admin/imports/products",
    adminToken,
    "物料号,品名,分类,车型,最小包装,基础价,质保月数,质保公里,说明\n" +
      `${sku},导入产品,摆臂,传祺M8,2,300,12,60000,CSV导入\n`,
    { "content-type": "text/csv; charset=utf-8" }
  );
  assert.equal(products.statusCode, 200, products.body);
  assert.equal(products.json().data.imported, 1);
  const [productRow] = await pool.query("SELECT id FROM products WHERE sku = ?", [sku]);
  assert.ok(productRow[0]);
  state.products.push(productRow[0].id);

  const prices = await call(
    "POST",
    "/api/admin/imports/prices",
    adminToken,
    "范围,价格等级或客户编码,物料号,价格\n" +
      `等级,GOLD,${sku},280\n`,
    { "content-type": "text/csv; charset=utf-8" }
  );
  assert.equal(prices.statusCode, 200, prices.body);

  const inventory = await call(
    "POST",
    "/api/admin/imports/inventory",
    adminToken,
    "物料号,仓库名称,库存类型,数量,供应商名称\n" +
      `${sku},导入测试仓,VIRTUAL,8,导入测试供应商${stamp}\n`,
    { "content-type": "text/csv; charset=utf-8" }
  );
  assert.equal(inventory.statusCode, 200, inventory.body);
  const [invRows] = await pool.query("SELECT quantity FROM inventory WHERE product_id = ?", [productRow[0].id]);
  assert.equal(Number(invRows[0].quantity), 8);
  const [supplierRows] = await pool.query("SELECT id FROM suppliers WHERE name = ?", [`导入测试供应商${stamp}`]);
  state.suppliers.push(supplierRows[0].id);
});

test("XLSX 导入产品与整批回滚", skipUnlessDb(), async () => {
  const sku = `QA-IO-X-${stamp}`;
  const buffer = writeWorkbookRows(
    ["物料号", "品名", "分类", "车型", "最小包装", "基础价", "质保月数", "质保公里", "说明"],
    [[sku, "Excel导入产品", "球头", "埃安Y", "2", "399", "12", "60000", "XLSX导入"]]
  );
  const result = await call("POST", "/api/admin/imports/products/xlsx", adminToken, {
    fileBase64: buffer.toString("base64")
  });
  assert.equal(result.statusCode, 200, result.body);
  assert.equal(result.json().data.imported, 1);
  const [row] = await pool.query("SELECT id FROM products WHERE sku = ?", [sku]);
  assert.ok(row[0]);
  state.products.push(row[0].id);

  const rollback = await call(
    "POST",
    "/api/admin/imports/customers",
    adminToken,
    "客户编码,客户名称,省份,城市,渠道类型,客户等级,价格等级,结算方式,账期天数,授信额度,预付款比例,最多发货批次,手机号,地址\n" +
      `QA-IO-R1-${stamp},回滚客户1,江苏省,南京市,WHOLESALER,A,VIP,CREDIT,30,1000,1,3,13922223333,回滚路1号\n` +
      `QA-IO-R2-${stamp},,江苏省,南京市,WHOLESALER,A,VIP,CREDIT,30,1000,1,3,13922223334,回滚路2号\n`,
    { "content-type": "text/csv; charset=utf-8" }
  );
  assert.equal(rollback.statusCode, 400);
  assert.equal(rollback.json().error.code, "IMPORT_VALIDATION_FAILED");
  const [rolled] = await pool.query("SELECT COUNT(*) AS count FROM customers WHERE code LIKE ?", [`QA-IO-R%-${stamp}`]);
  assert.equal(Number(rolled[0].count), 0);

  const empty = await call("POST", "/api/admin/imports/customers", adminToken, "客户编码,客户名称\n", {
    "content-type": "text/csv; charset=utf-8"
  });
  assert.equal(empty.statusCode, 400);
  assert.equal(empty.json().error.code, "EMPTY_IMPORT");
});
