import { HttpError, id, money, nowIso, requireRoles } from "../lib/core.js";
import { all, first, run, withTransaction } from "../lib/sql.js";
import { auditSql } from "../lib/audit-sql.js";

const SHORTAGE_ORDER_STATUSES = [
  "PENDING_BANGBANG",
  "PENDING_PAYMENT",
  "PARTIALLY_PAID",
  "PENDING_SANLEI",
  "PREPARING",
  "BACKORDER",
  "PARTIALLY_SHIPPED"
];

const STATUS_PLACEHOLDERS = SHORTAGE_ORDER_STATUSES.map(() => "?").join(",");

function round4(value) {
  return Math.round(value * 10000) / 10000;
}

async function customerCreditOutstanding(conn, customerId) {
  const row = await first(
    conn,
    `SELECT COALESCE(SUM(CASE WHEN settlement_method = 'CREDIT' AND status NOT IN ('COMPLETED', 'CANCELLED')
       THEN total_amount - paid_amount ELSE 0 END), 0) AS amount
     FROM orders WHERE customer_id = ?`,
    [customerId]
  );
  return money(row.amount);
}

export async function listShortageProducts(db, user) {
  requireRoles(user, ["SUPER_ADMIN", "SANLEI_SALES", "BANGBANG_OPS"]);
  const rows = await all(
    db.$client,
    `SELECT p.id, p.sku, p.name, p.vehicle_model, p.min_package,
       COALESCE((SELECT SUM(i.quantity - i.reserved) FROM inventory i WHERE i.product_id = p.id), 0) AS available,
       COALESCE((
         SELECT SUM(oi.quantity - oi.shipped_quantity)
         FROM order_items oi
         JOIN orders o ON o.id = oi.order_id
         WHERE oi.product_id = p.id AND o.status IN (${STATUS_PLACEHOLDERS})
       ), 0) AS pending_demand
     FROM products p
     WHERE p.active = 1
     ORDER BY pending_demand - available DESC, p.name`,
    [...SHORTAGE_ORDER_STATUSES]
  );
  return rows
    .filter((row) => Number(row.pending_demand) > Number(row.available))
    .map((row) => ({
      productId: row.id,
      sku: row.sku,
      name: row.name,
      vehicleModel: row.vehicle_model,
      minPackage: row.min_package,
      available: Number(row.available),
      pendingDemand: Number(row.pending_demand),
      shortage: Math.max(0, Number(row.pending_demand) - Number(row.available))
    }));
}

