import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { buildApp } from "../src/server.js";
import { createDb, closeDb } from "@saas/db";

const hasDb = Boolean(process.env.DATABASE_URL);
const stamp = Date.now();
const state = { customerId: null, productId: null, supplierId: null, transferNos: [] };

let app;
let adminToken;
let warehouseToken;
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
  warehouseToken = await login("warehouse");
  const loginResponse = await app.inject({
    method: "POST",
    url: "/api/auth/dev-login",
    payload: { phone: "13800000001" }
  });
  assert.equal(loginResponse.statusCode, 200, loginResponse.body);
  customerToken = loginResponse.json().data.token;
  pool = createDb().pool;
});

after(async () => {
  if (!hasDb) return;
  try {
    if (state.customerId) {
      await pool.query("DELETE FROM customer_prices WHERE customer_id = ?", [state.customerId]);
      await pool.query("DELETE FROM customer_vehicle_authorizations WHERE customer_id = ?", [state.customerId]);
      await pool.query("DELETE FROM users WHERE customer_id = ?", [state.customerId]);
      await pool.query("DELETE FROM audit_logs WHERE entity_id = ?", [state.customerId]);
      await pool.query("DELETE FROM customers WHERE id = ?", [state.customerId]);
    }
    if (state.productId) {
      await pool.query("DELETE FROM customer_prices WHERE product_id = ?", [state.productId]);
      await pool.query("DELETE FROM price_rules WHERE product_id = ?", [state.productId]);
      await pool.query("DELETE FROM audit_logs WHERE entity_id = ?", [state.productId]);
      await pool.query("DELETE FROM products WHERE id = ?", [state.productId]);
    }
    if (state.supplierId) {
      await pool.query("DELETE FROM audit_logs WHERE entity_id = ?", [state.supplierId]);
      await pool.query("DELETE FROM suppliers WHERE id = ?", [state.supplierId]);
    }
    if (state.transferNos.length) {
      for (const transferNo of state.transferNos) {
        await pool.query("DELETE FROM inventory_movements WHERE reference_id = ?", [transferNo]);
        await pool.query("DELETE FROM audit_logs WHERE entity_id = ?", [transferNo]);
      }
    }
    await pool.query("DELETE FROM inventory_movements WHERE note LIKE '测试调整%'");
  } finally {
    await closeDb(pool);
    await app.close();
  }
});

function skipUnlessDb() {
  return { skip: hasDb ? false : "未配置 DATABASE_URL" };
}

test("客户/产品/价格/供应商/库存列表接口可用", skipUnlessDb(), async () => {
  const customers = await call("GET", "/api/admin/customers", adminToken);
  assert.equal(customers.statusCode, 200);
  assert.ok(customers.json().data.length >= 3);
  assert.ok("creditLimit" in customers.json().data[0]);

  const filtered = await call("GET", "/api/admin/customers?keyword=CUS-001", adminToken);
  assert.equal(filtered.statusCode, 200);
  assert.equal(filtered.json().data[0].code, "CUS-001");

  const products = await call("GET", "/api/admin/products", adminToken);
  assert.equal(products.statusCode, 200);
  assert.ok(products.json().data.length >= 6);
  assert.equal(typeof products.json().data[0].available, "number");

  const prices = await call("GET", "/api/admin/prices", adminToken);
  assert.equal(prices.statusCode, 200);
  assert.ok(prices.json().data.tiers.includes("VIP"));

  const suppliers = await call("GET", "/api/admin/suppliers", adminToken);
  assert.equal(suppliers.statusCode, 200);
  assert.ok(suppliers.json().data.length >= 1);

  const inventory = await call("GET", "/api/admin/inventory", adminToken);
  assert.equal(inventory.statusCode, 200);
  assert.ok(inventory.json().data.length >= 12);
  const movements = await call("GET", "/api/admin/inventory/movements", adminToken);
  assert.equal(movements.statusCode, 200);
  assert.ok(Array.isArray(movements.json().data));
});

test("权限：客户访问管理端 404、仓库读价格 403、无 Token 401", skipUnlessDb(), async () => {
  const customer = await call("GET", "/api/admin/customers", customerToken);
  assert.equal(customer.statusCode, 404);
  assert.equal(customer.json().error.code, "NOT_FOUND");

  const warehouse = await call("GET", "/api/admin/prices", warehouseToken);
  assert.equal(warehouse.statusCode, 403);
  assert.equal(warehouse.json().error.code, "FORBIDDEN");

  const anonymous = await call("GET", "/api/admin/customers", null);
  assert.equal(anonymous.statusCode, 401);
});

test("客户创建、修改、有效价格与车型授权", skipUnlessDb(), async () => {
  const created = await call("POST", "/api/admin/customers", adminToken, {
    code: `QA-TEST-${stamp}`,
    name: "集成测试客户",
    province: "上海市",
    city: "上海市",
    channelType: "WHOLESALER",
    grade: "A",
    priceTier: "VIP",
    settlementMethod: "CREDIT",
    paymentTermsDays: 30,
    creditLimit: 8000,
    prepayRatio: 1,
    batchLimit: 3,
    phone: `139${String(stamp).slice(-8)}`
  });
  assert.equal(created.statusCode, 201, created.body);
  state.customerId = created.json().data.id;

  const updated = await call("PUT", `/api/admin/customers/${state.customerId}`, adminToken, { name: "集成测试客户改名" });
  assert.equal(updated.statusCode, 200);
  assert.equal(updated.json().data.name, "集成测试客户改名");

  const effective = await call("GET", `/api/admin/customers/${state.customerId}/effective-prices`, adminToken);
  assert.equal(effective.statusCode, 200);
  assert.ok(effective.json().data.length >= 6);

  const auth = await call("GET", `/api/admin/customers/${state.customerId}/authorizations`, adminToken);
  assert.equal(auth.statusCode, 200);
  assert.ok(auth.json().data.allVehicles.length >= 4);

  const saved = await call("PUT", `/api/admin/customers/${state.customerId}/authorizations`, adminToken, {
    vehicles: ["传祺M8"]
  });
  assert.equal(saved.statusCode, 200);
  assert.deepEqual(saved.json().data.authorizedVehicles, ["传祺M8"]);

  const invalid = await call("PUT", `/api/admin/customers/${state.customerId}/authorizations`, adminToken, {
    vehicles: ["不存在车型"]
  });
  assert.equal(invalid.statusCode, 400);
  assert.equal(invalid.json().error.code, "INVALID_VEHICLE_MODEL");
});

