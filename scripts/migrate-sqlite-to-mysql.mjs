// 将现有 SQLite 数据库（data/order-system.db）一次性迁移到 MySQL 8。
// 用法：
//   node scripts/migrate-sqlite-to-mysql.mjs --dry-run
//   node scripts/migrate-sqlite-to-mysql.mjs --force
import fs from "node:fs";
import path from "node:path";
import { importSqliteToMysql } from "./lib/import-sqlite.mjs";

const repoRoot = path.resolve(import.meta.dirname, "..");
const envPath = path.join(repoRoot, ".env");
if (fs.existsSync(envPath)) process.loadEnvFile(envPath);

const args = new Set(process.argv.slice(2));
const force = args.has("--force");
const dryRun = args.has("--dry-run");

if (!process.env.DATABASE_URL) {
  console.error("缺少 DATABASE_URL：请在项目根 .env 中配置 mysql://user:pass@host:3306/saas");
  process.exit(1);
}

const sourcePath = path.resolve(repoRoot, process.env.SQLITE_PATH || "data/order-system.db");

try {
  await importSqliteToMysql({
    sourcePath,
    databaseUrl: process.env.DATABASE_URL,
    force,
    dryRun
  });
} catch (error) {
  console.error(`\n迁移失败：${error.message}`);
  process.exitCode = 1;
}
