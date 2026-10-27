import { cleanText, HttpError, id, money, nowIso, requireRoles, requireText, serialNumber } from "../lib/core.js";
import { all, first, run, withTransaction } from "../lib/sql.js";
import { auditSql } from "../lib/audit-sql.js";

const TYPES = ["RETURN", "CLAIM", "WRONG_ITEM", "REPLACEMENT", "MARKET_FEEDBACK"];
const STATUSES = ["REVIEWING", "APPROVED", "REJECTED", "CLOSED"];

function mapAfterSales(row) {
  return {
    id: row.id,
    caseNo: row.case_no,
    customerId: row.customer_id,
    customerName: row.customer_name,
    orderId: row.order_id,
    orderNo: row.order_no,
    type: row.type,
    status: row.status,
    description: row.description,
    claimAmount: money(row.claim_amount),
    resolution: row.resolution,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export async function listAfterSales(db, user) {
  const where = user.isCustomer ? "WHERE a.customer_id = ?" : "";
  const params = user.isCustomer ? [user.customerId] : [];
  const rows = await all(
    db.$client,
    `SELECT a.*, c.name AS customer_name, o.order_no
     FROM after_sales_cases a
     JOIN customers c ON c.id = a.customer_id
     LEFT JOIN orders o ON o.id = a.order_id
     ${where}
     ORDER BY a.created_at DESC LIMIT 300`,
    params
  );
  return rows.map(mapAfterSales);
}

export async function getAfterSalesCase(db, user, caseId) {
  const row = await first(
    db.$client,
    `SELECT a.*, c.name AS customer_name, o.order_no
     FROM after_sales_cases a
     JOIN customers c ON c.id = a.customer_id
     LEFT JOIN orders o ON o.id = a.order_id
     WHERE a.id = ?`,
    [caseId]
  );
  if (!row || (user.isCustomer && row.customer_id !== user.customerId)) {
    throw new HttpError(404, "AFTER_SALES_NOT_FOUND", "售后单不存在");
  }
  return mapAfterSales(row);
}

export async function createAfterSalesCase(db, user, payload) {
  const order = await first(db.$client, "SELECT * FROM orders WHERE id = ?", [payload.orderId]);
  if (!order) throw new HttpError(404, "ORDER_NOT_FOUND", "订单不存在");
  if (user.isCustomer && order.customer_id !== user.customerId) {
    throw new HttpError(404, "ORDER_NOT_FOUND", "订单不存在");
  }
  const type = cleanText(payload.type || "QUALITY").toUpperCase();
  if (!TYPES.includes(type)) throw new HttpError(400, "VALIDATION_ERROR", "售后类型无效");
  const caseId = id("case");
  const caseNo = serialNumber("AS");
  const createdAt = nowIso();
  await withTransaction(db, async (conn) => {
    await run(
      conn,
      `INSERT INTO after_sales_cases (id, case_no, customer_id, order_id, type, status, description,
         claim_amount, resolution, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 'OPEN', ?, ?, NULL, ?, ?)`,
      [
        caseId,
        caseNo,
        order.customer_id,
        order.id,
        type,
        requireText(payload.description, "问题描述", 2000),
        money(Number(payload.claimAmount) || 0),
        createdAt,
        createdAt
      ]
    );
    await auditSql(conn, user, "CREATE_AFTER_SALES", "AFTER_SALES", caseId, { type, orderId: order.id });
  });
  return getAfterSalesCase(db, user, caseId);
}

export async function updateAfterSalesStatus(db, user, caseId, status, resolution = "") {
  requireRoles(user, ["SANLEI_AFTERSALES", "SUPER_ADMIN"]);
  if (!STATUSES.includes(status)) throw new HttpError(400, "VALIDATION_ERROR", "售后状态无效");
  const existing = await first(db.$client, "SELECT * FROM after_sales_cases WHERE id = ?", [caseId]);
  if (!existing) throw new HttpError(404, "AFTER_SALES_NOT_FOUND", "售后单不存在");
  await withTransaction(db, async (conn) => {
    await run(conn, "UPDATE after_sales_cases SET status = ?, resolution = ?, updated_at = ? WHERE id = ?", [
      status,
      cleanText(resolution, 2000),
      nowIso(),
      caseId
    ]);
    await auditSql(conn, user, "UPDATE_AFTER_SALES", "AFTER_SALES", caseId, { status, resolution });
  });
  return getAfterSalesCase(db, user, caseId);
}
