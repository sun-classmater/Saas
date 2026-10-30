// 环境自检：node scripts/doctor.mjs
// 作用：一条命令定位「前后端起不来」的原因，输出可直接贴给开发排查。
import fs from "node:fs";
import net from "node:net";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const rows = [];
const ok = (msg) => rows.push(["OK  ", msg]);
const warn = (msg) => rows.push(["WARN", msg]);
const bad = (msg) => rows.push(["FAIL", msg]);

// 1. Node 版本
const major = Number(process.versions.node.split(".")[0]);
if (major >= 24) ok(`Node ${process.versions.node}（要求 >= 24）`);
else bad(`Node ${process.versions.node} 太旧：Vite 7 与 import.meta.dirname 都需要 Node >= 20.19 / 24，请升级`);

// 2. workspace 依赖链接
for (const [pkg, dir] of [
  ["@saas/db", "packages/db"],
  ["@saas/backend", "apps/backend"],
  ["@saas/frontend", "apps/frontend"]
]) {
  const linkPath = path.join(root, "node_modules", "@saas", pkg.split("/")[1]);
  try {
    const real = fs.realpathSync(linkPath);
    const expected = fs.realpathSync(path.join(root, dir));
    if (real.toLowerCase() === expected.toLowerCase()) ok(`${pkg} 链接正确 → ${dir}`);
    else bad(`${pkg} 指向错误目录：${real}（应为 ${expected}），请重跑 npm install`);
  } catch {
    bad(`${pkg} 链接不存在：先在项目根执行 npm install`);
  }
}
const viteBin = path.join(root, "node_modules", ".bin", process.platform === "win32" ? "vite.cmd" : "vite");
if (fs.existsSync(viteBin)) ok("node_modules/.bin/vite 存在");
else bad("缺少 node_modules/.bin/vite：执行 npm install");

// 3. 关键文件
for (const rel of [
  "apps/backend/src/server.js",
  "apps/frontend/index.html",
  "apps/frontend/vite.config.js",
  "packages/db/src/schema.js",
  "package.json"
]) {
  if (fs.existsSync(path.join(root, rel))) ok(`文件存在 ${rel}`);
  else bad(`文件缺失 ${rel}`);
}

// 4. .env 与 MySQL
const envPath = path.join(root, ".env");
let databaseUrl = "";
if (!fs.existsSync(envPath)) {
  bad("缺少根目录 .env，后端拿不到 DATABASE_URL");
} else {
  process.loadEnvFile(envPath);
  databaseUrl = process.env.DATABASE_URL || "";
  if (databaseUrl) ok(".env 中 DATABASE_URL 已配置");
  else bad(".env 里没有 DATABASE_URL");
}
if (databaseUrl) {
  try {
    const mysql = await import("mysql2/promise");
    const parsed = new URL(databaseUrl);
    const conn = await mysql.default.createConnection({
      host: parsed.hostname,
      port: Number(parsed.port || 3306),
      user: decodeURIComponent(parsed.username),
      password: decodeURIComponent(parsed.password),
      database: parsed.pathname.replace(/^\//, ""),
      connectTimeout: 4000
    });
    const [pingRows] = await conn.query("SELECT DATABASE() AS db");
    ok(`MySQL 连接成功，当前库 ${pingRows[0].db}`);
    await conn.end();
  } catch (error) {
    bad(`MySQL 连接失败：${error.code || ""} ${error.message}`.trim());
  }
}

// 5. 端口占用
function portState(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once("error", (error) => resolve(error.code === "EADDRINUSE" ? "BUSY" : "BUSY"));
    server.once("listening", () => server.close(() => resolve("FREE")));
    server.listen(port, "127.0.0.1");
  });
}
for (const [name, port] of [["后端", 8788], ["前端", 5173], ["旧版后端", 8787]]) {
  const state = await portState(port);
  if (state === "FREE") {
    ok(`${name}端口 ${port} 空闲`);
    continue;
  }
  let who = "";
  if (name === "后端") {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/health`, { signal: AbortSignal.timeout(3000) });
      const body = await response.json();
      who = body?.data?.service ? `——是本项目后端在跑（${body.data.service}），不用重复启动` : "——占用者不是本项目后端";
    } catch {
      who = "——占用者无法识别";
    }
  }
  warn(`${name}端口 ${port} 已被占用${who}`);
}

// 输出
const width = Math.max(...rows.map((row) => row[1].length));
console.log("\n===== 环境自检 =====");
for (const [level, msg] of rows) console.log(`[${level}] ${msg.padEnd(width)}`);
const failures = rows.filter((row) => row[0] === "FAIL").length;
const warnings = rows.filter((row) => row[0] === "WARN").length;
console.log(`\n结论：${failures ? `${failures} 项失败` : "无失败项"}${warnings ? `，${warnings} 项警告` : ""}`);
if (!failures) {
  console.log("\n下一步：");
  console.log("  后端：npm run api:start");
  console.log("  前端：npm run dev -w @saas/frontend");
  console.log("  若报 spawn EPERM：后端改用 npm run api:start，前端改用 npm run dev:native -w @saas/frontend");
}
