// 订单动作差分测试（独立库，不污染演示数据）
//   node scripts/java-actions-test.mjs
// 做法：建 saas_java_verify 库 + 导入演示数据 → 同时起 Java(8790) 与 Node(8791)
//       → 用 Node 下两张完全相同的订单 → 同样的 confirm/accept/cancel 分别打两边
//       → 逐字段比对结果 → 删库、杀进程。
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import mysql from "mysql2/promise";
import { importSqliteToMysql } from "./lib/import-sqlite.mjs";
import { readWorkbookRows, writeWorkbookRows } from "../apps/backend/src/lib/xlsx.js";

const root = path.resolve(import.meta.dirname, "..");
if (fs.existsSync(path.join(root, ".env"))) process.loadEnvFile(path.join(root, ".env"));

const JAVA_PORT = Number(process.env.JAVA_TEST_PORT || 8790);
const NODE_PORT = Number(process.env.NODE_TEST_PORT || 8791);
const javaBase = `http://127.0.0.1:${JAVA_PORT}`;
const nodeBase = `http://127.0.0.1:${NODE_PORT}`;
const dbName = process.env.ACTIONS_TEST_DB || "saas_java_verify";

const parsed = new URL(process.env.DATABASE_URL);
const server = {
  host: parsed.hostname,
  port: Number(parsed.port || 3306),
  user: decodeURIComponent(parsed.username),
  password: decodeURIComponent(parsed.password)
};
const verifyUrl = new URL(process.env.DATABASE_URL);
verifyUrl.pathname = `/${dbName}`;

let failed = 0;
const children = [];

