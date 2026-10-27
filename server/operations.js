import {
  HttpError,
  audit,
  cleanText,
  money,
  parsePositiveInteger,
  parsePositiveNumber,
  requireRoles,
  requireStaff,
  requireText,
  serialNumber,
  withTransaction
} from "./core.js";
import { id, nowIso } from "./database.js";

const SHORTAGE_ORDER_STATUSES = [
  "PENDING_BANGBANG",
  "PENDING_PAYMENT",
  "PARTIALLY_PAID",
  "PENDING_SANLEI",
  "PREPARING",
  "BACKORDER",
  "PARTIALLY_SHIPPED"
];

export function listShortageProducts(db, user) {
  requireRoles(user, ["SUPER_ADMIN", "SANLEI_SALES", "BANGBANG_OPS"]);
  return db.prepare(`
    SELECT p.id, p.sku, p.name, p.vehicle_model, p.min_package,
      COALESCE((SELECT SUM(i.quantity - i.reserved) FROM inventory i WHERE i.product_id = p.id), 0) AS available,
      COALESCE((
        SELECT SUM(oi.quantity - oi.shipped_quantity)
        FROM order_items oi
        JOIN orders o ON o.id = oi.order_id
        WHERE oi.product_id = p.id
          AND o.status IN (${SHORTAGE_ORDER_STATUSES.map(() => "?").join(",")})
      ), 0) AS pending_demand
    FROM products p
    WHERE p.active = 1
    ORDER BY pending_demand - available DESC, p.name
  `).all(...SHORTAGE_ORDER_STATUSES)
    .filter((row) => row.pending_demand > row.available)
    .map((row) => ({
      productId: row.id,
      sku: row.sku,
      name: row.name,
      vehicleModel: row.vehicle_model,
      minPackage: row.min_package,
      available: row.available,
      pendingDemand: row.pending_demand,
      shortage: Math.max(0, row.pending_demand - row.available)
    }));
}

