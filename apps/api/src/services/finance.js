import { HttpError, cleanText, id, money, nowIso, parsePositiveNumber, requireText, serialNumber } from "../lib/core.js";
import { all, first, run, withTransaction } from "../lib/sql.js";
import { auditSql } from "../lib/audit-sql.js";

function mapInvoice(row) {
  return {
    id: row.id,
    recordNo: row.invoice_no,
    orderNo: row.order_no,
    customerName: row.customer_name,
    title: row.title,
    taxNumber: row.tax_number,
    amount: money(row.amount),
    taxRate: row.tax_rate,
    status: row.status,
    note: row.note,
    issuedAt: row.issued_at,
    createdAt: row.created_at
  };
}

function mapFreight(row) {
  return {
    id: row.id,
    recordNo: row.id,
    orderNo: row.order_no,
    customerName: row.customer_name,
    amount: money(row.amount),
    payer: row.payer,
    status: row.status,
    description: row.description,
    settledAt: row.settled_at,
    createdAt: row.created_at
  };
}

function mapAdjustment(row) {
  return {
    id: row.id,
    recordNo: row.adjustment_no,
    orderNo: row.order_no,
    customerName: row.customer_name,
    type: row.type,
    amount: money(row.amount),
    status: row.status,
    description: row.description,
    settledAt: row.settled_at,
    createdAt: row.created_at
  };
}

export async function listFinancialRecords(db) {
  const invoices = await all(
    db.$client,
    `SELECT i.*, o.order_no, c.name AS customer_name
     FROM invoices i JOIN orders o ON o.id = i.order_id JOIN customers c ON c.id = i.customer_id
     ORDER BY i.created_at DESC LIMIT 500`
  );
  const freight = await all(
    db.$client,
    `SELECT f.*, o.order_no, c.name AS customer_name
     FROM freight_charges f JOIN orders o ON o.id = f.order_id JOIN customers c ON c.id = f.customer_id
     ORDER BY f.created_at DESC LIMIT 500`
  );
  const adjustments = await all(
    db.$client,
    `SELECT a.*, o.order_no, c.name AS customer_name
     FROM financial_adjustments a
     JOIN customers c ON c.id = a.customer_id
     LEFT JOIN orders o ON o.id = a.order_id
     ORDER BY a.created_at DESC LIMIT 500`
  );
  return {
    invoices: invoices.map(mapInvoice),
    freight: freight.map(mapFreight),
    adjustments: adjustments.map(mapAdjustment)
  };
}

export async function createInvoice(db, user, payload) {
  const order = await first(db.$client, "SELECT * FROM orders WHERE id = ?", [payload.orderId]);
  if (!order) throw new HttpError(404, "ORDER_NOT_FOUND", "订单不存在");
  const amount = money(parsePositiveNumber(payload.amount || order.total_amount, "开票金额"));
  const invoiceId = id("invoice");
  const invoiceNo = serialNumber("INV");
  await withTransaction(db, async (conn) => {
    await run(
      conn,
      `INSERT INTO invoices (id, invoice_no, order_id, customer_id, title, tax_number,
         amount, tax_rate, status, note, issued_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', ?, NULL, ?)`,
      [
        invoiceId,
        invoiceNo,
        order.id,
        order.customer_id,
        requireText(payload.title, "发票抬头", 300),
        cleanText(payload.taxNumber, 100),
        amount,
        Number(payload.taxRate ?? 13),
        cleanText(payload.note, 1000),
        nowIso()
      ]
    );
    await auditSql(conn, user, "CREATE_INVOICE", "INVOICE", invoiceId, { orderId: order.id, amount });
  });
  return (await listFinancialRecords(db)).invoices.find((item) => item.id === invoiceId);
}

export async function updateInvoiceStatus(db, user, invoiceId, status) {
  if (!["PENDING", "ISSUED", "CANCELLED"].includes(status)) {
    throw new HttpError(400, "VALIDATION_ERROR", "发票状态无效");
  }
  const invoice = await first(db.$client, "SELECT * FROM invoices WHERE id = ?", [invoiceId]);
  if (!invoice) throw new HttpError(404, "INVOICE_NOT_FOUND", "发票记录不存在");
  await withTransaction(db, async (conn) => {
    await run(conn, "UPDATE invoices SET status = ?, issued_at = ? WHERE id = ?", [
      status,
      status === "ISSUED" ? nowIso() : null,
      invoiceId
    ]);
    await auditSql(conn, user, "UPDATE_INVOICE", "INVOICE", invoiceId, { status });
  });
  return (await listFinancialRecords(db)).invoices.find((item) => item.id === invoiceId);
}