export async function previewShortageAllocation(db, user, productId) {
  requireRoles(user, ["SUPER_ADMIN", "SANLEI_SALES", "BANGBANG_OPS"]);
  const product = await first(db.$client, "SELECT * FROM products WHERE id = ? AND active = 1", [productId]);
  if (!product) throw new HttpError(404, "PRODUCT_NOT_FOUND", "产品不存在");
  const physicalStock = Number(
    (await first(db.$client, "SELECT COALESCE(SUM(quantity), 0) AS quantity FROM inventory WHERE product_id = ?", [productId]))
      .quantity
  );
  const candidates = await all(
    db.$client,
    `SELECT oi.id AS order_item_id, oi.quantity, oi.shipped_quantity,
       COALESCE((
         SELECT SUM(r.quantity - r.consumed_quantity) FROM reservations r
         WHERE r.order_item_id = oi.id AND r.consumed_quantity < r.quantity
       ), 0) AS current_reserved,
       o.id AS order_id, o.order_no, o.status, o.settlement_method, o.paid_amount,
       o.total_amount, o.created_at,
       c.id AS customer_id, c.name AS customer_name, c.grade, c.channel_type,
       c.credit_limit
     FROM order_items oi
     JOIN orders o ON o.id = oi.order_id
     JOIN customers c ON c.id = o.customer_id
     WHERE oi.product_id = ?
       AND o.status IN (${STATUS_PLACEHOLDERS})
       AND oi.shipped_quantity < oi.quantity
     ORDER BY o.created_at`,
    [productId, ...SHORTAGE_ORDER_STATUSES]
  );
  if (candidates.length === 0) throw new HttpError(404, "NO_PENDING_DEMAND", "该产品当前没有待履约订单");

  const recentCutoff = new Date(Date.now() - 90 * 86400000).toISOString();
  const recent = await all(
    db.$client,
    `SELECT o.customer_id, COALESCE(SUM(o.total_amount), 0) AS amount
     FROM orders o
     WHERE o.status != 'CANCELLED' AND o.created_at >= ?
     GROUP BY o.customer_id`,
    [recentCutoff]
  );
  const recentMap = new Map(recent.map((row) => [row.customer_id, Number(row.amount)]));
  const maxRecent = Math.max(1, ...candidates.map((row) => recentMap.get(row.customer_id) || 0));

  for (const candidate of candidates) {
    candidate.remaining = candidate.quantity - candidate.shipped_quantity;
    candidate.outstanding = await customerCreditOutstanding(db.$client, candidate.customer_id);
    candidate.paidPriority = candidate.settlement_method === "PREPAY"
      ? (candidate.paid_amount > 0 ? 1 : 0.35)
      : 0.7;
    candidate.gradeScore = ({ "A+": 1, A: 0.9, "B+": 0.8, B: 0.7, C: 0.5 })[candidate.grade] || 0.5;
    candidate.channelScore = ({ "4S_GROUP": 1, WHOLESALER: 0.8, CHAIN: 0.6 })[candidate.channel_type] || 0.5;
    candidate.creditScore = candidate.credit_limit > 0
      ? Math.max(0, 1 - candidate.outstanding / candidate.credit_limit)
      : candidate.paidPriority;
    candidate.historyScore = Math.max(0.15, (recentMap.get(candidate.customer_id) || 0) / maxRecent);
    const ageDays = Math.max(0, (Date.now() - new Date(candidate.created_at).getTime()) / 86400000);
    candidate.urgencyScore = Math.min(1, 0.2 + ageDays / 30);
    candidate.score = round4(
      candidate.gradeScore * 0.3 +
      candidate.channelScore * 0.15 +
      candidate.creditScore * 0.15 +
      candidate.historyScore * 0.15 +
      candidate.urgencyScore * 0.15 +
      candidate.paidPriority * 0.1
    );
    candidate.weightedDemand = round4(candidate.remaining * candidate.score);
  }

  const allocatable = Math.max(0, physicalStock);
  const totalWeighted = candidates.reduce((sum, row) => sum + row.weightedDemand, 0);
  const packageSize = product.min_package;
  let targetTotal = 0;
  for (const candidate of candidates) {
    const raw = totalWeighted > 0 ? allocatable * candidate.weightedDemand / totalWeighted : 0;
    candidate.suggested = Math.min(
      candidate.remaining,
      Math.max(0, Math.floor(raw / packageSize) * packageSize)
    );
    candidate.fraction = raw - Math.floor(raw / packageSize) * packageSize;
    targetTotal += candidate.suggested;
  }
  let remainingStock = Math.max(0, allocatable - targetTotal);
  const ranked = [...candidates].sort((a, b) =>
    b.fraction - a.fraction || b.score - a.score || new Date(a.created_at) - new Date(b.created_at)
  );
  while (remainingStock >= packageSize) {
    let added = false;
    for (const candidate of ranked) {
      if (remainingStock < packageSize) break;
      if (candidate.suggested + packageSize <= candidate.remaining) {
        candidate.suggested += packageSize;
        remainingStock -= packageSize;
        added = true;
      }
    }
    if (!added) break;
  }

  return {
    product: {
      id: product.id,
      sku: product.sku,
      name: product.name,
      vehicleModel: product.vehicle_model,
      minPackage: product.min_package
    },
    physicalStock,
    totalDemand: candidates.reduce((sum, row) => sum + row.remaining, 0),
    unallocatedDemand: candidates.reduce((sum, row) => sum + row.remaining - row.suggested, 0),
    strategy: {
      name: "预付款优先 + 多维度加权公平分配",
      weights: {
        customerGrade: 30,
        channelType: 15,
        creditHealth: 15,
        recentPurchase: 15,
        orderUrgency: 15,
        paymentPriority: 10
      }
    },
    candidates: candidates.map((row) => ({
      orderItemId: row.order_item_id,
      orderId: row.order_id,
      orderNo: row.order_no,
      customerName: row.customer_name,
      grade: row.grade,
      channelType: row.channel_type,
      orderStatus: row.status,
      remainingQuantity: row.remaining,
      currentReserved: row.current_reserved,
      score: row.score,
      suggestedQuantity: row.suggested,
      unmetQuantity: row.remaining - row.suggested
    }))
  };
}

