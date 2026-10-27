import mysql from "mysql2/promise";
import { drizzle } from "drizzle-orm/mysql2";
import * as schema from "./schema.js";

export function parseDatabaseUrl(url) {
  if (!url) throw new Error("缺少 DATABASE_URL（请在项目根 .env 中配置 mysql://user:pass@host:3306/saas）");
  const parsed = new URL(url);
  if (!["mysql:", "mariadb:"].includes(parsed.protocol)) {
    throw new Error(`DATABASE_URL 协议必须是 mysql://，当前是 ${parsed.protocol}`);
  }
  const database = parsed.pathname.replace(/^\//, "");
  if (!database) throw new Error("DATABASE_URL 缺少数据库名（例如 /saas）");
  return {
    host: parsed.hostname,
    port: Number(parsed.port || 3306),
    user: decodeURIComponent(parsed.username),
    password: decodeURIComponent(parsed.password),
    database
  };
}

export function createPool(url = process.env.DATABASE_URL) {
  const config = parseDatabaseUrl(url);
  return mysql.createPool({
    ...config,
    charset: "utf8mb4",
    connectionLimit: Number(process.env.DB_POOL_SIZE || 10),
    waitForConnections: true,
    decimalNumbers: true,
    dateStrings: true,
    timezone: "+08:00",
    namedPlaceholders: false
  });
}

export function createDb(url = process.env.DATABASE_URL) {
  const pool = createPool(url);
  return { pool, db: drizzle(pool, { schema, mode: "default" }) };
}

export async function ping(pool) {
  const [rows] = await pool.query("SELECT 1 AS ok");
  return rows[0]?.ok === 1;
}

export async function closeDb(pool) {
  if (pool) await pool.end();
}

export { schema };
