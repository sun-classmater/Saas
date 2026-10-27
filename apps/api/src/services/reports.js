import { all, first } from "../lib/sql.js";
import { money, nowIso } from "../lib/core.js";
import { listOrders } from "./orders.js";

export async function planExecutionReport(db) {
  const rows = await all(
    db.$client,
    `SELECT p.plan_month, c.name AS customer_name, c.grade,
       SUM(pi.quantity) AS planned_quantity,
       SUM(pi.ordered_quantity) AS ordered_quantity,
       ROUND(CASE WHEN SUM(pi.quantity) > 0
         THEN SUM(pi.ordered_quantity) * 100.0 / SUM(pi.quantity) ELSE 0 END, 2) AS execution_rate
     FROM plans p
     JOIN customers c ON c.id = p.customer_id
     JOIN plan_items pi ON pi.plan_id = p.id
     WHERE p.status = 'APPROVED'
     GROUP BY p.id
     ORDER BY p.plan_month DESC, c.name`
  );
  return rows.map((row) => ({
    planMonth: row.plan_month,
    customerName: row.customer_name,
    grade: row.grade,
    plannedQuantity: row.planned_quantity,
    orderedQuantity: row.ordered_quantity,
    executionRate: row.execution_rate
  }));
}

export async function dashboard(db, user) {
  const now = nowIso();
  const pendingPlan = (
    await first(
      db.$client,
      "SELECT COUNT(*) AS count FROM plans WHERE status IN ('BANGBANG_REVIEW', 'SANLEI_REVIEW')"
    )
  ).count;
  const pendingConfirm = (
    await first(db.$client, "SELECT COUNT(*) AS count FROM orders WHERE status = 'PENDING_BANGBANG'")
  ).count;
  const pendingPayment = (
    await first(
      db.$client,
      "SELECT COUNT(*) AS count FROM orders WHERE status IN ('PENDING_PAYMENT', 'PARTIALLY_PAID')"
    )
  ).count;
  const preparing = (
    await first(
      db.$client,
      "SELECT COUNT(*) AS count FROM orders WHERE status IN ('PENDING_SANLEI', 'PREPARING', 'PARTIALLY_SHIPPED')"
    )
  ).count;
  const monthAmount = (
    await first(
      db.$client,
      `SELECT COALESCE(SUM(total_amount), 0) AS amount FROM orders
       WHERE status != 'CANCELLED' AND SUBSTR(created_at, 1, 7) = SUBSTR(?, 1, 7)`,
      [now]
    )
  ).amount;
  const overdueCutoff = new Date(Date.now() - 3 * 86400000).toISOString();
  const overduePrepay = (
    await first(
      db.$client,
      `SELECT COUNT(*) AS count FROM orders
       WHERE settlement_method = 'PREPAY' AND status IN ('PENDING_PAYMENT', 'PARTIALLY_PAID')
         AND created_at < ?`,
      [overdueCutoff]
    )
  ).count;
  const lowStockRows = await all(
    db.$client,
    `SELECT p.id AS product_id, p.sku, p.name,
       COALESCE(SUM(CASE WHEN i.source_type = 'REAL' THEN i.quantity - i.reserved ELSE 0 END), 0) AS available
     FROM products p LEFT JOIN inventory i ON i.product_id = p.id
     GROUP BY p.id HAVING available <= 20 ORDER BY available`
  );
  return {
    metrics: {
      pendingPlan,
      pendingConfirm,
      pendingPayment,
      preparing,
      monthAmount: money(monthAmount),
      overduePrepay
    },
    lowStock: lowStockRows.map((row) => ({
      productId: row.product_id,
      sku: row.sku,
      name: row.name,
      available: Number(row.available)
    })),
    recentOrders: (await listOrders(db, user)).slice(0, 8)
  };
}
