// Java 后端契约对照 + 写入冒烟
//   node scripts/java-parity.mjs http://127.0.0.1:8788 http://127.0.0.1:8789
// 第一部分：同一份数据下，逐端点对比 Java 与 Node 两个后端的 JSON 是否一致；
// 第二部分：在 Java 后端上跑创建/修改，再直接查库清理测试数据。
import fs from "node:fs";
import path from "node:path";
import mysql from "mysql2/promise";

const [javaBase, nodeBase] = process.argv.slice(2);
if (!javaBase || !nodeBase) {
  console.error("用法：node scripts/java-parity.mjs <javaBase> <nodeBase>");
  process.exit(1);
}

const root = path.resolve(import.meta.dirname, "..");
if (fs.existsSync(path.join(root, ".env"))) process.loadEnvFile(path.join(root, ".env"));

let failed = 0;

function same(left, right) {
  if (typeof left === "number" && typeof right === "number") return Math.abs(left - right) < 1e-6;
  if (Array.isArray(left) && Array.isArray(right)) {
    return left.length === right.length && left.every((value, index) => same(value, right[index]));
  }
  if (left && right && typeof left === "object" && typeof right === "object") {
    const keys = Object.keys(left);
    if (keys.length !== Object.keys(right).length) return false;
    return keys.every((key) => same(left[key], right[key]));
  }
  return left === right;
}

function firstDiff(left, right, trail = "") {
  if (same(left, right)) return "";
  if (left && right && typeof left === "object" && typeof right === "object") {
    const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
    for (const key of keys) {
      const diff = firstDiff(left[key], right[key], `${trail}.${key}`);
      if (diff) return diff;
    }
  }
  if (Array.isArray(left) && Array.isArray(right) && left.length !== right.length) {
    return `${trail}.length ${left.length} != ${right.length}`;
  }
  return `${trail || "."}: ${JSON.stringify(left)} != ${JSON.stringify(right)}`;
}

async function login(base) {
  const response = await fetch(`${base}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: "admin", password: "Admin@123" })
  });
  const body = await response.json();
  if (!body?.data?.token) throw new Error(`登录失败 ${base}: ${JSON.stringify(body)}`);
  return body.data.token;
}

async function call(base, method, url, token, body) {
  const response = await fetch(`${base}${url}`, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body !== undefined ? { "Content-Type": "application/json" } : {})
    },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const text = await response.text();
  let json;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = text;
  }
  return { status: response.status, body: json };
}

function check(name, condition, detail = "") {
  if (condition) {
    console.log(`  ✔ ${name}`);
  } else {
    failed += 1;
    console.log(`  ✖ ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitReady(base, label) {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const response = await fetch(`${base}/api/health`, { signal: AbortSignal.timeout(1000) });
      if (response.ok) {
        console.log(`  ${label} 就绪：${base}`);
        return;
      }
    } catch {
      // 继续等待
    }
    await sleep(1000);
  }
  throw new Error(`${label} 启动超时：${base}`);
}

await waitReady(javaBase, "Java 后端");
await waitReady(nodeBase, "Node 后端");
const javaToken = await login(javaBase);
const nodeToken = await login(nodeBase);
check("两端均可用 admin 登录", Boolean(javaToken && nodeToken));

console.log("\n== 只读端点对照（Java vs Node） ==");
const customers = (await call(javaBase, "GET", "/api/admin/customers", javaToken)).body?.data ?? [];
const firstCustomerId = customers[0]?.id;
const readPaths = [
  "/api/admin/customers",
  "/api/admin/products",
  "/api/admin/suppliers",
  "/api/admin/prices",
  "/api/admin/payments",
  "/api/admin/customers/" + encodeURIComponent(firstCustomerId ?? "") + "/authorizations",
  "/api/admin/customers/" + encodeURIComponent(firstCustomerId ?? "") + "/effective-prices"
];

for (const url of readPaths) {
  const javaResult = await call(javaBase, "GET", url, javaToken);
  const nodeResult = await call(nodeBase, "GET", url, nodeToken);
  const detail = javaResult.status !== nodeResult.status
    ? `状态 ${javaResult.status} != ${nodeResult.status}`
    : firstDiff(javaResult.body, nodeResult.body);
  check(`GET ${url}`, javaResult.status === nodeResult.status && !detail, detail);
}

console.log("\n== 订单读端点对照 ==");
const ordersResult = await call(javaBase, "GET", "/api/admin/orders", javaToken);
const nodeOrders = await call(nodeBase, "GET", "/api/admin/orders", nodeToken);
const ordersDiff = firstDiff(ordersResult.body, nodeOrders.body);
check("GET /api/admin/orders", ordersResult.status === nodeOrders.status && !ordersDiff, ordersDiff);

const orderRows = ordersResult.body?.data ?? [];
const sampleOrders = orderRows.slice(0, 5);
for (const order of sampleOrders) {
  const url = `/api/admin/orders/${encodeURIComponent(order.id)}`;
  const javaResult = await call(javaBase, "GET", url, javaToken);
  const nodeResult = await call(nodeBase, "GET", url, nodeToken);
  const detail = javaResult.status !== nodeResult.status
    ? `状态 ${javaResult.status} != ${nodeResult.status}`
    : firstDiff(javaResult.body, nodeResult.body);
  check(`GET ${url}（${order.status}）`, javaResult.status === nodeResult.status && !detail, detail);
}

