// 执行 packages/db/sql 下的顺序 SQL 迁移，记录在 schema_migrations 表。
// 用法：node packages/db/src/migrate.js [--dry-run]
import fs from "node:fs";
import path from "node:path";
import mysql from "mysql2/promise";

const repoRoot = path.resolve(import.meta.dirname, "../../..");
const envPath = path.join(repoRoot, ".env");
if (fs.existsSync(envPath)) process.loadEnvFile(envPath);

if (!process.env.DATABASE_URL) {
  console.error("缺少 DATABASE_URL：请在项目根 .env 中配置 mysql://user:pass@host:3306/saas");
  process.exit(1);
}

const dryRun = process.argv.includes("--dry-run");
const sqlDir = path.join(import.meta.dirname, "..", "sql");
const files = fs.readdirSync(sqlDir).filter((file) => file.endsWith(".sql")).sort();

const parsed = new URL(process.env.DATABASE_URL);
const connection = await mysql.createConnection({
  host: parsed.hostname,
  port: Number(parsed.port || 3306),
  user: decodeURIComponent(parsed.username),
  password: decodeURIComponent(parsed.password),
  database: parsed.pathname.replace(/^\//, ""),
  charset: "utf8mb4",
  multipleStatements: true,
  decimalNumbers: true,
  dateStrings: true,
  timezone: "+08:00"
});

let failed = false;
try {
  await connection.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version VARCHAR(128) NOT NULL PRIMARY KEY,
      applied_at VARCHAR(32) NOT NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
  `);
  const [appliedRows] = await connection.query("SELECT version FROM schema_migrations");
  const applied = new Set(appliedRows.map((row) => row.version));

  for (const file of files) {
    if (applied.has(file)) {
      console.log(`跳过 ${file}（已执行）`);
      continue;
    }
    console.log(`${dryRun ? "[dry-run] 待执行" : "执行"} ${file}`);
    if (dryRun) continue;
    const sql = fs.readFileSync(path.join(sqlDir, file), "utf8");
    await connection.query(sql);
    await connection.query("INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)", [
      file,
      new Date().toISOString()
    ]);
    console.log(`  ${file} 完成`);
  }
  if (dryRun) console.log("dry-run 结束，未写入。");
  else console.log("全部迁移完成。");
} catch (error) {
  failed = true;
  console.error(`迁移失败：${error.message}`);
} finally {
  await connection.end();
  process.exitCode = failed ? 1 : 0;
}