export function previewShortageAllocation(db, user, productId) {
  requireRoles(user, ["SUPER_ADMIN", "SANLEI_SALES", "BANGBANG_OPS"]);
  const product = db.prepare("SELECT * FROM products WHERE id = ? AND active = 1").get(productId);
  if (!product) throw new HttpError(404, "PRODUCT_NOT_FOUND", "产品不存在");
  const physicalStock = db.prepare(
    "SELECT COALESCE(SUM(quantity), 0) AS quantity FROM inventory WHERE product_id = ?"
  ).get(productId).quantity;
  const candidates = db.prepare(`
    SELECT oi.id AS order_item_id, oi.quantity, oi.shipped_quantity,
      COALESCE(SUM(CASE WHEN r.consumed_quantity < r.quantity
        THEN r.quantity - r.consumed_quantity ELSE 0 END), 0) AS current_reserved,
      o.id AS order_id, o.order_no, o.status, o.settlement_method, o.paid_amount,
      o.total_amount, o.created_at,
      c.id AS customer_id, c.name AS customer_name, c.grade, c.channel_type,
      c.credit_limit
    FROM order_items oi
    JOIN orders o ON o.id = oi.order_id
    JOIN customers c ON c.id = o.customer_id
    LEFT JOIN reservations r ON r.order_item_id = oi.id
    WHERE oi.product_id = ?
      AND o.status IN (${SHORTAGE_ORDER_STATUSES.map(() => "?").join(",")})
      AND oi.shipped_quantity < oi.quantity
    GROUP BY oi.id
    ORDER BY o.created_at
  `).all(productId, ...SHORTAGE_ORDER_STATUSES);

  if (candidates.length === 0) {
    throw new HttpError(404, "NO_PENDING_DEMAND", "该产品当前没有待履约订单");
  }
  const recent = db.prepare(`
    SELECT o.customer_id, COALESCE(SUM(o.total_amount), 0) AS amount
    FROM orders o
    WHERE o.status != 'CANCELLED' AND o.created_at >= datetime('now', '-90 days')
    GROUP BY o.customer_id
  `).all();
  const recentMap = new Map(recent.map((row) => [row.customer_id, row.amount]));
  const maxRecent = Math.max(1, ...candidates.map((row) => recentMap.get(row.customer_id) || 0));

  for (const candidate of candidates) {
    candidate.remaining = candidate.quantity - candidate.shipped_quantity;
    candidate.outstanding = customerCreditOutstanding(db, candidate.customer_id);
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

export function applyShortageAllocation(db, user, productId, targets = null) {
  requireRoles(user, ["SUPER_ADMIN", "SANLEI_SALES"]);
  const preview = previewShortageAllocation(db, user, productId);
  const targetMap = new Map();
  if (targets == null) {
    for (const candidate of preview.candidates) {
      targetMap.set(candidate.orderItemId, candidate.suggestedQuantity);
    }
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

  return withTransaction(db, () => {
    for (const candidate of preview.candidates) {
      releaseUnconsumedReservations(db, candidate.orderItemId);
      const item = db.prepare("SELECT * FROM order_items WHERE id = ?").get(candidate.orderItemId);
      db.prepare("UPDATE order_items SET reserved_quantity = ? WHERE id = ?")
        .run(item.shipped_quantity, item.id);
    }
    const packageSize = preview.product.minPackage;
    for (const [orderItemId, quantity] of targetMap) {
      if (quantity === 0) continue;
      if (quantity % packageSize !== 0) {
        throw new HttpError(400, "PACKAGE_QUANTITY", "人工调整数量必须保持最小包装倍数");
      }
      reserveForOrderItem(db, orderItemId, quantity);
    }
    audit(db, user, "APPLY_SHORTAGE_ALLOCATION", "PRODUCT", productId, {
      totalTarget,
      candidates: targetMap.size,
      strategy: preview.strategy
    });
    return previewShortageAllocation(db, user, productId);
  });
}

function releaseUnconsumedReservations(db, orderItemId) {
  const reservations = db.prepare(`
    SELECT * FROM reservations
    WHERE order_item_id = ? AND consumed_quantity < quantity
  `).all(orderItemId);
  for (const reservation of reservations) {
    const quantity = reservation.quantity - reservation.consumed_quantity;
    db.prepare(`
      UPDATE inventory SET reserved = MAX(0, reserved - ?), updated_at = ? WHERE id = ?
    `).run(quantity, nowIso(), reservation.inventory_id);
    db.prepare("UPDATE reservations SET consumed_quantity = quantity WHERE id = ?")
      .run(reservation.id);
  }
}

function reserveForOrderItem(db, orderItemId, quantity) {
  const item = db.prepare("SELECT * FROM order_items WHERE id = ?").get(orderItemId);
  if (!item) throw new HttpError(404, "ORDER_ITEM_NOT_FOUND", "订单产品行不存在");
  let remaining = quantity;
  const stocks = db.prepare(`
    SELECT * FROM inventory
    WHERE product_id = ? AND quantity > reserved
    ORDER BY CASE source_type WHEN 'REAL' THEN 0 ELSE 1 END, updated_at
  `).all(item.product_id);
  for (const stock of stocks) {
    if (remaining <= 0) break;
    const take = Math.min(remaining, stock.quantity - stock.reserved);
    if (take <= 0) continue;
    db.prepare("UPDATE inventory SET reserved = reserved + ?, updated_at = ? WHERE id = ?")
      .run(take, nowIso(), stock.id);
    db.prepare(`
      INSERT INTO reservations (id, order_item_id, inventory_id, quantity, consumed_quantity, created_at)
      VALUES (?, ?, ?, ?, 0, ?)
    `).run(id("reserve"), orderItemId, stock.id, take, nowIso());
    remaining -= take;
  }
  if (remaining > 0) throw new HttpError(409, "INSUFFICIENT_STOCK_DURING_ALLOCATION", "分配过程中库存发生变化，请重新预览");
  db.prepare("UPDATE order_items SET reserved_quantity = shipped_quantity + ? WHERE id = ?")
    .run(quantity, orderItemId);
}

function customerCreditOutstanding(db, customerId) {
  return db.prepare(`
    SELECT COALESCE(SUM(
      CASE WHEN settlement_method = 'CREDIT' AND status NOT IN ('COMPLETED', 'CANCELLED')
        THEN total_amount - paid_amount ELSE 0 END
    ), 0) AS amount
    FROM orders WHERE customer_id = ?
  `).get(customerId).amount;
}

export function transferInventory(db, user, payload) {
  requireRoles(user, ["SUPER_ADMIN", "SANLEI_WAREHOUSE"]);
  const quantity = parsePositiveInteger(payload.quantity, "移库数量");
  return withTransaction(db, () => {
    const source = db.prepare("SELECT * FROM inventory WHERE id = ?").get(payload.sourceId);
    const destination = db.prepare("SELECT * FROM inventory WHERE id = ?").get(payload.destinationId);
    if (!source || !destination) throw new HttpError(404, "INVENTORY_NOT_FOUND", "源库存或目标库存不存在");
    if (source.id === destination.id) throw new HttpError(400, "INVALID_TRANSFER", "源仓库与目标仓库不能相同");
    if (source.product_id !== destination.product_id) throw new HttpError(400, "INVALID_TRANSFER", "只能移动同一产品");
    if (source.quantity - source.reserved < quantity) {
      throw new HttpError(409, "INSUFFICIENT_TRANSFER_STOCK", "源库存可用量不足");
    }
    const transferId = serialNumber("MOVE");
    const timestamp = nowIso();
    db.prepare("UPDATE inventory SET quantity = quantity - ?, updated_at = ? WHERE id = ?")
      .run(quantity, timestamp, source.id);
    db.prepare("UPDATE inventory SET quantity = quantity + ?, updated_at = ? WHERE id = ?")
      .run(quantity, timestamp, destination.id);
    const insertMovement = db.prepare(`
      INSERT INTO inventory_movements (
        id, inventory_id, type, quantity, reference_type, reference_id, note, created_by, created_at
      ) VALUES (?, ?, ?, ?, 'TRANSFER', ?, ?, ?, ?)
    `);
    insertMovement.run(id("move"), source.id, "TRANSFER_OUT", -quantity, transferId,
      `移库至${destination.warehouse_name}`, user.id, timestamp);
    insertMovement.run(id("move"), destination.id, "TRANSFER_IN", quantity, transferId,
      `由${source.warehouse_name}移入`, user.id, timestamp);
    audit(db, user, "TRANSFER_INVENTORY", "INVENTORY", transferId, {
      sourceId: source.id, destinationId: destination.id, quantity
    });
    return { transferNo: transferId, sourceId: source.id, destinationId: destination.id, quantity };
  });
}

export function listInventoryMovements(db, user, productId = "") {
  requireStaff(user);
  const where = productId ? "WHERE i.product_id = ?" : "";
  return db.prepare(`
    SELECT m.*, i.warehouse_name, p.sku, p.name
    FROM inventory_movements m
    JOIN inventory i ON i.id = m.inventory_id
    JOIN products p ON p.id = i.product_id
    ${where}
    ORDER BY m.created_at DESC LIMIT 500
  `).all(...(productId ? [productId] : [])).map((row) => ({
    id: row.id,
    sku: row.sku,
    name: row.name,
    warehouseName: row.warehouse_name,
    type: row.type,
    quantity: row.quantity,
    referenceType: row.reference_type,
    referenceId: row.reference_id,
    note: row.note,
    createdAt: row.created_at
  }));
}

export function listFinancialRecords(db, user) {
  requireRoles(user, ["SUPER_ADMIN", "SANLEI_FINANCE", "BANGBANG_FINANCE", "BANGBANG_OPS"]);
  return {
    invoices: db.prepare(`
      SELECT i.*, o.order_no, c.name AS customer_name
      FROM invoices i JOIN orders o ON o.id = i.order_id JOIN customers c ON c.id = i.customer_id
      ORDER BY i.created_at DESC LIMIT 500
    `).all().map(mapInvoice),
    freight: db.prepare(`
      SELECT f.*, o.order_no, c.name AS customer_name
      FROM freight_charges f JOIN orders o ON o.id = f.order_id JOIN customers c ON c.id = f.customer_id
      ORDER BY f.created_at DESC LIMIT 500
    `).all().map(mapFreight),
    adjustments: db.prepare(`
      SELECT a.*, o.order_no, c.name AS customer_name
      FROM financial_adjustments a
      JOIN customers c ON c.id = a.customer_id
      LEFT JOIN orders o ON o.id = a.order_id
      ORDER BY a.created_at DESC LIMIT 500
    `).all().map(mapAdjustment)
  };
}

export function createInvoice(db, user, payload) {
  requireRoles(user, ["SUPER_ADMIN", "SANLEI_FINANCE"]);
  const order = db.prepare("SELECT * FROM orders WHERE id = ?").get(payload.orderId);
  if (!order) throw new HttpError(404, "ORDER_NOT_FOUND", "订单不存在");
  const amount = money(parsePositiveNumber(payload.amount || order.total_amount, "开票金额"));
  const invoiceId = id("invoice");
  const invoiceNo = serialNumber("INV");
  db.prepare(`
    INSERT INTO invoices (
      id, invoice_no, order_id, customer_id, title, tax_number,
      amount, tax_rate, status, note, issued_at, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', ?, NULL, ?)
  `).run(
    invoiceId, invoiceNo, order.id, order.customer_id,
    requireText(payload.title, "发票抬头", 300), cleanText(payload.taxNumber, 100),
    amount, Number(payload.taxRate ?? 13), cleanText(payload.note, 1000), nowIso()
  );
  audit(db, user, "CREATE_INVOICE", "INVOICE", invoiceId, { orderId: order.id, amount });
  return listFinancialRecords(db, user).invoices.find((item) => item.id === invoiceId);
}

export function updateInvoiceStatus(db, user, invoiceId, status) {
  requireRoles(user, ["SUPER_ADMIN", "SANLEI_FINANCE"]);
  if (!["PENDING", "ISSUED", "CANCELLED"].includes(status)) {
    throw new HttpError(400, "VALIDATION_ERROR", "发票状态无效");
  }
  const invoice = db.prepare("SELECT * FROM invoices WHERE id = ?").get(invoiceId);
  if (!invoice) throw new HttpError(404, "INVOICE_NOT_FOUND", "发票记录不存在");
  db.prepare("UPDATE invoices SET status = ?, issued_at = ? WHERE id = ?")
    .run(status, status === "ISSUED" ? nowIso() : null, invoiceId);
  audit(db, user, "UPDATE_INVOICE", "INVOICE", invoiceId, { status });
  return listFinancialRecords(db, user).invoices.find((item) => item.id === invoiceId);
}

export function createFreight(db, user, payload) {
  requireRoles(user, ["SUPER_ADMIN", "SANLEI_FINANCE", "SANLEI_WAREHOUSE"]);
  const order = db.prepare("SELECT * FROM orders WHERE id = ?").get(payload.orderId);
  if (!order) throw new HttpError(404, "ORDER_NOT_FOUND", "订单不存在");
  const freightId = id("freight");
  db.prepare(`
    INSERT INTO freight_charges (
      id, order_id, customer_id, amount, payer, status, description, settled_at, created_at
    ) VALUES (?, ?, ?, ?, ?, 'PENDING', ?, NULL, ?)
  `).run(
    freightId, order.id, order.customer_id,
    money(parsePositiveNumber(payload.amount, "运费金额")),
    payload.payer === "COMPANY" ? "COMPANY" : "CUSTOMER",
    cleanText(payload.description, 1000), nowIso()
  );
  audit(db, user, "CREATE_FREIGHT", "FREIGHT", freightId, { orderId: order.id, amount: payload.amount });
  return listFinancialRecords(db, user).freight.find((item) => item.id === freightId);
}

export function settleFinancialRecord(db, user, kind, recordId) {
  requireRoles(user, ["SUPER_ADMIN", "SANLEI_FINANCE", "BANGBANG_FINANCE"]);
  const table = { freight: "freight_charges", adjustment: "financial_adjustments" }[kind];
  if (!table) throw new HttpError(400, "VALIDATION_ERROR", "结算类型无效");
  const record = db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(recordId);
  if (!record) throw new HttpError(404, "FINANCIAL_RECORD_NOT_FOUND", "财务记录不存在");
  db.prepare(`UPDATE ${table} SET status = 'SETTLED', settled_at = ? WHERE id = ?`)
    .run(nowIso(), recordId);
  audit(db, user, "SETTLE_FINANCIAL_RECORD", kind.toUpperCase(), recordId);
  return listFinancialRecords(db, user);
}

export function createAdjustment(db, user, payload) {
  requireRoles(user, ["SUPER_ADMIN", "SANLEI_FINANCE", "BANGBANG_FINANCE"]);
  const customer = db.prepare("SELECT * FROM customers WHERE id = ?").get(payload.customerId);
  if (!customer) throw new HttpError(404, "CUSTOMER_NOT_FOUND", "客户不存在");
  if (payload.orderId && !db.prepare("SELECT 1 FROM orders WHERE id = ?").get(payload.orderId)) {
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
  db.prepare(`
    INSERT INTO financial_adjustments (
      id, adjustment_no, customer_id, order_id, type, amount,
      status, description, settled_at, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, 'PENDING', ?, NULL, ?)
  `).run(
    adjustmentId, adjustmentNo, customer.id, payload.orderId || null, type,
    money(amount), cleanText(payload.description, 1000), nowIso()
  );
  audit(db, user, "CREATE_FINANCIAL_ADJUSTMENT", "ADJUSTMENT", adjustmentId, { amount, type });
  return listFinancialRecords(db, user).adjustments.find((item) => item.id === adjustmentId);
}

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

function round4(value) {
  return Math.round(value * 10000) / 10000;
}