export async function applyShortageAllocation(db, user, productId, targets = null) {
  requireRoles(user, ["SUPER_ADMIN", "SANLEI_SALES"]);
  const preview = await previewShortageAllocation(db, user, productId);
  const targetMap = new Map();
  if (targets == null) {
    for (const candidate of preview.candidates) targetMap.set(candidate.orderItemId, candidate.suggestedQuantity);
  } else {
    if (!Array.isArray(targets)) throw new HttpError(400, "VALIDATION_ERROR", "分配结果格式无效");
    for (const target of targets) {
      const quantity = Number(target.quantity);
      if (!Number.isInteger(quantity) || quantity < 0) {
        throw new HttpError(400, "VALIDATION_ERROR", "分配数量必须为非负整数");
      }
      targetMap.set(target.orderItemId, quantity);
    }
  }
  const candidatesByItem = new Map(preview.candidates.map((candidate) => [candidate.orderItemId, candidate]));
  let totalTarget = 0;
  for (const [orderItemId, quantity] of targetMap) {
    const candidate = candidatesByItem.get(orderItemId);
    if (!candidate) throw new HttpError(400, "ALLOCATION_ITEM_NOT_FOUND", "分配订单行不属于当前候选范围");
    if (quantity > candidate.remainingQuantity) {
      throw new HttpError(400, "ALLOCATION_EXCEEDS_DEMAND", "分配数量不能超过订单剩余数量");
    }
    totalTarget += quantity;
  }
  if (totalTarget > preview.physicalStock) {
    throw new HttpError(400, "ALLOCATION_EXCEEDS_STOCK", "分配总量超过可分配库存");
  }

  await withTransaction(db, async (conn) => {
    for (const candidate of preview.candidates) {
      await releaseUnconsumedReservations(conn, candidate.orderItemId);
      const item = await first(conn, "SELECT * FROM order_items WHERE id = ?", [candidate.orderItemId]);
      await run(conn, "UPDATE order_items SET reserved_quantity = ? WHERE id = ?", [item.shipped_quantity, item.id]);
    }
    const packageSize = preview.product.minPackage;
    for (const [orderItemId, quantity] of targetMap) {
      if (quantity === 0) continue;
      if (quantity % packageSize !== 0) {
        throw new HttpError(400, "PACKAGE_QUANTITY", "人工调整数量必须保持最小包装倍数");
      }
      await reserveForOrderItem(conn, orderItemId, quantity);
    }
    await auditSql(conn, user, "APPLY_SHORTAGE_ALLOCATION", "PRODUCT", productId, {
      totalTarget,
      candidates: targetMap.size,
      strategy: preview.strategy
    });
  });
  return previewShortageAllocation(db, user, productId);
}

async function releaseUnconsumedReservations(conn, orderItemId) {
  const reservations = await all(
    conn,
    "SELECT * FROM reservations WHERE order_item_id = ? AND consumed_quantity < quantity",
    [orderItemId]
  );
  for (const reservation of reservations) {
    const quantity = reservation.quantity - reservation.consumed_quantity;
    await run(
      conn,
      "UPDATE inventory SET reserved = GREATEST(0, reserved - ?), updated_at = ? WHERE id = ?",
      [quantity, nowIso(), reservation.inventory_id]
    );
    await run(conn, "UPDATE reservations SET consumed_quantity = quantity WHERE id = ?", [reservation.id]);
  }
}

async function reserveForOrderItem(conn, orderItemId, quantity) {
  const item = await first(conn, "SELECT * FROM order_items WHERE id = ?", [orderItemId]);
  if (!item) throw new HttpError(404, "ORDER_ITEM_NOT_FOUND", "订单产品行不存在");
  let remaining = quantity;
  const stocks = await all(
    conn,
    `SELECT * FROM inventory
     WHERE product_id = ? AND quantity > reserved
     ORDER BY CASE source_type WHEN 'REAL' THEN 0 ELSE 1 END, updated_at`,
    [item.product_id]
  );
  for (const stock of stocks) {
    if (remaining <= 0) break;
    const take = Math.min(remaining, stock.quantity - stock.reserved);
    if (take <= 0) continue;
    await run(conn, "UPDATE inventory SET reserved = reserved + ?, updated_at = ? WHERE id = ?", [take, nowIso(), stock.id]);
    await run(
      conn,
      `INSERT INTO reservations (id, order_item_id, inventory_id, quantity, consumed_quantity, created_at)
       VALUES (?, ?, ?, ?, 0, ?)`,
      [id("reserve"), orderItemId, stock.id, take, nowIso()]
    );
    remaining -= take;
  }
  if (remaining > 0) throw new HttpError(409, "INSUFFICIENT_STOCK_DURING_ALLOCATION", "分配过程中库存发生变化，请重新预览");
  await run(conn, "UPDATE order_items SET reserved_quantity = shipped_quantity + ? WHERE id = ?", [quantity, orderItemId]);
}
