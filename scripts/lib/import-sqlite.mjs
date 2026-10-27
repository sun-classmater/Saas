import fs from "node:fs";
import { DatabaseSync } from "node:sqlite";
import mysql from "mysql2/promise";

export const TABLES = [
  "customers",
  "users",
  "sessions",
  "customer_vehicle_authorizations",
  "suppliers",
  "products",
  "price_rules",
  "customer_prices",
  "inventory",
  "inventory_movements",
  "plans",
  "plan_items",
  "order_groups",
  "orders",
  "order_items",
  "reservations",
  "payments",
  "shipments",
  "shipment_items",
  "after_sales_cases",
  "invoices",
  "freight_charges",
  "financial_adjustments",
  "notifications",
  "audit_logs",
  "settings"
];

const CHECKS = [
  ["orders", "COUNT(*), COALESCE(SUM(total_amount),0), COALESCE(SUM(paid_amount),0), COALESCE(SUM(shipped_amount),0)"],
  ["order_items", "COUNT(*), COALESCE(SUM(amount),0)"],
  ["payments", "COUNT(*), COALESCE(SUM(amount),0)"],
  ["invoices", "COUNT(*), COALESCE(SUM(amount),0)"],
  ["freight_charges", "COUNT(*), COALESCE(SUM(amount),0)"],
  ["financial_adjustments", "COUNT(*), COALESCE(SUM(amount),0)"],
  ["inventory", "COUNT(*), COALESCE(SUM(quantity),0), COALESCE(SUM(reserved),0)"],
  ["customers", "COUNT(*)"],
  ["products", "COUNT(*)"]
];

function parseDatabaseUrl(url) {
  const parsed = new URL(url);
  return {
    host: parsed.hostname,
    port: Number(parsed.port || 3306),
    user: decodeURIComponent(parsed.username),
    password: decodeURIComponent(parsed.password),
    database: parsed.pathname.replace(/^\//, "")
  };
}

export async function importSqliteToMysql({
  sourcePath,
  databaseUrl,
  force = false,
  dryRun = false,
  logger = console
}) {
  if (!fs.existsSync(sourcePath)) throw new Error(`找不到 SQLite 数据库：${sourcePath}`);
  const sqlite = new DatabaseSync(sourcePath);
  const pool = mysql.createPool({
    ...parseDatabaseUrl(databaseUrl),
    charset: "utf8mb4",
    connectionLimit: 5,
    decimalNumbers: true,
    dateStrings: true,
    timezone: "+08:00"
  });
  let conn;
  const importedRows = {};
  try {
    conn = await pool.getConnection();
    const [[info]] = await conn.query("SELECT DATABASE() AS db, VERSION() AS version");
    logger.log(`目标库：${info.db}（MySQL ${info.version}）`);
    logger.log(`源文件：${sourcePath}`);

    const columnsByTable = {};
    for (const table of TABLES) {
      const [rows] = await conn.query(
        "SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?",
        [table]
      );
      if (rows.length === 0) throw new Error(`目标库缺少表 ${table}，请先执行 npm run db:migrate`);
      const targetColumns = new Set(rows.map((row) => row.COLUMN_NAME));
      const sourceColumns = sqlite
        .prepare(`PRAGMA table_info(${table})`)
        .all()
        .map((row) => row.name);
      const missing = sourceColumns.filter((column) => !targetColumns.has(column));
      if (missing.length) throw new Error(`表 ${table} 目标列缺失：${missing.join(", ")}`);
      columnsByTable[table] = sourceColumns;
    }

    const nonEmpty = [];
    for (const table of TABLES) {
      const [[row]] = await conn.query(`SELECT COUNT(*) AS total FROM \`${table}\``);
      if (Number(row.total) > 0) nonEmpty.push(table);
    }
    if (nonEmpty.length && !force) {
      throw new Error(`目标库已有数据（${nonEmpty.join(", ")}）。如确认覆盖，请加 --force`);
    }
    if (dryRun) {
      logger.log("[dry-run] 结构与数据量检查通过，未写入任何数据。");
      return { dryRun: true, importedRows };
    }

    await conn.query("SET FOREIGN_KEY_CHECKS = 0");
    await conn.beginTransaction();
    try {
      if (force) {
        for (const table of [...TABLES].reverse()) {
          await conn.query(`DELETE FROM \`${table}\``);
        }
      }
      for (const table of TABLES) {
        const columns = columnsByTable[table];
        const rows = sqlite.prepare(`SELECT * FROM ${table}`).all();
        importedRows[table] = rows.length;
        if (rows.length === 0) continue;
        const columnList = columns.map((column) => `\`${column}\``).join(", ");
        const chunkSize = 200;
        for (let start = 0; start < rows.length; start += chunkSize) {
          const chunk = rows.slice(start, start + chunkSize);
          const placeholders = chunk.map(() => `(${columns.map(() => "?").join(", ")})`).join(", ");
          const values = chunk.flatMap((row) => columns.map((column) => row[column] ?? null));
          await conn.query(`INSERT INTO \`${table}\` (${columnList}) VALUES ${placeholders}`, values);
        }
      }
      await conn.commit();
    } catch (error) {
      await conn.rollback();
      throw error;
    } finally {
      await conn.query("SET FOREIGN_KEY_CHECKS = 1");
    }

    for (const [table, expression] of CHECKS) {
      const sourceRow = sqlite.prepare(`SELECT ${expression} AS v FROM \`${table}\``).get();
      const sourceNumbers = Object.values(sourceRow).map((value) => Number(value));
      const [[targetRow]] = await conn.query(`SELECT ${expression} FROM \`${table}\``);
      const targetValues = Object.values(targetRow).map((value) => Number(value));
      const same = sourceNumbers.every((value, index) => Math.abs(value - targetValues[index]) < 0.005);
      if (!same) throw new Error(`表 ${table} 校验不一致：源 ${JSON.stringify(sourceNumbers)} 目标 ${JSON.stringify(targetValues)}`);
    }
    logger.log("迁移完成，校验全部通过。");
    return { dryRun: false, importedRows };
  } finally {
    if (conn) conn.release();
    await pool.end();
    sqlite.close();
  }
}