test("产品创建、修改与重复物料号", skipUnlessDb(), async () => {
  const created = await call("POST", "/api/admin/products", adminToken, {
    sku: `QA-TEST-${stamp}`,
    name: "集成测试产品",
    category: "球头",
    vehicleModel: "传祺M8",
    minPackage: 2,
    basePrice: 120,
    warrantyMonths: 12,
    warrantyKm: 60000
  });
  assert.equal(created.statusCode, 201, created.body);
  state.productId = created.json().data.id;
  assert.equal(created.json().data.available, 0);

  const updated = await call("PUT", `/api/admin/products/${state.productId}`, adminToken, { name: "集成测试产品改名", basePrice: 130 });
  assert.equal(updated.statusCode, 200);
  assert.equal(updated.json().data.name, "集成测试产品改名");

  const duplicate = await call("POST", "/api/admin/products", adminToken, {
    sku: `QA-TEST-${stamp}`,
    name: "重复",
    category: "球头",
    vehicleModel: "传祺M8",
    minPackage: 1,
    basePrice: 1
  });
  assert.equal(duplicate.statusCode, 409);
  assert.equal(duplicate.json().error.code, "PRODUCT_SKU_EXISTS");
});

test("价格设置：等级价与客户专属价优先级", skipUnlessDb(), async () => {
  const tier = await call("PUT", "/api/admin/prices", adminToken, {
    productId: state.productId,
    tier: "VIP",
    price: 99
  });
  assert.equal(tier.statusCode, 200);

  const specific = await call("PUT", "/api/admin/prices", adminToken, {
    scope: "CUSTOMER",
    customerId: state.customerId,
    productId: state.productId,
    price: 77
  });
  assert.equal(specific.statusCode, 200);

  const effective = await call("GET", `/api/admin/customers/${state.customerId}/effective-prices`, adminToken);
  const product = effective.json().data.find((item) => item.productId === state.productId);
  assert.equal(product.price, 77);
  assert.equal(product.source, "CUSTOMER_SPECIFIC");
});

test("库存移库、调整与超扣保护", skipUnlessDb(), async () => {
  const inventory = await call("GET", "/api/admin/inventory", adminToken);
  const rows = inventory.json().data.filter((item) => item.productId === "prod_ball_m8");
  const real = rows.find((item) => item.sourceType === "REAL");
  const virtual = rows.find((item) => item.sourceType === "VIRTUAL");
  assert.ok(real && virtual);

  const transfer = await call("POST", "/api/admin/inventory/transfer", warehouseToken, {
    sourceId: real.id,
    destinationId: virtual.id,
    quantity: 1
  });
  assert.equal(transfer.statusCode, 201, transfer.body);
  state.transferNos.push(transfer.json().data.transferNo);
  const reverse = await call("POST", "/api/admin/inventory/transfer", warehouseToken, {
    sourceId: virtual.id,
    destinationId: real.id,
    quantity: 1
  });
  assert.equal(reverse.statusCode, 201);
  state.transferNos.push(reverse.json().data.transferNo);

  const adjust = await call("POST", `/api/admin/inventory/${real.id}/adjust`, warehouseToken, {
    quantity: 3,
    note: "测试调整+3"
  });
  assert.equal(adjust.statusCode, 200);
  const restored = await call("POST", `/api/admin/inventory/${real.id}/adjust`, warehouseToken, {
    quantity: -3,
    note: "测试调整-3"
  });
  assert.equal(restored.statusCode, 200);

  const tooMuch = await call("POST", `/api/admin/inventory/${real.id}/adjust`, warehouseToken, {
    quantity: -99999
  });
  assert.equal(tooMuch.statusCode, 409);
  assert.equal(tooMuch.json().error.code, "INVALID_INVENTORY_ADJUSTMENT");
});

test("供应商创建、修改与类型校验", skipUnlessDb(), async () => {
  const created = await call("POST", "/api/admin/suppliers", adminToken, {
    name: `集成测试供应商${stamp}`,
    type: "INTEGRATOR",
    contact: "张经理",
    phone: "021-12345678"
  });
  assert.equal(created.statusCode, 201, created.body);
  state.supplierId = created.json().data.id;

  const updated = await call("PUT", `/api/admin/suppliers/${state.supplierId}`, adminToken, {
    name: `集成测试供应商${stamp}改名`
  });
  assert.equal(updated.statusCode, 200);
  assert.ok(updated.json().data.name.endsWith("改名"));

  const invalid = await call("POST", "/api/admin/suppliers", adminToken, { name: "类型错误", type: "UNKNOWN" });
  assert.equal(invalid.statusCode, 400);
});