function check(name, condition, detail = "") {
  if (condition) console.log(`  ✔ ${name}`);
  else {
    failed += 1;
    console.log(`  ✖ ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

function sameValue(left, right) {
  if (typeof left === "number" && typeof right === "number") return Math.abs(left - right) < 1e-6;
  if (Array.isArray(left) && Array.isArray(right)) {
    return left.length === right.length && left.every((value, index) => sameValue(value, right[index]));
  }
  if (left && right && typeof left === "object" && typeof right === "object") {
    const keys = Object.keys(left);
    if (keys.length !== Object.keys(right).length) return false;
    return keys.every((key) => sameValue(left[key], right[key]));
  }
  return left === right;
}

function firstDiff(left, right, trail = "") {
  if (sameValue(left, right)) return "";
  if (left && right && typeof left === "object" && typeof right === "object") {
    for (const key of new Set([...Object.keys(left), ...Object.keys(right)])) {
      const diff = firstDiff(left[key], right[key], `${trail}.${key}`);
      if (diff) return diff;
    }
  }
  if (Array.isArray(left) && Array.isArray(right) && left.length !== right.length) {
    return `${trail}.length ${left.length} != ${right.length}`;
  }
  return `${trail || "."}: ${JSON.stringify(left)} != ${JSON.stringify(right)}`;
}

async function call(base, method, url, token, body) {
  const response = await fetch(base + url, {
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

async function waitReady(base, label) {
  for (let attempt = 0; attempt < 90; attempt += 1) {
    try {
      const response = await fetch(`${base}/api/health`, { signal: AbortSignal.timeout(1000) });
      if (response.ok) {
        console.log(`  ${label} 就绪：${base}`);
        return;
      }
    } catch {
      /* 继续等 */
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error(`${label} 启动超时`);
}

async function login(base, username, password) {
  const result = await call(base, "POST", "/api/auth/login", null, { username, password });
  if (!result.body?.data?.token) throw new Error(`登录失败 ${base} ${username}: ${JSON.stringify(result.body)}`);
  return result.body.data.token;
}

const jar = path.join(root, ".build", "backend-java", "order-backend-0.1.0.jar");
if (!fs.existsSync(jar)) throw new Error(`缺少 jar：${jar}，先执行 npm run java:build`);

console.log(`\n== 准备独立库 ${dbName} ==`);
const admin = await mysql.createConnection({ ...server, multipleStatements: true });
await admin.query(`DROP DATABASE IF EXISTS \`${dbName}\``);
await admin.query(`CREATE DATABASE \`${dbName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci`);
await admin.query(`USE \`${dbName}\``);
await admin.query(fs.readFileSync(path.join(root, "packages/db/sql/001_init.sql"), "utf8"));
await importSqliteToMysql({
  sourcePath: path.join(root, process.env.SQLITE_PATH || "data/order-system.db"),
  databaseUrl: verifyUrl.toString(),
  force: true,
  logger: { log() {} }
});
await admin.end();
console.log("  已导入演示数据");

console.log("\n== 启动双后端 ==");
const javaHome = process.env.JAVA_HOME || "C:\\Users\\xu\\.jdks\\ms-21.0.12.1";
const javaJdbc = `jdbc:mysql://${server.host}:${server.port}/${dbName}?useUnicode=true&characterEncoding=utf8&serverTimezone=Asia/Shanghai&allowPublicKeyRetrieval=true&useSSL=false`;
const javaLogPath = path.join(root, ".java-actions-test.log");
const javaLog = fs.openSync(javaLogPath, "w");
children.push(spawn(path.join(javaHome, "bin", "java.exe"), [
  "-jar", jar,
  "--server.port=" + JAVA_PORT,
  "--spring.datasource.url=" + javaJdbc,
  "--spring.datasource.username=" + server.user,
  "--spring.datasource.password=" + server.password
], { stdio: ["ignore", javaLog, javaLog] }));
children.push(spawn(process.execPath, [path.join(root, "apps", "backend", "src", "server.js")], {
  cwd: root,
  env: { ...process.env, DATABASE_URL: verifyUrl.toString(), API_PORT: String(NODE_PORT) },
  stdio: "ignore"
}));

try {
  await waitReady(javaBase, "Java 后端");
  await waitReady(nodeBase, "Node 后端");

  const adminJava = await login(javaBase, "admin", "Admin@123");
  const bangbangJava = await login(javaBase, "bangbang", "Admin@123");
  const sanleiJava = await login(javaBase, "sanlei", "Admin@123");
  const warehouseJava = await login(javaBase, "warehouse", "Admin@123");
  const adminNode = await login(nodeBase, "admin", "Admin@123");
  const bangbangNode = await login(nodeBase, "bangbang", "Admin@123");
  const sanleiNode = await login(nodeBase, "sanlei", "Admin@123");
  const warehouseNode = await login(nodeBase, "warehouse", "Admin@123");
  const customerNode = await call(nodeBase, "POST", "/api/auth/dev-login", null, { phone: "13800000001" });
  const customerToken = customerNode.body?.data?.token;
  const prepayCustomer = await call(nodeBase, "POST", "/api/auth/dev-login", null, { phone: "13800000002" });
  const prepayToken = prepayCustomer.body?.data?.token;
  check("双后端登录 + 客户快捷登录", Boolean(adminJava && bangbangJava && sanleiJava && adminNode && customerToken && prepayToken));

  async function createOrder(label) {
    const created = await call(nodeBase, "POST", "/api/mobile/orders", customerToken, {
      orderType: "NORMAL",
      items: [{ productId: "prod_ball_m8", quantity: 10 }]
    });
    if (created.status !== 201) throw new Error(`下单失败 ${label}: ${JSON.stringify(created.body)}`);
    return created.body.data.orderIds[0];
  }
  const orderA = await createOrder("A");
  const orderB = await createOrder("B");
  console.log(`  测试订单 A=${orderA} B=${orderB}`);
  const baselinePool = await mysql.createConnection({ ...server, database: dbName });
  const [baselineReservedRows] = await baselinePool.query("SELECT COALESCE(SUM(reserved), 0) AS total FROM inventory");
  await baselinePool.end();
  const baselineReserved = Number(baselineReservedRows[0].total);

  const before = await call(nodeBase, "GET", `/api/admin/orders/${orderA}`, adminNode);
  const beforeStatus = before.body?.data?.status;
  check("两张订单初始状态一致", beforeStatus === (await call(nodeBase, "GET", `/api/admin/orders/${orderB}`, adminNode)).body.data.status, beforeStatus);

  console.log("\n== 邦邦确认（Node 打 A / Java 打 B） ==");
  const confirmA = await call(nodeBase, "POST", `/api/admin/orders/${orderA}/actions`, bangbangNode, { action: "BANGBANG_CONFIRM", note: "差分测试" });
  const confirmB = await call(javaBase, "POST", `/api/admin/orders/${orderB}/actions`, bangbangJava, { action: "BANGBANG_CONFIRM", note: "差分测试" });
  check("确认均成功", confirmA.status === 200 && confirmB.status === 200, `${confirmA.status}/${confirmB.status} ${JSON.stringify(confirmB.body)}`);

  const afterConfirmA = (await call(nodeBase, "GET", `/api/admin/orders/${orderA}`, adminNode)).body.data;
  const afterConfirmB = (await call(nodeBase, "GET", `/api/admin/orders/${orderB}`, adminNode)).body.data;
  check("确认后状态一致", afterConfirmA.status === afterConfirmB.status, `${afterConfirmA.status} vs ${afterConfirmB.status}`);
  check("确认后预占数量一致",
    JSON.stringify(afterConfirmA.items.map((i) => i.reservedQuantity)) === JSON.stringify(afterConfirmB.items.map((i) => i.reservedQuantity)),
    `${JSON.stringify(afterConfirmA.items.map((i) => i.reservedQuantity))} vs ${JSON.stringify(afterConfirmB.items.map((i) => i.reservedQuantity))}`);
  check("确认后运维备注一致", afterConfirmA.opsNote === afterConfirmB.opsNote);

  const reconfirmA = await call(nodeBase, "POST", `/api/admin/orders/${orderA}/actions`, bangbangNode, { action: "BANGBANG_CONFIRM" });
  const reconfirmB = await call(javaBase, "POST", `/api/admin/orders/${orderB}/actions`, bangbangJava, { action: "BANGBANG_CONFIRM" });
  check("重复确认错误码一致", reconfirmA.status === reconfirmB.status && reconfirmA.body?.error?.code === reconfirmB.body?.error?.code,
    `${reconfirmA.status}/${reconfirmA.body?.error?.code} vs ${reconfirmB.status}/${reconfirmB.body?.error?.code}`);

  console.log("\n== 三磊接单 ==");
  const acceptA = await call(nodeBase, "POST", `/api/admin/orders/${orderA}/actions`, sanleiNode, { action: "SANLEI_ACCEPT" });
  const acceptB = await call(javaBase, "POST", `/api/admin/orders/${orderB}/actions`, sanleiJava, { action: "SANLEI_ACCEPT" });
  check("接单均成功", acceptA.status === 200 && acceptB.status === 200, `${acceptA.status}/${acceptB.status}`);
  const acceptedA = (await call(nodeBase, "GET", `/api/admin/orders/${orderA}`, adminNode)).body.data;
  const acceptedB = (await call(nodeBase, "GET", `/api/admin/orders/${orderB}`, adminNode)).body.data;
  check("接单后状态一致", acceptedA.status === acceptedB.status && acceptedA.status === "PREPARING", `${acceptedA.status} vs ${acceptedB.status}`);

  console.log("\n== 取消（释放预占） ==");
  const cancelA = await call(nodeBase, "POST", `/api/admin/orders/${orderA}/actions`, adminNode, { action: "CANCEL", reason: "差分测试取消" });
  const cancelB = await call(javaBase, "POST", `/api/admin/orders/${orderB}/actions`, adminJava, { action: "CANCEL", reason: "差分测试取消" });
  check("取消均成功", cancelA.status === 200 && cancelB.status === 200, `${cancelA.status}/${cancelB.status} ${JSON.stringify(cancelB.body)}`);
  const cancelledA = (await call(nodeBase, "GET", `/api/admin/orders/${orderA}`, adminNode)).body.data;
  const cancelledB = (await call(nodeBase, "GET", `/api/admin/orders/${orderB}`, adminNode)).body.data;
  check("取消后状态一致", cancelledA.status === "CANCELLED" && cancelledB.status === "CANCELLED", `${cancelledA.status} vs ${cancelledB.status}`);
  check("取消后订单行字段与 Node 一致（含 reservedQuantity 语义）",
    JSON.stringify(cancelledA.items.map((i) => [i.reservedQuantity, i.shippedQuantity])) ===
      JSON.stringify(cancelledB.items.map((i) => [i.reservedQuantity, i.shippedQuantity])),
    `${JSON.stringify(cancelledA.items.map((i) => i.reservedQuantity))} vs ${JSON.stringify(cancelledB.items.map((i) => i.reservedQuantity))}`);

  const pool = await mysql.createConnection({ ...server, database: dbName });
  const [reserved] = await pool.query("SELECT COALESCE(SUM(reserved), 0) AS total FROM inventory");
  await pool.end();
  check("库存预占总和回到基线（两张测试单都已释放）", Number(reserved[0].total) === baselineReserved,
    `now=${reserved[0].total} baseline=${baselineReserved}`);

  console.log("\n== 权限边界（Java） ==");
  const wrongRole = await call(javaBase, "POST", `/api/admin/orders/${orderB}/actions`, warehouseJava, { action: "BANGBANG_CONFIRM" });
  check("仓库执行确认 → 403", wrongRole.status === 403, String(wrongRole.status));
  const invalid = await call(javaBase, "POST", `/api/admin/orders/${orderB}/actions`, adminJava, { action: "NOPE" });
  check("非法动作 → 400 INVALID_ORDER_ACTION", invalid.status === 400 && invalid.body?.error?.code === "INVALID_ORDER_ACTION", JSON.stringify(invalid.body));

  // ---------------- 场景 2：整批发货（信用单） ----------------
  console.log("\n== 整批发货（Node 打 C / Java 打 D） ==");
  const shipPool = await mysql.createConnection({ ...server, database: dbName });
  const [invBeforeRows] = await shipPool.query("SELECT COALESCE(SUM(quantity), 0) AS total FROM inventory");
  const invBefore = Number(invBeforeRows[0].total);
  await shipPool.end();

  const orderC = await createOrder("C");
  const orderD = await createOrder("D");
  await call(nodeBase, "POST", `/api/admin/orders/${orderC}/actions`, bangbangNode, { action: "BANGBANG_CONFIRM" });
  await call(javaBase, "POST", `/api/admin/orders/${orderD}/actions`, bangbangJava, { action: "BANGBANG_CONFIRM" });
  await call(nodeBase, "POST", `/api/admin/orders/${orderC}/actions`, sanleiNode, { action: "SANLEI_ACCEPT" });
  await call(javaBase, "POST", `/api/admin/orders/${orderD}/actions`, sanleiJava, { action: "SANLEI_ACCEPT" });

  const detailC = (await call(nodeBase, "GET", `/api/admin/orders/${orderC}`, adminNode)).body.data;
  const detailD = (await call(nodeBase, "GET", `/api/admin/orders/${orderD}`, adminNode)).body.data;
  const shipBody = (order) => ({
    action: "SHIP",
    shipment: {
      logisticsCompany: "德邦",
      trackingNo: "DIFF-001",
      items: order.items.map((item) => ({ orderItemId: item.id, quantity: item.quantity }))
    }
  });
  const shipC = await call(nodeBase, "POST", `/api/admin/orders/${orderC}/actions`, warehouseNode, shipBody(detailC));
  const shipD = await call(javaBase, "POST", `/api/admin/orders/${orderD}/actions`, warehouseJava, shipBody(detailD));
  check("发货均成功", shipC.status === 200 && shipD.status === 200, `${shipC.status}/${shipD.status} ${JSON.stringify(shipD.body)}`);

  const shippedC = (await call(nodeBase, "GET", `/api/admin/orders/${orderC}`, adminNode)).body.data;
  const shippedD = (await call(nodeBase, "GET", `/api/admin/orders/${orderD}`, adminNode)).body.data;
  check("整批发货后状态一致（SHIPPED）", shippedC.status === shippedD.status && shippedC.status === "SHIPPED", `${shippedC.status} vs ${shippedD.status}`);
  check("发货金额一致", shippedC.shippedAmount === shippedD.shippedAmount, `${shippedC.shippedAmount} vs ${shippedD.shippedAmount}`);
  check("发货批次数量一致", shippedC.shipments.length === shippedD.shipments.length, `${shippedC.shipments.length} vs ${shippedD.shipments.length}`);
  check("订单行已发数量一致",
    JSON.stringify(shippedC.items.map((i) => i.shippedQuantity)) === JSON.stringify(shippedD.items.map((i) => i.shippedQuantity)));
  check("批次摘要一致", shippedC.shipments[0]?.summary === shippedD.shipments[0]?.summary,
    `${shippedC.shipments[0]?.summary} vs ${shippedD.shipments[0]?.summary}`);

  const shipPool2 = await mysql.createConnection({ ...server, database: dbName });
  const [invAfterRows] = await shipPool2.query("SELECT COALESCE(SUM(quantity), 0) AS total FROM inventory");
  await shipPool2.end();
  check("库存总量正好减少两张单的数量（20）", invBefore - Number(invAfterRows[0].total) === 20,
    `${invBefore} -> ${invAfterRows[0].total}`);

  // ---------------- 场景 3：预付款收单 ----------------
  console.log("\n== 预付款确认 + 模拟到账（Node 打 E / Java 打 F） ==");
  async function createPrepayOrder() {
    const created = await call(nodeBase, "POST", "/api/mobile/orders", prepayToken, {
      orderType: "PREPAY",
      items: [{ productId: "prod_ball_m8", quantity: 10 }]
    });
    if (created.status !== 201) throw new Error(`预付款下单失败: ${JSON.stringify(created.body)}`);
    return created.body.data.orderIds[0];
  }
  const orderE = await createPrepayOrder();
  const orderF = await createPrepayOrder();
  await call(nodeBase, "POST", `/api/admin/orders/${orderE}/actions`, bangbangNode, { action: "BANGBANG_CONFIRM" });
  const confirmF = await call(javaBase, "POST", `/api/admin/orders/${orderF}/actions`, bangbangJava, { action: "BANGBANG_CONFIRM" });
  check("预付款确认后均为待付款", confirmF.body?.data?.status === "PENDING_PAYMENT", JSON.stringify(confirmF.body?.data?.status));

  const payE = await call(nodeBase, "GET", `/api/admin/orders/${orderE}`, adminNode);
  const payF = await call(nodeBase, "GET", `/api/admin/orders/${orderF}`, adminNode);
  const amountE = payE.body.data.totalAmount;
  const amountF = payF.body.data.totalAmount;
  const mockE = await call(nodeBase, "POST", "/api/admin/payments/mock", adminNode, { orderId: orderE, amount: amountE });
  const mockF = await call(javaBase, "POST", "/api/admin/payments/mock", adminJava, { orderId: orderF, amount: amountF });
  check("模拟到账均成功", mockE.status === 200 && mockF.status === 200, `${mockE.status}/${mockF.status} ${JSON.stringify(mockF.body)}`);
  check("到账后状态一致（PENDING_SANLEI）", mockE.body?.data?.status === mockF.body?.data?.status && mockF.body?.data?.status === "PENDING_SANLEI",
    `${mockE.body?.data?.status} vs ${mockF.body?.data?.status}`);
  check("到账金额一致", mockE.body?.data?.paidAmount === mockF.body?.data?.paidAmount,
    `${mockE.body?.data?.paidAmount} vs ${mockF.body?.data?.paidAmount}`);
  check("付款记录条数一致", mockE.body?.data?.payments?.length === mockF.body?.data?.payments?.length);

  const repayF = await call(javaBase, "POST", "/api/admin/payments/mock", adminJava, { orderId: orderF, amount: 1 });
  check("已付清订单再付款 → 409", repayF.status === 409 && repayF.body?.error?.code === "INVALID_ORDER_STATUS",
    `${repayF.status}/${repayF.body?.error?.code}`);

  // ---------------- 场景 4：客户侧读接口对照 ----------------
  console.log("\n== 客户侧读接口对照（profile / catalog） ==");
  const customerJavaLogin = await call(javaBase, "POST", "/api/auth/dev-login", null, { phone: "13800000001" });
  const customerJavaToken = customerJavaLogin.body?.data?.token;
  check("Java dev-login 客户成功", Boolean(customerJavaToken), JSON.stringify(customerJavaLogin.body));

  for (const url of ["/api/mobile/profile", "/api/mobile/catalog"]) {
    const javaResult = await call(javaBase, "GET", url, customerJavaToken);
    const nodeResult = await call(nodeBase, "GET", url, customerToken);
    const detail = javaResult.status !== nodeResult.status
      ? `${javaResult.status} != ${nodeResult.status}`
      : firstDiff(javaResult.body, nodeResult.body);
    check(`GET ${url}`, javaResult.status === nodeResult.status && !detail, detail);
  }

  // ---------------- 场景 5：下单对照 ----------------
  console.log("\n== 下单对照（Node 打 G / Java 打 H） ==");
  const orderPayload = { orderType: "NORMAL", items: [{ productId: "prod_ball_m8", quantity: 10 }], note: "差分下单" };
  const createdNode = await call(nodeBase, "POST", "/api/mobile/orders", customerToken, orderPayload);
  const createdJava = await call(javaBase, "POST", "/api/mobile/orders", customerJavaToken, orderPayload);
  check("两端下单均 201", createdNode.status === 201 && createdJava.status === 201,
    `${createdNode.status}/${createdJava.status} ${JSON.stringify(createdJava.body)}`);
  check("下单返回金额一致", createdNode.body?.data?.totalAmount === createdJava.body?.data?.totalAmount,
    `${createdNode.body?.data?.totalAmount} vs ${createdJava.body?.data?.totalAmount}`);
  check("下单返回单数一致", createdNode.body?.data?.orderIds?.length === createdJava.body?.data?.orderIds?.length);
  check("组号前缀一致（SO-）", String(createdJava.body?.data?.groupNo).startsWith("SO-"), String(createdJava.body?.data?.groupNo));

  const orderNode = (await call(nodeBase, "GET", `/api/admin/orders/${createdNode.body.data.orderIds[0]}`, adminNode)).body.data;
  const orderJava = (await call(nodeBase, "GET", `/api/admin/orders/${createdJava.body.data.orderIds[0]}`, adminNode)).body.data;
  const pick = (order) => ({
    status: order.status,
    settlementMethod: order.settlementMethod,
    totalAmount: order.totalAmount,
    prepayRatio: order.prepayRatio,
    batchLimit: order.batchLimit,
    customerNote: order.customerNote,
    items: order.items.map((item) => [item.productId, item.quantity, item.unitPrice, item.amount])
  });
  const orderDiff = firstDiff(pick(orderNode), pick(orderJava));
  check("下单生成的订单字段一致", !orderDiff, orderDiff);

  // ---------------- 场景 6：移动端支付 + 确认收货 ----------------
  console.log("\n== 移动端支付 + 确认收货（Java） ==");
  const prepayJavaLogin = await call(javaBase, "POST", "/api/auth/dev-login", null, { phone: "13800000002" });
  const prepayJavaToken = prepayJavaLogin.body?.data?.token;
  const prepayCreate = await call(javaBase, "POST", "/api/mobile/orders", prepayJavaToken,
    { orderType: "PREPAY", items: [{ productId: "prod_ball_m8", quantity: 10 }] });
  const prepayOrderId = prepayCreate.body?.data?.orderIds?.[0];
  check("Java 预付款下单成功", Boolean(prepayOrderId), JSON.stringify(prepayCreate.body));
  await call(javaBase, "POST", `/api/admin/orders/${prepayOrderId}/actions`, bangbangJava, { action: "BANGBANG_CONFIRM" });
  const prepayDetail = (await call(nodeBase, "GET", `/api/admin/orders/${prepayOrderId}`, adminNode)).body.data;
  const mobilePay = await call(javaBase, "POST", "/api/mobile/payments", prepayJavaToken,
    { orderId: prepayOrderId, amount: prepayDetail.totalAmount });
  check("移动端创建支付 201 且 mockMode", mobilePay.status === 201 && mobilePay.body?.data?.mockMode === true,
    JSON.stringify(mobilePay.body));
  const mobileDone = await call(javaBase, "POST", `/api/mobile/payments/${mobilePay.body.data.id}/mock-complete`, prepayJavaToken, {});
  check("移动端到账后转待接单", mobileDone.status === 200 && mobileDone.body?.data?.status === "PENDING_SANLEI",
    JSON.stringify(mobileDone.body?.error ?? mobileDone.body?.data?.status));

  const recvC = await call(nodeBase, "POST", `/api/mobile/shipments/${shippedC.shipments[0].id}/receive`, customerToken, {});
  const recvD = await call(javaBase, "POST", `/api/mobile/shipments/${shippedD.shipments[0].id}/receive`, customerJavaToken, {});
  check("确认收货均成功", recvC.status === 200 && recvD.status === 200,
    `${recvC.status}/${recvD.status} ${JSON.stringify(recvD.body?.error ?? "")}`);
  check("收货后订单均完成", recvC.body?.data?.status === recvD.body?.data?.status && recvD.body?.data?.status === "COMPLETED",
    `${recvC.body?.data?.status} vs ${recvD.body?.data?.status}`);

  // ---------------- 场景 7：采购计划 ----------------
  console.log("\n== 采购计划（Node 打 I / Java 打 J） ==");
  const plansNode = await call(nodeBase, "GET", "/api/admin/plans", adminNode);
  const plansJava = await call(javaBase, "GET", "/api/admin/plans", adminJava);
  const plansDiff = firstDiff(plansNode.body, plansJava.body);
  check("GET /api/admin/plans 一致", plansNode.status === plansJava.status && !plansDiff, plansDiff);

  const planPayload = {
    planMonth: "2026-11",
    note: "差分计划",
    items: [
      { weekNo: 1, productId: "prod_ball_m8", quantity: 10 },
      { weekNo: 2, productId: "prod_ball_m8", quantity: 20 }
    ]
  };
  const planNode = await call(nodeBase, "POST", "/api/mobile/plans", customerToken, planPayload);
  const planJava = await call(javaBase, "POST", "/api/mobile/plans", customerJavaToken, planPayload);
  check("两端创建计划均 201", planNode.status === 201 && planJava.status === 201,
    `${planNode.status}/${planJava.status} ${JSON.stringify(planJava.body?.error ?? "")}`);
  check("创建计划字段一致", !firstDiff(
    pickPlan(planNode.body?.data), pickPlan(planJava.body?.data)), firstDiff(
    pickPlan(planNode.body?.data), pickPlan(planJava.body?.data)));

  function pickPlan(plan) {
    if (!plan) return null;
    return {
      planMonth: plan.planMonth,
      status: plan.status,
      customerNote: plan.customerNote,
      itemCount: plan.itemCount,
      totalQuantity: plan.totalQuantity,
      items: plan.items.map((item) => [item.weekNo, item.productId, item.quantity, item.orderedQuantity])
    };
  }

  const planIdNode = planNode.body?.data?.id;
  const planIdJava = planJava.body?.data?.id;

  const editNode = await call(nodeBase, "PUT", `/api/mobile/plans/${planIdNode}`, customerToken, {
    ...planPayload, items: [{ weekNo: 1, productId: "prod_ball_m8", quantity: 30 }], note: "差分计划-改"
  });
  const editJava = await call(javaBase, "PUT", `/api/mobile/plans/${planIdJava}`, customerJavaToken, {
    ...planPayload, items: [{ weekNo: 1, productId: "prod_ball_m8", quantity: 30 }], note: "差分计划-改"
  });
  check("两端修改计划均成功", editNode.status === 200 && editJava.status === 200,
    `${editNode.status}/${editJava.status}`);
  check("修改后计划字段一致", !firstDiff(pickPlan(editNode.body?.data), pickPlan(editJava.body?.data)),
    firstDiff(pickPlan(editNode.body?.data), pickPlan(editJava.body?.data)));

  const steps = [
    ["SUBMIT", "/api/mobile/plans", customerToken, customerJavaToken, "BANGBANG_REVIEW"],
    ["BANGBANG_APPROVE", "/api/admin/plans", bangbangNode, bangbangJava, "SANLEI_REVIEW"],
    ["SANLEI_APPROVE", "/api/admin/plans", sanleiNode, sanleiJava, "APPROVED"]
  ];
  for (const [action, prefix, nodeTokenForAction, javaTokenForAction, expected] of steps) {
    const nodeResult = await call(nodeBase, "POST", `${prefix}/${planIdNode}/actions`, nodeTokenForAction, { action });
    const javaResult = await call(javaBase, "POST", `${prefix}/${planIdJava}/actions`, javaTokenForAction, { action });
    check(`${action} 两端成功且状态为 ${expected}`,
      nodeResult.status === 200 && javaResult.status === 200
        && javaResult.body?.data?.status === expected && nodeResult.body?.data?.status === expected,
      `${nodeResult.status}/${javaResult.status} ${javaResult.body?.error?.code ?? javaResult.body?.data?.status}`);
  }

  const planDetailNode = (await call(nodeBase, "GET", "/api/admin/plans", adminNode)).body.data.find((plan) => plan.id === planIdNode);
  const planDetailJava = (await call(nodeBase, "GET", "/api/admin/plans", adminNode)).body.data.find((plan) => plan.id === planIdJava);
  check("审批后审核人时间戳都写入",
    Boolean(planDetailNode?.bangbangReviewedAt && planDetailJava?.bangbangReviewedAt
      && planDetailNode?.sanleiReviewedAt && planDetailJava?.sanleiReviewedAt));

  const rejectJava = await call(javaBase, "POST", `/api/admin/plans/${planIdJava}/actions`, sanleiJava, { action: "SANLEI_APPROVE" });
  check("已审核计划再审核 → 409 INVALID_PLAN_STATUS",
    rejectJava.status === 409 && rejectJava.body?.error?.code === "INVALID_PLAN_STATUS",
    `${rejectJava.status}/${rejectJava.body?.error?.code}`);

  // ---------------- 场景 8：库存 ----------------
  console.log("\n== 库存查询 / 移库 / 调整（Java） ==");
  const invNode = await call(nodeBase, "GET", "/api/admin/inventory", adminNode);
  const invJava = await call(javaBase, "GET", "/api/admin/inventory", adminJava);
  const invDiff = firstDiff(invNode.body, invJava.body);
  check("GET /api/admin/inventory 一致", invNode.status === invJava.status && !invDiff, invDiff);

  const movNode = await call(nodeBase, "GET", "/api/admin/inventory/movements", adminNode);
  const movJava = await call(javaBase, "GET", "/api/admin/inventory/movements", adminJava);
  const movDiff = firstDiff(movNode.body, movJava.body);
  check("GET /api/admin/inventory/movements 一致", movNode.status === movJava.status && !movDiff, movDiff);

  const inventoryRows = invJava.body?.data ?? [];
  const byProduct = new Map();
  for (const row of inventoryRows) {
    if (!byProduct.has(row.productId)) byProduct.set(row.productId, []);
    byProduct.get(row.productId).push(row);
  }
  let pair = null;
  for (const rows of byProduct.values()) {
    if (rows.length >= 2) {
      const source = rows.find((row) => row.available >= 5);
      const destination = rows.find((row) => row.id !== source?.id);
      if (source && destination) {
        pair = { source, destination };
        break;
      }
    }
  }
  if (!pair) {
    check("找到可移库的库存对", false, "演示数据里没有同产品多仓库存");
  } else {
    const { source, destination } = pair;
    const transfer = await call(javaBase, "POST", "/api/admin/inventory/transfer", adminJava, {
      sourceId: source.id, destinationId: destination.id, quantity: 5
    });
    check("Java 移库成功（201）", transfer.status === 201 && transfer.body?.data?.transferNo?.startsWith("MOVE-"),
      JSON.stringify(transfer.body?.error ?? transfer.body?.data?.transferNo));

    const afterRows = (await call(nodeBase, "GET", "/api/admin/inventory", adminNode)).body.data;
    const sourceAfter = afterRows.find((row) => row.id === source.id);
    const destinationAfter = afterRows.find((row) => row.id === destination.id);
    check("移库后源仓减少、目标仓增加",
      sourceAfter.quantity === source.quantity - 5 && destinationAfter.quantity === destination.quantity + 5,
      `${source.quantity}->${sourceAfter.quantity} / ${destination.quantity}->${destinationAfter.quantity}`);

    const movements = (await call(nodeBase, "GET", "/api/admin/inventory/movements", adminNode)).body.data;
    const out = movements.find((row) => row.type === "TRANSFER_OUT" && row.referenceId === transfer.body.data.transferNo);
    const into = movements.find((row) => row.type === "TRANSFER_IN" && row.referenceId === transfer.body.data.transferNo);
    check("移库流水双条且备注模板正确",
      out?.quantity === -5 && into?.quantity === 5
        && out?.note === `移库至${destination.warehouseName}` && into?.note === `由${source.warehouseName}移入`,
      `${out?.note} | ${into?.note}`);

    const back = await call(javaBase, "POST", "/api/admin/inventory/transfer", adminJava, {
      sourceId: destination.id, destinationId: source.id, quantity: 5
    });
    check("反向移库还原成功", back.status === 201);

    const same = await call(javaBase, "POST", "/api/admin/inventory/transfer", adminJava, {
      sourceId: source.id, destinationId: source.id, quantity: 1
    });
    check("源=目标 → 400 INVALID_TRANSFER", same.status === 400 && same.body?.error?.code === "INVALID_TRANSFER",
      `${same.status}/${same.body?.error?.code}`);
    const tooMuch = await call(javaBase, "POST", "/api/admin/inventory/transfer", adminJava, {
      sourceId: source.id, destinationId: destination.id, quantity: 999999
    });
    check("可用量不足 → 409 INSUFFICIENT_TRANSFER_STOCK",
      tooMuch.status === 409 && tooMuch.body?.error?.code === "INSUFFICIENT_TRANSFER_STOCK",
      `${tooMuch.status}/${tooMuch.body?.error?.code}`);
  }

  const adjustTarget = inventoryRows.find((row) => row.available > 10);
  if (adjustTarget) {
    const up = await call(javaBase, "POST", `/api/admin/inventory/${adjustTarget.id}/adjust`, adminJava, { quantity: 7, note: "差分调整" });
    check("Java 库存调整 +7 成功", up.status === 200 && up.body?.data?.quantity === adjustTarget.quantity + 7,
      JSON.stringify(up.body?.error ?? up.body?.data?.quantity));
    const down = await call(javaBase, "POST", `/api/admin/inventory/${adjustTarget.id}/adjust`, adminJava, { quantity: -7, note: "差分调整回退" });
    check("Java 库存调整 -7 还原", down.status === 200 && down.body?.data?.quantity === adjustTarget.quantity,
      JSON.stringify(down.body?.error ?? down.body?.data?.quantity));
    const zero = await call(javaBase, "POST", `/api/admin/inventory/${adjustTarget.id}/adjust`, adminJava, { quantity: 0 });
    check("调整数量为 0 → 400", zero.status === 400 && zero.body?.error?.code === "VALIDATION_ERROR",
      `${zero.status}/${zero.body?.error?.code}`);
    const belowReserved = await call(javaBase, "POST", `/api/admin/inventory/${adjustTarget.id}/adjust`, adminJava,
      { quantity: -(adjustTarget.quantity + 1) });
    check("调整到负数 → 409 INVALID_INVENTORY_ADJUSTMENT",
      belowReserved.status === 409 && belowReserved.body?.error?.code === "INVALID_INVENTORY_ADJUSTMENT",
      `${belowReserved.status}/${belowReserved.body?.error?.code}`);
  } else {
    check("找到可调整的库存行", false);
  }

  const warehouseAdjust = await call(javaBase, "POST", `/api/admin/inventory/${adjustTarget?.id ?? "x"}/adjust`, sanleiJava, { quantity: 1 });
  check("三磊销售调整库存 → 403", warehouseAdjust.status === 403, String(warehouseAdjust.status));

  // ---------------- 场景 9：缺货公平分配 ----------------
  console.log("\n== 缺货公平分配（Java vs Node） ==");
  const shortageNode = await call(nodeBase, "GET", "/api/admin/shortages", adminNode);
  const shortageJava = await call(javaBase, "GET", "/api/admin/shortages", adminJava);
  const shortageDiff = firstDiff(shortageNode.body, shortageJava.body);
  check("GET /api/admin/shortages 一致", shortageNode.status === shortageJava.status && !shortageDiff, shortageDiff);

  const shortageList = shortageJava.body?.data ?? [];
  const products = (await call(nodeBase, "GET", "/api/admin/products", adminNode)).body.data;
  const activeOrderProduct = products.find((item) => item.id === "prod_ball_m8");
  const previewProductId = shortageList[0]?.productId ?? activeOrderProduct?.id ?? products[0]?.id;
  if (!previewProductId) {
    check("找到可预览的缺货产品", false, "没有可用产品");
  } else {
    const previewNode = await call(nodeBase, "GET", `/api/admin/shortages/${previewProductId}/preview`, adminNode);
    const previewJava = await call(javaBase, "GET", `/api/admin/shortages/${previewProductId}/preview`, adminJava);
    if (previewNode.status === 404 && previewJava.status === 404) {
      console.log("  （该产品没有待履约订单，跳过分配预览）");
    } else {
      check("预览状态码一致", previewNode.status === previewJava.status,
        `${previewNode.status}/${previewJava.status} ${JSON.stringify(previewJava.body?.error?.code ?? "")}`);

      const shape = (data) => data && ({
        product: data.product,
        physicalStock: data.physicalStock,
        totalDemand: data.totalDemand,
        unallocatedDemand: data.unallocatedDemand,
        strategy: data.strategy,
        candidates: data.candidates.map((item) => ({
          orderItemId: item.orderItemId,
          orderId: item.orderId,
          orderNo: item.orderNo,
          customerName: item.customerName,
          grade: item.grade,
          channelType: item.channelType,
          orderStatus: item.orderStatus,
          remainingQuantity: item.remainingQuantity,
          currentReserved: item.currentReserved,
          suggestedQuantity: item.suggestedQuantity,
          unmetQuantity: item.unmetQuantity
        }))
      });
      const nodeShape = shape(previewNode.body?.data);
      const javaShape = shape(previewJava.body?.data);
      const diff = firstDiff(nodeShape, javaShape);
      check("分配预览除 score 外完全一致", !diff, diff);
      const scoreDiff = previewJava.body?.data?.candidates?.every((item, index) =>
        Math.abs((item.score ?? 0) - (previewNode.body?.data?.candidates?.[index]?.score ?? 0)) < 1e-3);
      check("加权分数在 1e-3 容差内一致（含时间因子）", Boolean(scoreDiff));

      const applyJava = await call(javaBase, "POST", `/api/admin/shortages/${previewProductId}/apply`, sanleiJava, {});
      check("Java 按建议值确认分配成功", applyJava.status === 200 && Array.isArray(applyJava.body?.data?.candidates),
        `${applyJava.status} ${JSON.stringify(applyJava.body?.error?.code ?? "")}`);
      const afterApply = applyJava.body?.data;
      check("分配后候选行已有预占", afterApply?.candidates?.some((item) => item.currentReserved > 0)
        || afterApply?.candidates?.every((item) => item.suggestedQuantity === 0),
        JSON.stringify(afterApply?.candidates?.map((item) => [item.suggestedQuantity, item.currentReserved])));

      const tooMany = await call(javaBase, "POST", `/api/admin/shortages/${previewProductId}/apply`, sanleiJava, {
        targets: [{ orderItemId: afterApply.candidates[0].orderItemId, quantity: 999999 }]
      });
      check("超额分配 → 400 ALLOCATION_EXCEEDS_DEMAND",
        tooMany.status === 400
          && ["ALLOCATION_EXCEEDS_DEMAND", "ALLOCATION_EXCEEDS_STOCK"].includes(tooMany.body?.error?.code),
        `${tooMany.status}/${tooMany.body?.error?.code}`);
    }
  }

  // ---------------- 场景 10：财务 / 售后 / 通知 ----------------
  console.log("\n== 财务 / 售后 / 站内通知 ==");
  const financeNode = await call(nodeBase, "GET", "/api/admin/finance", adminNode);
  const financeJava = await call(javaBase, "GET", "/api/admin/finance", adminJava);
  const financeDiff = firstDiff(financeNode.body, financeJava.body);
  check("GET /api/admin/finance 一致", financeNode.status === financeJava.status && !financeDiff, financeDiff);

  const noticeNode = await call(nodeBase, "GET", "/api/notifications", adminNode);
  const noticeJava = await call(javaBase, "GET", "/api/notifications", adminJava);
  const noticeDiff = firstDiff(noticeNode.body, noticeJava.body);
  check("GET /api/notifications 一致", noticeNode.status === noticeJava.status && !noticeDiff, noticeDiff);

  const afterNode = await call(nodeBase, "GET", "/api/admin/after-sales", adminNode);
  const afterJava = await call(javaBase, "GET", "/api/admin/after-sales", adminJava);
  const afterDiff = firstDiff(afterNode.body, afterJava.body);
  check("GET /api/admin/after-sales 一致", afterNode.status === afterJava.status && !afterDiff, afterDiff);

  const orderForFinance = shippedC.id;
  const invoice = await call(javaBase, "POST", "/api/admin/finance/invoices", adminJava, {
    orderId: orderForFinance, title: "差分测试抬头", taxNumber: "91440000TEST", amount: 100, taxRate: 13, note: "差分"
  });
  check("Java 开票成功（201）", invoice.status === 201 && invoice.body?.data?.recordNo?.startsWith("INV-"),
    `${invoice.status} ${JSON.stringify(invoice.body?.error ?? invoice.body?.data?.recordNo)}`);
  check("发票初始状态 PENDING 且金额正确",
    invoice.body?.data?.status === "PENDING" && invoice.body.data.amount === 100);
  const issued = await call(javaBase, "POST", `/api/admin/finance/invoices/${invoice.body.data.id}/status`, adminJava, { status: "ISSUED" });
  check("发票置为已开（ISSUED）且写入 issuedAt",
    issued.status === 200 && issued.body?.data?.status === "ISSUED" && Boolean(issued.body?.data?.issuedAt));
  const badStatus = await call(javaBase, "POST", `/api/admin/finance/invoices/${invoice.body.data.id}/status`, adminJava, { status: "NOPE" });
  check("非法发票状态 → 400 VALIDATION_ERROR",
    badStatus.status === 400 && badStatus.body?.error?.code === "VALIDATION_ERROR",
    `${badStatus.status}/${badStatus.body?.error?.code}`);

  const freight = await call(javaBase, "POST", "/api/admin/finance/freight", adminJava, {
    orderId: orderForFinance, amount: 58.5, payer: "COMPANY", description: "差分运费"
  });
  check("Java 登记运费成功（201）", freight.status === 201 && freight.body?.data?.amount === 58.5,
    `${freight.status} ${JSON.stringify(freight.body?.error ?? freight.body?.data?.amount)}`);
  const settled = await call(javaBase, "POST", `/api/admin/finance/freight/${freight.body.data.id}/settle`, adminJava, {});
  check("运费结算成功且状态 SETTLED",
    settled.status === 200 && settled.body?.data?.freight?.some((row) => row.id === freight.body.data.id && row.status === "SETTLED"));
  const badSettle = await call(javaBase, "POST", `/api/admin/finance/unknown/x/settle`, adminJava, {});
  check("非法结算类型 → 400 VALIDATION_ERROR",
    badSettle.status === 400 && badSettle.body?.error?.code === "VALIDATION_ERROR",
    `${badSettle.status}/${badSettle.body?.error?.code}`);

  const adjustment = await call(javaBase, "POST", "/api/admin/finance/adjustments", adminJava, {
    customerId: "cust_guangzhou_xingchi", type: "CLAIM", amount: -32.5, description: "差分索赔"
  });
  check("Java 登记调整款成功（201）", adjustment.status === 201 && adjustment.body?.data?.status === "PENDING",
    `${adjustment.status} ${JSON.stringify(adjustment.body?.error ?? adjustment.body?.data?.recordNo)}`);
  const zeroAdjust = await call(javaBase, "POST", "/api/admin/finance/adjustments", adminJava, {
    customerId: "cust_guangzhou_xingchi", type: "CLAIM", amount: 0
  });
  check("调整金额为 0 → 400", zeroAdjust.status === 400 && zeroAdjust.body?.error?.code === "VALIDATION_ERROR",
    `${zeroAdjust.status}/${zeroAdjust.body?.error?.code}`);

  const afterCase = await call(javaBase, "POST", "/api/mobile/after-sales", customerJavaToken, {
    orderId: orderForFinance, type: "RETURN", description: "差分售后", claimAmount: 12
  });
  check("Java 小程序创建售后成功（201）", afterCase.status === 201 && afterCase.body?.data?.status === "OPEN",
    `${afterCase.status} ${JSON.stringify(afterCase.body?.error ?? afterCase.body?.data?.caseNo)}`);
  const afterUpdated = await call(javaBase, "PUT", `/api/admin/after-sales/${afterCase.body.data.id}`, adminJava, {
    status: "APPROVED", resolution: "同意退货"
  });
  check("售后状态流转到 APPROVED", afterUpdated.status === 200 && afterUpdated.body?.data?.status === "APPROVED"
    && afterUpdated.body?.data?.resolution === "同意退货");
  const afterBad = await call(javaBase, "PUT", `/api/admin/after-sales/${afterCase.body.data.id}`, adminJava, { status: "NOPE" });
  check("非法售后状态 → 400", afterBad.status === 400 && afterBad.body?.error?.code === "VALIDATION_ERROR",
    `${afterBad.status}/${afterBad.body?.error?.code}`);

  const noticeBefore = await call(javaBase, "GET", "/api/notifications", adminJava);
  const unread = noticeBefore.body?.data?.find((row) => !row.read);
  if (unread) {
    const read = await call(javaBase, "POST", `/api/notifications/${unread.id}/read`, adminJava, {});
    check("标记通知已读成功", read.status === 200 && read.body?.data?.ok === true);
    const noticeAfter = await call(javaBase, "GET", "/api/notifications", adminJava);
    check("已读状态回写", noticeAfter.body?.data?.find((row) => row.id === unread.id)?.read === true);
  } else {
    check("存在未读通知可用于标记", false);
  }

  // ---------------- 场景 11：账号与审计 ----------------
  console.log("\n== 账号与审计 ==");
  const usersNode = await call(nodeBase, "GET", "/api/admin/users", adminNode);
  const usersJava = await call(javaBase, "GET", "/api/admin/users", adminJava);
  const usersDiff = firstDiff(usersNode.body, usersJava.body);
  check("GET /api/admin/users 一致", usersNode.status === usersJava.status && !usersDiff, usersDiff);

  const auditNode = await call(nodeBase, "GET", "/api/admin/audit-logs", adminNode);
  const auditJava = await call(javaBase, "GET", "/api/admin/audit-logs", adminJava);
  const auditDiff = firstDiff(auditNode.body, auditJava.body);
  check("GET /api/admin/audit-logs 一致", auditNode.status === auditJava.status && !auditDiff, auditDiff);

  const staffUsername = `diffstaff${Date.now()}`;
  const staff = await call(javaBase, "POST", "/api/admin/users/staff", adminJava, {
    username: staffUsername, password: "DiffTest@123", displayName: "差分员工", role: "SANLEI_SALES", phone: "13700001111"
  });
  check("Java 开内部账号成功（201）", staff.status === 201 && staff.body?.data?.role === "SANLEI_SALES",
    `${staff.status} ${JSON.stringify(staff.body?.error ?? staff.body?.data?.username)}`);
  const dupStaff = await call(javaBase, "POST", "/api/admin/users/staff", adminJava, {
    username: staffUsername, password: "DiffTest@123", displayName: "重复", role: "SANLEI_SALES"
  });
  check("重复登录名 → 409 USER_EXISTS", dupStaff.status === 409 && dupStaff.body?.error?.code === "USER_EXISTS",
    `${dupStaff.status}/${dupStaff.body?.error?.code}`);
  const weakPwd = await call(javaBase, "POST", "/api/admin/users/staff", adminJava, {
    username: `${staffUsername}x`, password: "1234567", displayName: "弱密码", role: "SANLEI_SALES"
  });
  check("弱密码 → 400 WEAK_PASSWORD", weakPwd.status === 400 && weakPwd.body?.error?.code === "WEAK_PASSWORD",
    `${weakPwd.status}/${weakPwd.body?.error?.code}`);
  const badRole = await call(javaBase, "POST", "/api/admin/users/staff", adminJava, {
    username: `${staffUsername}y`, password: "DiffTest@123", displayName: "角色错误", role: "BOSS"
  });
  check("非法内部角色 → 400", badRole.status === 400 && badRole.body?.error?.code === "VALIDATION_ERROR");

  const disable = await call(javaBase, "POST", `/api/admin/users/${staff.body.data.id}/toggle`, adminJava, { active: false });
  check("停用内部账号成功", disable.status === 200 && disable.body?.data?.active === false,
    JSON.stringify(disable.body?.error ?? disable.body?.data?.active));
  const enabled = await call(javaBase, "POST", `/api/admin/users/${staff.body.data.id}/toggle`, adminJava, { active: true });
  check("重新启用成功", enabled.status === 200 && enabled.body?.data?.active === true);

  const adminRow = usersJava.body.data.find((row) => row.role === "SUPER_ADMIN");
  const disableAdmin = await call(javaBase, "POST", `/api/admin/users/${adminRow.id}/toggle`, adminJava, { active: false });
  check("停用超级管理员 → 409 CANNOT_DISABLE_ADMIN",
    disableAdmin.status === 409 && disableAdmin.body?.error?.code === "CANNOT_DISABLE_ADMIN",
    `${disableAdmin.status}/${disableAdmin.body?.error?.code}`);

  const customerUser = await call(javaBase, "POST", "/api/admin/users/customer", adminJava, {
    customerId: "cust_guangzhou_xingchi", phone: "13600002222", displayName: "差分客户账号"
  });
  check("Java 开客户子账号成功（201）", customerUser.status === 201 && customerUser.body?.data?.role === "CUSTOMER_BUYER",
    `${customerUser.status} ${JSON.stringify(customerUser.body?.error ?? customerUser.body?.data?.role)}`);

  const staffByBangbang = await call(javaBase, "POST", "/api/admin/users/staff", bangbangJava, {
    username: `${staffUsername}z`, password: "DiffTest@123", displayName: "越权", role: "SANLEI_SALES"
  });
  check("邦邦开内部账号 → 403", staffByBangbang.status === 403, String(staffByBangbang.status));
  const usersByWarehouse = await call(javaBase, "GET", "/api/admin/users", warehouseJava);
  check("仓库读账号列表 → 403", usersByWarehouse.status === 403, String(usersByWarehouse.status));
  const auditByBangbang = await call(javaBase, "GET", "/api/admin/audit-logs", bangbangJava);
  check("邦邦读审计日志 → 403", auditByBangbang.status === 403, String(auditByBangbang.status));

  // ---------------- 场景 12：导出与导入模板 ----------------
  console.log("\n== 导出 / 导入模板 ==");
  async function fetchRaw(base, url, token) {
    const response = await fetch(base + url, { headers: { Authorization: `Bearer ${token}` } });
    return {
      status: response.status,
      contentType: response.headers.get("content-type") ?? "",
      disposition: response.headers.get("content-disposition") ?? "",
      buffer: Buffer.from(await response.arrayBuffer())
    };
  }

  for (const kind of ["orders", "inventory", "payments", "plans"]) {
    const javaCsv = await fetchRaw(javaBase, `/api/admin/exports/${kind}`, adminJava);
    const nodeCsv = await fetchRaw(nodeBase, `/api/admin/exports/${kind}`, adminNode);
    const same = javaCsv.status === nodeCsv.status && javaCsv.buffer.equals(nodeCsv.buffer);
    check(`导出 ${kind}.csv 与 Node 逐字节一致`, same,
      same ? "" : `java=${javaCsv.buffer.length}B node=${nodeCsv.buffer.length}B`);
    check(`导出 ${kind}.xlsx 状态与类型正确`,
      (await fetchRaw(javaBase, `/api/admin/exports/${kind}/xlsx`, adminJava)).status === 200);

    const javaXlsx = await fetchRaw(javaBase, `/api/admin/exports/${kind}/xlsx`, adminJava);
    const nodeXlsx = await fetchRaw(nodeBase, `/api/admin/exports/${kind}/xlsx`, adminNode);
    const javaRows = readWorkbookRows(javaXlsx.buffer);
    const nodeRows = readWorkbookRows(nodeXlsx.buffer);
    check(`导出 ${kind}.xlsx 内容与 Node 一致（${javaRows.length} 行）`,
      JSON.stringify(javaRows) === JSON.stringify(nodeRows),
      `${javaRows.length} vs ${nodeRows.length}`);
  }

  for (const kind of ["customers", "products", "prices", "inventory"]) {
    const javaTpl = await fetchRaw(javaBase, `/api/admin/import-templates/${kind}`, adminJava);
    const nodeTpl = await fetchRaw(nodeBase, `/api/admin/import-templates/${kind}`, adminNode);
    check(`模板 ${kind}.csv 与 Node 逐字节一致`, javaTpl.buffer.equals(nodeTpl.buffer),
      `${javaTpl.buffer.length}B vs ${nodeTpl.buffer.length}B`);
    const javaTplXlsx = await fetchRaw(javaBase, `/api/admin/import-templates/${kind}/xlsx`, adminJava);
    const nodeTplXlsx = await fetchRaw(nodeBase, `/api/admin/import-templates/${kind}/xlsx`, adminNode);
    check(`模板 ${kind}.xlsx 表头一致`,
      JSON.stringify(readWorkbookRows(javaTplXlsx.buffer))
        === JSON.stringify(readWorkbookRows(nodeTplXlsx.buffer)));
  }

  const badExport = await fetchRaw(javaBase, "/api/admin/exports/nope", adminJava);
  check("非法导出类型 → 404", badExport.status === 404, String(badExport.status));
  const badTemplate = await fetchRaw(javaBase, "/api/admin/import-templates/nope", adminJava);
  check("非法模板类型 → 404", badTemplate.status === 404, String(badTemplate.status));

  // ---------------- 场景 13：导入与微信回调 ----------------
  console.log("\n== 导入 / 微信回调 ==");
  const stamp = Date.now();
  const goodSku = `IMP-${stamp}`;
  const productCsv = [
    "物料号,品名,分类,车型,最小包装,基础价,质保月数,质保公里,说明",
    `${goodSku},导入测试产品,测试类,验证车型,1,88.5,12,60000,差分导入`
  ].join("\r\n");

  async function postText(base, url, token, text) {
    const response = await fetch(base + url, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "text/csv; charset=utf-8" },
      body: text
    });
    return { status: response.status, body: await response.json().catch(() => null) };
  }

  const importJava = await postText(javaBase, "/api/admin/imports/products", adminJava, productCsv);
  check("Java CSV 导入产品成功", importJava.status === 200 && importJava.body?.data?.imported === 1,
    `${importJava.status} ${JSON.stringify(importJava.body?.error ?? importJava.body?.data)}`);
  const productsAfter = (await call(nodeBase, "GET", "/api/admin/products", adminNode)).body.data;
  check("导入的产品可按物料号查到", productsAfter.some((item) => item.sku === goodSku));

  const badSku = `IMP-BAD-${stamp}`;
  const badCsv = [
    "物料号,品名,分类,车型,最小包装,基础价,质保月数,质保公里,说明",
    `${badSku},回滚测试产品,测试类,验证车型,1,66,12,60000,应被回滚`,
    `IMP-ERR-${stamp},坏行,测试类,验证车型,1,abc,12,60000,价格非法`
  ].join("\r\n");
  const rollbackJava = await postText(javaBase, "/api/admin/imports/products", adminJava, badCsv);
  check("含非法行 → 400 IMPORT_VALIDATION_FAILED",
    rollbackJava.status === 400 && rollbackJava.body?.error?.code === "IMPORT_VALIDATION_FAILED",
    `${rollbackJava.status}/${rollbackJava.body?.error?.code}`);
  const rollbackNode = await postText(nodeBase, "/api/admin/imports/products", adminNode, badCsv);
  check("两端导入失败错误码一致", rollbackNode.status === rollbackJava.status
    && rollbackNode.body?.error?.code === rollbackJava.body?.error?.code);
  const productsAfterRollback = (await call(nodeBase, "GET", "/api/admin/products", adminNode)).body.data;
  check("整批回滚：合法行也没有入库", !productsAfterRollback.some((item) => item.sku === badSku));

  const emptyImport = await postText(javaBase, "/api/admin/imports/products", adminJava, "");
  check("空导入 → 400 EMPTY_IMPORT", emptyImport.status === 400 && emptyImport.body?.error?.code === "EMPTY_IMPORT",
    `${emptyImport.status}/${emptyImport.body?.error?.code}`);
  const unknownImport = await postText(javaBase, "/api/admin/imports/nope", adminJava, productCsv);
  check("非法导入类型 → 404 IMPORT_NOT_FOUND",
    unknownImport.status === 404 && unknownImport.body?.error?.code === "IMPORT_NOT_FOUND",
    `${unknownImport.status}/${unknownImport.body?.error?.code}`);

  const xlsxSku = `IMPX-${stamp}`;
  const xlsxBuffer = writeWorkbookRows(
    ["物料号", "品名", "分类", "车型", "最小包装", "基础价", "质保月数", "质保公里", "说明"],
    [[xlsxSku, "Excel导入产品", "测试类", "验证车型", 1, 99, 12, 60000, "xlsx"]],
    "产品档案"
  );
  const importXlsx = await call(javaBase, "POST", "/api/admin/imports/products/xlsx", adminJava, {
    fileBase64: Buffer.from(xlsxBuffer).toString("base64")
  });
  check("Java XLSX 导入成功", importXlsx.status === 200 && importXlsx.body?.data?.imported === 1,
    `${importXlsx.status} ${JSON.stringify(importXlsx.body?.error ?? importXlsx.body?.data)}`);
  const productsAfterXlsx = (await call(nodeBase, "GET", "/api/admin/products", adminNode)).body.data;
  check("XLSX 导入的产品存在", productsAfterXlsx.some((item) => item.sku === xlsxSku));

  const noBase64 = await call(javaBase, "POST", "/api/admin/imports/products/xlsx", adminJava, {});
  check("缺少 fileBase64 → 400", noBase64.status === 400 && noBase64.body?.error?.code === "VALIDATION_ERROR",
    `${noBase64.status}/${noBase64.body?.error?.code}`);

  const notifyJava = await call(javaBase, "POST", "/api/wechat/pay/notify", null, {});
  const notifyNode = await call(nodeBase, "POST", "/api/wechat/pay/notify", null, {});
  check("微信回调 mock 模式两端一致（503）",
    notifyJava.status === 503 && notifyNode.status === 503,
    `${notifyJava.status}/${notifyNode.status}`);
} finally {
  for (const child of children) {
    try {
      child.kill("SIGKILL");
    } catch {
      /* ignore */
    }
  }
  await new Promise((resolve) => setTimeout(resolve, 1500));
  const cleaner = await mysql.createConnection({ ...server, multipleStatements: true });
  await cleaner.query(`DROP DATABASE IF EXISTS \`${dbName}\``);
  await cleaner.end();
  console.log(`\n已清理测试库 ${dbName}`);
}

console.log(`\n结果：${failed ? `${failed} 项失败` : "全部通过"}`);
process.exitCode = failed ? 1 : 0;