const filtered = "/api/admin/orders?status=" + encodeURIComponent(sampleOrders[0]?.status ?? "PENDING_BANGBANG");
{
  const javaResult = await call(javaBase, "GET", filtered, javaToken);
  const nodeResult = await call(nodeBase, "GET", filtered, nodeToken);
  const detail = javaResult.status !== nodeResult.status
    ? `状态 ${javaResult.status} != ${nodeResult.status}`
    : firstDiff(javaResult.body, nodeResult.body);
  check(`GET ${filtered}`, javaResult.status === nodeResult.status && !detail, detail);
}

console.log("\n== 写入冒烟（只打到 Java 后端） ==");
const suffix = Date.now();
const customerCode = `TEST-JV-${suffix}`;
const sku = `TEST-SKU-${suffix}`;

const createdCustomer = await call(javaBase, "POST", "/api/admin/customers", javaToken, {
  code: customerCode,
  name: "Java迁移验证客户",
  grade: "A",
  priceTier: "A",
  channelType: "WHOLESALER",
  settlementMethod: "CREDIT",
  paymentTermsDays: 30,
  creditLimit: 10000,
  prepayRatio: 0.4,
  batchLimit: 3,
  phone: "13800009999"
});
check("POST /api/admin/customers 创建成功（201）", createdCustomer.status === 201, JSON.stringify(createdCustomer.body));
const customerId = createdCustomer.body?.data?.id;

const updatedCustomer = await call(javaBase, "PUT", `/api/admin/customers/${customerId}`, javaToken, { name: "Java迁移验证客户-改名" });
check("PUT /api/admin/customers/:id 改名成功", updatedCustomer.body?.data?.name === "Java迁移验证客户-改名");

const createdProduct = await call(javaBase, "POST", "/api/admin/products", javaToken, {
  sku,
  name: "Java迁移验证产品",
  category: "测试",
  vehicleModel: "验证车型",
  minPackage: 1,
  basePrice: 100,
  warrantyMonths: 12,
  warrantyKm: 60000
});
check("POST /api/admin/products 创建成功（201）", createdProduct.status === 201, JSON.stringify(createdProduct.body));
const productId = createdProduct.body?.data?.id;

const setTier = await call(javaBase, "PUT", "/api/admin/prices", javaToken, { productId, tier: "A", price: 88 });
check("PUT /api/admin/prices 设置等级价", setTier.status === 200 && setTier.body?.data?.tierPrices?.some((row) => row.productId === productId && row.price === 88));

const effective = await call(javaBase, "GET", `/api/admin/customers/${customerId}/effective-prices`, javaToken);
check("客户生效价格按等级价返回", effective.body?.data?.some((row) => row.productId === productId && row.price === 88 && row.source === "PRICE_TIER"));

const authorizations = await call(javaBase, "PUT", `/api/admin/customers/${customerId}/authorizations`, javaToken, { vehicles: ["验证车型"] });
check("PUT 车型授权成功", authorizations.body?.data?.authorizedVehicles?.includes("验证车型"));

const duplicate = await call(javaBase, "POST", "/api/admin/customers", javaToken, {
  code: customerCode, name: "重复编码", grade: "A", priceTier: "A"
});
check("重复客户编码返回 409 CUSTOMER_CODE_EXISTS", duplicate.status === 409 && duplicate.body?.error?.code === "CUSTOMER_CODE_EXISTS");

console.log("\n== 权限边界 ==");
const warehouseLogin = await fetch(`${javaBase}/api/auth/login`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ username: "warehouse", password: "Admin@123" })
}).then((response) => response.json());
const warehouseToken = warehouseLogin?.data?.token;
const forbidden = await call(javaBase, "GET", "/api/admin/prices", warehouseToken);
check("仓库读取价格矩阵 → 403", forbidden.status === 403 && forbidden.body?.error?.code === "FORBIDDEN");
const noToken = await call(javaBase, "GET", "/api/admin/customers", null);
check("无 token → 401", noToken.status === 401);

console.log("\n== 清理测试数据 ==");
const connection = await mysql.createConnection(process.env.DATABASE_URL);
try {
  await connection.query("DELETE FROM customer_vehicle_authorizations WHERE customer_id = ?", [customerId]);
  await connection.query("DELETE FROM customer_prices WHERE customer_id = ? OR product_id = ?", [customerId, productId]);
  await connection.query("DELETE FROM price_rules WHERE product_id = ?", [productId]);
  await connection.query("DELETE FROM products WHERE id = ?", [productId]);
  await connection.query("DELETE FROM customers WHERE id = ?", [customerId]);
  await connection.query("DELETE FROM audit_logs WHERE entity_id IN (?, ?)", [customerId, productId]);
  console.log(`  已清理测试客户 ${customerId} 与产品 ${productId}`);
} finally {
  await connection.end();
}

console.log(`\n结果：${failed ? `${failed} 项失败` : "全部通过"}`);
process.exitCode = failed ? 1 : 0;