export async function createFreight(db, user, payload) {
  const order = await first(db.$client, "SELECT * FROM orders WHERE id = ?", [payload.orderId]);
  if (!order) throw new HttpError(404, "ORDER_NOT_FOUND", "订单不存在");
  const freightId = id("freight");
  await withTransaction(db, async (conn) => {
    await run(
      conn,
      `INSERT INTO freight_charges (id, order_id, customer_id, amount, payer, status, description, settled_at, created_at)
       VALUES (?, ?, ?, ?, ?, 'PENDING', ?, NULL, ?)`,
      [
        freightId,
        order.id,
        order.customer_id,
        money(parsePositiveNumber(payload.amount, "运费金额")),
        payload.payer === "COMPANY" ? "COMPANY" : "CUSTOMER",
        cleanText(payload.description, 1000),
        nowIso()
      ]
    );
    await auditSql(conn, user, "CREATE_FREIGHT", "FREIGHT", freightId, { orderId: order.id, amount: payload.amount });
  });
  return (await listFinancialRecords(db)).freight.find((item) => item.id === freightId);
}

export async function settleFinancialRecord(db, user, kind, recordId) {
  const table = { freight: "freight_charges", adjustment: "financial_adjustments" }[kind];
  if (!table) throw new HttpError(400, "VALIDATION_ERROR", "结算类型无效");
  const record = await first(db.$client, `SELECT * FROM ${table} WHERE id = ?`, [recordId]);
  if (!record) throw new HttpError(404, "FINANCIAL_RECORD_NOT_FOUND", "财务记录不存在");
  await withTransaction(db, async (conn) => {
    await run(conn, `UPDATE ${table} SET status = 'SETTLED', settled_at = ? WHERE id = ?`, [nowIso(), recordId]);
    await auditSql(conn, user, "SETTLE_FINANCIAL_RECORD", kind.toUpperCase(), recordId);
  });
  return listFinancialRecords(db);
}

export async function createAdjustment(db, user, payload) {
  const customer = await first(db.$client, "SELECT * FROM customers WHERE id = ?", [payload.customerId]);
  if (!customer) throw new HttpError(404, "CUSTOMER_NOT_FOUND", "客户不存在");
  if (payload.orderId && !(await first(db.$client, "SELECT 1 FROM orders WHERE id = ?", [payload.orderId]))) {
    throw new HttpError(404, "ORDER_NOT_FOUND", "订单不存在");
  }
  const type = cleanText(payload.type || "OTHER").toUpperCase();
  if (!["CLAIM", "RETURN_REFUND", "FREIGHT_ADJUSTMENT", "OTHER"].includes(type)) {
    throw new HttpError(400, "VALIDATION_ERROR", "调整款类型无效");
  }
  const adjustmentId = id("adjustment");
  const adjustmentNo = serialNumber("ADJ");
  const amount = Number(payload.amount);
  if (!Number.isFinite(amount) || amount === 0) {
    throw new HttpError(400, "VALIDATION_ERROR", "调整金额不能为0");
  }
  await withTransaction(db, async (conn) => {
    await run(
      conn,
      `INSERT INTO financial_adjustments (id, adjustment_no, customer_id, order_id, type, amount,
         status, description, settled_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, 'PENDING', ?, NULL, ?)`,
      [
        adjustmentId,
        adjustmentNo,
        customer.id,
        payload.orderId || null,
        type,
        money(amount),
        cleanText(payload.description, 1000),
        nowIso()
      ]
    );
    await auditSql(conn, user, "CREATE_FINANCIAL_ADJUSTMENT", "ADJUSTMENT", adjustmentId, { amount, type });
  });
  return (await listFinancialRecords(db)).adjustments.find((item) => item.id === adjustmentId);
}
