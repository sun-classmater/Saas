import { id, nowIso } from "./core.js";

export async function auditSql(conn, user, action, entityType, entityId = null, details = null) {
  await conn.query(
    `INSERT INTO audit_logs (id, user_id, action, entity_type, entity_id, details, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [id("audit"), user?.id || null, action, entityType, entityId || null, details ? JSON.stringify(details) : null, nowIso()]
  );
}

export async function notifySql(conn, customerId, title, content) {
  const [users] = await conn.query(
    "SELECT id FROM users WHERE customer_id = ? AND active = 1 AND role LIKE 'CUSTOMER\\_%'",
    [customerId]
  );
  for (const user of users) {
    await conn.query(
      `INSERT INTO notifications (id, user_id, title, content, read_at, created_at)
       VALUES (?, ?, ?, ?, NULL, ?)`,
      [id("notice"), user.id, title, content, nowIso()]
    );
  }
}
