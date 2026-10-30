// 用 Java(Spring Boot) 后端跑 Node 那套 77 项契约验收
//   node scripts/verify-java-contract.mjs
// 流程：建独立库 → 导入演示数据 → 启动 Java(8792) → 以 VERIFY_BASE_URL 方式跑 verify-api-http.mjs → 停进程 → 删库
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import mysql from "mysql2/promise";
import { importSqliteToMysql } from "./lib/import-sqlite.mjs";

const root = path.resolve(import.meta.dirname, "..");
if (fs.existsSync(path.join(root, ".env"))) process.loadEnvFile(path.join(root, ".env"));

const PORT = Number(process.env.JAVA_VERIFY_PORT || 8792);
const DB = process.env.VERIFY_DB || "saas_verify_java";
const JAR = path.join(root, ".build", "backend-java", "order-backend-0.1.0.jar");
const JAVA_HOME = process.env.JAVA_HOME || "C:\\Users\\xu\\.jdks\\ms-21.0.12.1";

if (!fs.existsSync(JAR)) {
  console.error(`缺少 jar：${JAR}，先执行 npm run java:build`);
  process.exit(1);
}

const parsed = new URL(process.env.DATABASE_URL);
const server = {
  host: parsed.hostname,
  port: Number(parsed.port || 3306),
  user: decodeURIComponent(parsed.username),
  password: decodeURIComponent(parsed.password)
};
const verifyUrl = new URL(process.env.DATABASE_URL);
verifyUrl.pathname = `/${DB}`;

console.log(`\n== 准备独立库 ${DB} ==`);
const admin = await mysql.createConnection({ ...server, multipleStatements: true });
await admin.query(`DROP DATABASE IF EXISTS \`${DB}\``);
await admin.query(`CREATE DATABASE \`${DB}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci`);
await admin.query(`USE \`${DB}\``);
await admin.query(fs.readFileSync(path.join(root, "packages/db/sql/001_init.sql"), "utf8"));
await importSqliteToMysql({
  sourcePath: path.join(root, process.env.SQLITE_PATH || "data/order-system.db"),
  databaseUrl: verifyUrl.toString(),
  force: true,
  logger: { log() {} }
});
await admin.end();
console.log("  已导入演示数据");

const jdbc = `jdbc:mysql://${server.host}:${server.port}/${DB}?useUnicode=true&characterEncoding=utf8&serverTimezone=Asia/Shanghai&allowPublicKeyRetrieval=true&useSSL=false`;
const logPath = path.join(root, ".java-verify.log");
const logFd = fs.openSync(logPath, "w");
console.log(`\n== 启动 Java 后端（:${PORT}）==`);
const java = spawn(path.join(JAVA_HOME, "bin", "java.exe"), [
  "-jar", JAR,
  "--server.port=" + PORT,
  "--spring.datasource.url=" + jdbc,
  "--spring.datasource.username=" + server.user,
  "--spring.datasource.password=" + server.password
], { stdio: ["ignore", logFd, logFd] });

async function waitReady() {
  for (let attempt = 0; attempt < 90; attempt++) {
    try {
      const response = await fetch(`http://127.0.0.1:${PORT}/api/health`, { signal: AbortSignal.timeout(1000) });
      if (response.ok) {
        console.log("  Java 后端就绪");
        return;
      }
    } catch {
      /* 继续等待 */
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error("Java 后端启动超时，日志见 .java-verify.log");
}

try {
  await waitReady();
  console.log("\n== 以 Java 后端为目标跑 77 项契约验收 ==\n");
  const result = spawnSync(process.execPath, [path.join(root, "verify-api-http.mjs")], {
    cwd: root,
    stdio: "inherit",
    env: {
      ...process.env,
      VERIFY_DB: DB,
      VERIFY_SKIP_DB_SETUP: "1",
      VERIFY_BASE_URL: `http://127.0.0.1:${PORT}`
    }
  });
  process.exitCode = result.status ?? 1;
} finally {
  try {
    java.kill("SIGKILL");
  } catch {
    /* ignore */
  }
  await new Promise((resolve) => setTimeout(resolve, 1500));
  const cleaner = await mysql.createConnection({ ...server, multipleStatements: true });
  await cleaner.query(`DROP DATABASE IF EXISTS \`${DB}\``);
  await cleaner.end();
  console.log(`\n已清理测试库 ${DB}`);
}
