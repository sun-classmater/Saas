import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { drizzle } from "drizzle-orm/mysql2";
import { and, eq } from "drizzle-orm";
import * as schema from "@saas/db/schema";

const repoRoot = path.resolve(import.meta.dirname, "../../..");
const ddl = fs.readFileSync(path.join(repoRoot, "packages/db/sql/001_init.sql"), "utf8");

function ddlSchema() {
  const tables = new Map();
  for (const match of ddl.matchAll(/CREATE TABLE IF NOT EXISTS `([a-z_]+)` \(([\s\S]*?)\n\) ENGINE/g)) {
    const columns = [];
    for (const line of match[2].split("\n")) {
      const column = line.trim().match(/^`([a-z_]+)`\s+(VARCHAR|TEXT|INT|DECIMAL)/);
      if (column) columns.push(column[1]);
    }
    tables.set(match[1], columns);
  }
  return tables;
}

const drizzleSchema = () => {
  const tables = new Map();
  for (const value of Object.values(schema)) {
    if (!value || typeof value !== "object") continue;
    const name = value[Symbol.for("drizzle:Name")];
    if (!name) continue;
    const columns = Object.entries(value)
      .filter(([, column]) => column && typeof column === "object" && typeof column.name === "string")
      .map(([, column]) => column.name);
    tables.set(name, columns);
  }
  return tables;
};

test("Drizzle schema 与 001_init.sql 的 26 张表、列完全一致", () => {
  const fromDdl = ddlSchema();
  const fromSchema = drizzleSchema();
  assert.equal(fromSchema.size, 26);
  assert.equal(fromDdl.size, 26);
  assert.deepEqual([...fromSchema.keys()].sort(), [...fromDdl.keys()].sort());
  for (const [table, columns] of fromDdl) {
    assert.deepEqual(
      [...fromSchema.get(table)].sort(),
      [...columns].sort(),
      `表 ${table} 列不一致`
    );
  }
});

test("Drizzle mock 可生成登录/会话/通知 SQL", () => {
  const db = drizzle.mock({ schema, mode: "default" });
  const login = db
    .select()
    .from(schema.users)
    .where(and(eq(schema.users.username, "admin"), eq(schema.users.active, 1)))
    .limit(1)
    .toSQL();
  assert.match(login.sql, /select .*`display_name`.* from `users`/);
  assert.deepEqual(login.params, ["admin", 1, 1]);

  const insert = db
    .insert(schema.sessions)
    .values({ token: "t", userId: "u", expiresAt: "2026", createdAt: "2026" })
    .toSQL();
  assert.match(insert.sql, /insert into `sessions` \(`token`, `user_id`, `expires_at`, `created_at`\)/);

  const update = db
    .update(schema.notifications)
    .set({ readAt: "2026" })
    .where(eq(schema.notifications.id, "n"))
    .toSQL();
  assert.match(update.sql, /update `notifications` set `read_at` = \?/);
});

test("所有表都能生成 SELECT 语句", () => {
  const db = drizzle.mock({ schema, mode: "default" });
  for (const [name, table] of Object.entries(schema)) {
    if (!table || typeof table !== "object") continue;
    if (!table[Symbol.for("drizzle:Name")]) continue;
    const sql = db.select().from(table).toSQL();
    assert.match(sql.sql, /^select .* from `/);
    assert.ok(name.length > 0);
  }
});
