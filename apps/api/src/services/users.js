import { HttpError, cleanText, hashPassword, id, isDuplicateEntry, nowIso, requireText } from "../lib/core.js";
import { all, first, run, withTransaction } from "../lib/sql.js";
import { auditSql } from "../lib/audit-sql.js";

const STAFF_ROLES = new Set([
  "BANGBANG_OPS",
  "BANGBANG_FINANCE",
  "SANLEI_SALES",
  "SANLEI_WAREHOUSE",
  "SANLEI_FINANCE",
  "SANLEI_AFTERSALES"
]);

function mapUser(row) {
  return {
    id: row.id,
    username: row.username,
    displayName: row.display_name,
    phone: row.phone,
    role: row.role,
    customerName: row.customer_name,
    active: Boolean(Number(row.active)),
    createdAt: row.created_at
  };
}

export async function listUsers(db) {
  const rows = await all(
    db.$client,
    `SELECT u.id, u.username, u.display_name, u.phone, u.role, u.active, u.created_at,
       c.name AS customer_name
     FROM users u LEFT JOIN customers c ON c.id = u.customer_id
     ORDER BY u.created_at`
  );
  return rows.map(mapUser);
}

export async function createCustomerUser(db, user, payload) {
  const customer = await first(db.$client, "SELECT * FROM customers WHERE id = ?", [payload.customerId]);
  if (!customer) throw new HttpError(404, "CUSTOMER_NOT_FOUND", "客户不存在");
  const phone = requireText(payload.phone, "手机号", 30);
  const userId = id("user");
  const username = cleanText(payload.username || phone, 80);
  const displayName = requireText(payload.displayName || customer.name, "账号名称");
  try {
    await withTransaction(db, async (conn) => {
      await run(
        conn,
        `INSERT INTO users (id, username, password_hash, display_name, phone, wechat_openid,
           role, customer_id, active, created_at)
         VALUES (?, ?, NULL, ?, ?, NULL, 'CUSTOMER_BUYER', ?, 1, ?)`,
        [userId, username, displayName, phone, customer.id, nowIso()]
      );
      await auditSql(conn, user, "CREATE_CUSTOMER_USER", "USER", userId, { customerId: customer.id, phone });
    });
  } catch (error) {
    if (isDuplicateEntry(error)) throw new HttpError(409, "USER_EXISTS", "登录名或手机号已绑定其他账号");
    throw error;
  }
  return (await listUsers(db)).find((item) => item.id === userId);
}

export async function createStaffUser(db, user, payload) {
  const role = cleanText(payload.role).toUpperCase();
  if (!STAFF_ROLES.has(role)) throw new HttpError(400, "VALIDATION_ERROR", "内部角色无效");
  const password = requireText(payload.password, "登录密码", 200);
  if (password.length < 8) throw new HttpError(400, "WEAK_PASSWORD", "登录密码至少8位");
  const userId = id("user");
  const username = requireText(payload.username, "登录名", 80);
  const displayName = requireText(payload.displayName, "姓名", 100);
  try {
    await withTransaction(db, async (conn) => {
      await run(
        conn,
        `INSERT INTO users (id, username, password_hash, display_name, phone, wechat_openid,
           role, customer_id, active, created_at)
         VALUES (?, ?, ?, ?, ?, NULL, ?, NULL, 1, ?)`,
        [userId, username, hashPassword(password), displayName, cleanText(payload.phone, 30), role, nowIso()]
      );
      await auditSql(conn, user, "CREATE_STAFF_USER", "USER", userId, { role });
    });
  } catch (error) {
    if (isDuplicateEntry(error)) throw new HttpError(409, "USER_EXISTS", "登录名已存在");
    throw error;
  }
  return (await listUsers(db)).find((item) => item.id === userId);
}

export async function toggleUser(db, user, userId, active) {
  const existing = await first(db.$client, "SELECT * FROM users WHERE id = ?", [userId]);
  if (!existing) throw new HttpError(404, "USER_NOT_FOUND", "账号不存在");
  if (existing.role === "SUPER_ADMIN" && !active) {
    throw new HttpError(409, "CANNOT_DISABLE_ADMIN", "不能停用超级管理员");
  }
  await withTransaction(db, async (conn) => {
    await run(conn, "UPDATE users SET active = ? WHERE id = ?", [active ? 1 : 0, userId]);
    await auditSql(conn, user, active ? "ENABLE_USER" : "DISABLE_USER", "USER", userId);
  });
  return (await listUsers(db)).find((item) => item.id === userId);
}

export async function getAuditLogs(db) {
  const rows = await all(
    db.$client,
    `SELECT a.*, u.display_name
     FROM audit_logs a LEFT JOIN users u ON u.id = a.user_id
     ORDER BY a.created_at DESC LIMIT 500`
  );
  return rows.map((row) => ({
    id: row.id,
    userName: row.display_name || "系统",
    action: row.action,
    entityType: row.entity_type,
    entityId: row.entity_id,
    details: row.details,
    createdAt: row.created_at
  }));
}
