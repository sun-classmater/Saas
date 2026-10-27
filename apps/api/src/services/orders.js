import { HttpError, id, money, nowIso, parsePositiveInteger, parsePositiveNumber, serialNumber, settlementWeek } from "../lib/core.js";
import { all, first, run, withTransaction } from "../lib/sql.js";
import { auditSql, notifySql } from "../lib/audit-sql.js";
import { createMiniProgramPayment, isWechatMock } from "../lib/wechat.js";

const ORDER_TYPES = new Set(["NORMAL", "PREPAY", "NEW_PRODUCT", "PLAN", "TEMPORARY"]);
const SETTLEMENT_METHODS = new Set(["CREDIT", "PREPAY"]);
const ACTIVE_STATUSES = [
  "PENDING_BANGBANG",
  "PENDING_PAYMENT",
  "PARTIALLY_PAID",
  "PENDING_SANLEI",
  "PREPARING",
  "BACKORDER",
  "PARTIALLY_SHIPPED"
];

export function mapOrderRow(row) {
  return {
    id: row.id,
    orderNo: row.order_no,
    groupId: row.group_id,
    groupNo: row.group_no,
    customerId: row.customer_id,
    customerName: row.customer_name,
    customerGrade: row.customer_grade,
    vehicleModel: row.vehicle_model,
    orderType: row.order_type,
    settlementMethod: row.settlement_method,
    status: row.status,
    totalAmount: money(row.total_amount),
    paidAmount: money(row.paid_amount),
    shippedAmount: money(row.shipped_amount),
    unpaidAmount: money(row.total_amount - row.paid_amount),
    unshippedAmount: money(row.total_amount - row.shipped_amount),
    prepayRatio: Number(row.prepay_ratio),
    allowOverpayment: Boolean(Number(row.allow_overpayment)),
    batchLimit: row.batch_limit,
    planId: row.plan_id,
    planWeek: row.plan_week,
    customerNote: row.customer_note,
    opsNote: row.ops_note,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export async function listOrders(db, user, query = {}) {
  const conditions = [];
  const params = [];
  if (user.isCustomer) {
    conditions.push("o.customer_id = ?");
    params.push(user.customerId);
  } else if (query.customerId) {
    conditions.push("o.customer_id = ?");
    params.push(query.customerId);
  }
  if (query.status) {
    conditions.push("o.status = ?");
    params.push(query.status);
  }
  if (query.type) {
    conditions.push("o.order_type = ?");
    params.push(query.type);
  }
  if (query.keyword) {
    conditions.push("(o.order_no LIKE ? OR c.name LIKE ? OR o.vehicle_model LIKE ?)");
    const keyword = `%${String(query.keyword).trim().slice(0, 1000)}%`;
    params.push(keyword, keyword, keyword);
  }
  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const rows = await all(
    db.$client,
    `SELECT o.*, g.group_no, c.name AS customer_name, c.grade AS customer_grade
     FROM orders o
     JOIN order_groups g ON g.id = o.group_id
     JOIN customers c ON c.id = o.customer_id
     ${where}
     ORDER BY o.created_at DESC
     LIMIT 500`,
    params
  );
  return rows.map(mapOrderRow);
}

export async function getOrder(db, user, orderId) {
  const row = await first(
    db.$client,
    `SELECT o.*, g.group_no, c.name AS customer_name, c.grade AS customer_grade
     FROM orders o
     JOIN order_groups g ON g.id = o.group_id
     JOIN customers c ON c.id = o.customer_id
     WHERE o.id = ?`,
    [orderId]
  );
  if (!row) throw new HttpError(404, "ORDER_NOT_FOUND", "订单不存在");
  if (user.isCustomer && row.customer_id !== user.customerId) {
    throw new HttpError(404, "ORDER_NOT_FOUND", "订单不存在");
  }
  const order = mapOrderRow(row);
  order.items = (
    await all(
      db.$client,
      `SELECT oi.*, p.sku, p.name, p.category, p.vehicle_model, p.min_package
       FROM order_items oi
       JOIN products p ON p.id = oi.product_id
       WHERE oi.order_id = ?
       ORDER BY p.category, p.name`,
      [orderId]
    )
  ).map((item) => ({
    id: item.id,
    productId: item.product_id,
    sku: item.sku,
    name: item.name,
    category: item.category,
    vehicleModel: item.vehicle_model,
    minPackage: item.min_package,
    quantity: item.quantity,
    unitPrice: money(item.unit_price),
    amount: money(item.amount),
    reservedQuantity: item.reserved_quantity,
    shippedQuantity: item.shipped_quantity,
    remainingQuantity: item.quantity - item.shipped_quantity
  }));
  order.payments = (
    await all(
      db.$client,
      `SELECT id, payment_no, amount, channel, status, transaction_id, paid_at, created_at
       FROM payments WHERE order_id = ? ORDER BY created_at DESC`,
      [orderId]
    )
  ).map((payment) => ({
    id: payment.id,
    paymentNo: payment.payment_no,
    amount: money(payment.amount),
    channel: payment.channel,
    status: payment.status,
    transactionId: payment.transaction_id,
    paidAt: payment.paid_at,
    createdAt: payment.created_at
  }));
  order.shipments = (
    await all(
      db.$client,
      `SELECT s.*, GROUP_CONCAT(CONCAT(p.name, ' ×', si.quantity) SEPARATOR '、') AS summary
       FROM shipments s
       LEFT JOIN shipment_items si ON si.shipment_id = s.id
       LEFT JOIN products p ON p.id = si.product_id
       WHERE s.order_id = ?
       GROUP BY s.id
       ORDER BY s.batch_no`,
      [orderId]
    )
  ).map((shipment) => ({
    id: shipment.id,
    shipmentNo: shipment.shipment_no,
    batchNo: shipment.batch_no,
    status: shipment.status,
    logisticsCompany: shipment.logistics_company,
    trackingNo: shipment.tracking_no,
    dispatchLocation: shipment.dispatch_location,
    deliveryMode: shipment.delivery_mode,
    amount: money(shipment.amount),
    shippedAt: shipment.shipped_at,
    receivedAt: shipment.received_at,
    summary: shipment.summary
  }));
  order.group = await first(db.$client, "SELECT * FROM order_groups WHERE id = ?", [row.group_id]);
  order.group.siblingOrders = (
    await all(
      db.$client,
      `SELECT id, order_no, vehicle_model, total_amount, status
       FROM orders WHERE group_id = ? ORDER BY created_at`,
      [row.group_id]
    )
  ).map((sibling) => ({
    id: sibling.id,
    orderNo: sibling.order_no,
    vehicleModel: sibling.vehicle_model,
    totalAmount: money(sibling.total_amount),
    status: sibling.status
  }));
  delete order.group.id;
  delete order.group.customer_id;
  return order;
}

async function priceFor(conn, customerId, priceTier, productId) {
  const specific = await first(
    conn,
    "SELECT price FROM customer_prices WHERE customer_id = ? AND product_id = ?",
    [customerId, productId]
  );
  if (specific) return { price: money(specific.price), source: "CUSTOMER_SPECIFIC" };
  const tier = await first(
    conn,
    "SELECT price FROM price_rules WHERE price_tier = ? AND product_id = ?",
    [priceTier, productId]
  );
  if (tier) return { price: money(tier.price), source: "PRICE_TIER" };
  throw new HttpError(400, "PRICE_NOT_CONFIGURED", "该产品尚未配置当前客户可用价格");
}

export async function createOrder(db, user, payload) {
  const customerId = user.isCustomer ? user.customerId : payload.customerId;
  const customer = await first(db.$client, "SELECT * FROM customers WHERE id = ? AND active = 1", [customerId]);
  if (!customer) throw new HttpError(400, "CUSTOMER_NOT_FOUND", "客户不存在或已停用");
  const orderType = String(payload.orderType || "NORMAL").trim().toUpperCase();
  if (!ORDER_TYPES.has(orderType)) throw new HttpError(400, "VALIDATION_ERROR", "订单类型无效");

  let settlementMethod = String(payload.settlementMethod || customer.settlement_method).trim().toUpperCase();
  if (["PREPAY", "NEW_PRODUCT"].includes(orderType)) settlementMethod = "PREPAY";
  if (customer.settlement_method === "PREPAY") settlementMethod = "PREPAY";
  if (!SETTLEMENT_METHODS.has(settlementMethod)) {
    throw new HttpError(400, "VALIDATION_ERROR", "结算方式无效");
  }
  if (!Array.isArray(payload.items) || payload.items.length === 0) {
    throw new HttpError(400, "VALIDATION_ERROR", "订单至少需要包含一个产品");
  }
  if (payload.items.length > 200) throw new HttpError(400, "VALIDATION_ERROR", "单次最多提交200个产品行");

  const merged = new Map();
  for (const rawItem of payload.items) {
    const productId = String(rawItem.productId || "").trim();
    if (!productId) throw new HttpError(400, "VALIDATION_ERROR", "产品不能为空");
    const quantity = parsePositiveInteger(rawItem.quantity, "数量");
    merged.set(productId, (merged.get(productId) || 0) + quantity);
  }

  let plan = null;
  const planWeek = payload.planWeek == null ? null : parsePositiveInteger(payload.planWeek, "计划周");
  if (orderType === "PLAN") {
    if (!payload.planId || !planWeek || planWeek > 6) {
      throw new HttpError(400, "VALIDATION_ERROR", "计划订单必须选择已审核计划和计划周");
    }
    plan = await first(db.$client, "SELECT * FROM plans WHERE id = ? AND customer_id = ?", [payload.planId, customerId]);
    if (!plan || plan.status !== "APPROVED") {
      throw new HttpError(400, "PLAN_NOT_APPROVED", "只能从已审核通过的计划创建计划订单");
    }
  }

  const normalizedItems = [];
  for (const [productId, quantity] of merged) {
    const product = await first(db.$client, "SELECT * FROM products WHERE id = ? AND active = 1", [productId]);
    if (!product) throw new HttpError(400, "PRODUCT_NOT_FOUND", "产品不存在或已停用");
    if (quantity % product.min_package !== 0) {
      throw new HttpError(400, "PACKAGE_QUANTITY", `${product.name}数量必须为${product.min_package}的最小包装倍数`);
    }
    const priced = await priceFor(db.$client, customerId, customer.price_tier, productId);
    if (plan) {
      const planItem = await first(
        db.$client,
        "SELECT * FROM plan_items WHERE plan_id = ? AND week_no = ? AND product_id = ?",
        [plan.id, planWeek, productId]
      );
      if (!planItem) throw new HttpError(400, "PLAN_ITEM_NOT_FOUND", `${product.name}不在该计划周内`);
      if (planItem.ordered_quantity + quantity > planItem.quantity) {
        throw new HttpError(400, "PLAN_QUANTITY_EXCEEDED", `${product.name}超出该计划周剩余可下单数量`);
      }
    }
    normalizedItems.push({
      product,
      quantity,
      unitPrice: priced.price,
      amount: money(priced.price * quantity),
      priceSource: priced.source
    });
  }

  return withTransaction(db, async (conn) => {
    const groupId = id("group");
    const groupNo = serialNumber("SO");
    const createdAt = nowIso();
    const week = settlementWeek();
    await run(
      conn,
      `INSERT INTO order_groups (id, group_no, customer_id, settlement_week, settlement_method, currency, tax_mode, created_at)
       VALUES (?, ?, ?, ?, ?, 'CNY', 'INCLUDED', ?)`,
      [groupId, groupNo, customerId, week, settlementMethod, createdAt]
    );

    const byVehicle = new Map();
    for (const item of normalizedItems) {
      const key = item.product.vehicle_model;
      if (!byVehicle.has(key)) byVehicle.set(key, []);
      byVehicle.get(key).push(item);
    }

    const createdOrders = [];
    for (const [vehicleModel, items] of byVehicle) {
      const orderId = id("order");
      const orderNo = serialNumber("OD");
      const totalAmount = money(items.reduce((sum, item) => sum + item.amount, 0));
      await run(
        conn,
        `INSERT INTO orders (id, order_no, group_id, customer_id, vehicle_model, order_type, settlement_method,
          status, total_amount, paid_amount, shipped_amount, prepay_ratio, allow_overpayment,
          batch_limit, plan_id, plan_week, customer_note, ops_note, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'PENDING_BANGBANG', ?, 0, 0, ?, ?, ?, ?, ?, ?, NULL, ?, ?)`,
        [
          orderId, orderNo, groupId, customerId, vehicleModel, orderType, settlementMethod,
          totalAmount, customer.prepay_ratio, customer.allow_overpayment, customer.batch_limit,
          plan?.id || null, planWeek, String(payload.note || "").trim().slice(0, 1000), createdAt, createdAt
        ]
      );
      for (const item of items) {
        const itemId = id("item");
        await run(
          conn,
          `INSERT INTO order_items (id, order_id, product_id, quantity, unit_price, amount, reserved_quantity, shipped_quantity)
           VALUES (?, ?, ?, ?, ?, ?, 0, 0)`,
          [itemId, orderId, item.product.id, item.quantity, item.unitPrice, item.amount]
        );
        if (plan) {
          await run(
            conn,
            "UPDATE plan_items SET ordered_quantity = ordered_quantity + ? WHERE plan_id = ? AND week_no = ? AND product_id = ?",
            [item.quantity, plan.id, planWeek, item.product.id]
          );
        }
      }
      createdOrders.push(orderId);
    }
    await auditSql(conn, user, "CREATE_ORDER", "ORDER_GROUP", groupId, {
      orderType,
      settlementMethod,
      totalAmount: money(normalizedItems.reduce((sum, item) => sum + item.amount, 0))
    });
    await notifySql(conn, customerId, "订单已提交", `订单${groupNo}已提交，等待邦邦确认。`);
    return {
      groupId,
      groupNo,
      orderIds: createdOrders,
      totalAmount: money(normalizedItems.reduce((sum, item) => sum + item.amount, 0))
    };
  });
}

async function customerOutstandingConn(conn, customerId) {
  const row = await first(
    conn,
    `SELECT COALESCE(SUM(CASE WHEN settlement_method = 'CREDIT' AND status NOT IN ('COMPLETED', 'CANCELLED')
       THEN total_amount - paid_amount ELSE 0 END), 0) AS outstanding
     FROM orders WHERE customer_id = ?`,
    [customerId]
  );
  return money(row.outstanding);
}

export async function confirmOrder(db, user, orderId, note = "") {
  await withTransaction(db, async (conn) => {
    const order = await first(
      conn,
      `SELECT o.*, c.credit_limit, c.name AS customer_name
       FROM orders o JOIN customers c ON c.id = o.customer_id WHERE o.id = ?`,
      [orderId]
    );
    if (!order) throw new HttpError(404, "ORDER_NOT_FOUND", "订单不存在");
    if (order.status !== "PENDING_BANGBANG") {
      throw new HttpError(409, "INVALID_ORDER_STATUS", "订单当前状态不能由邦邦确认");
    }
    if (order.settlement_method === "CREDIT") {
      const outstanding = await customerOutstandingConn(conn, order.customer_id);
      if (outstanding > Number(order.credit_limit)) {
        throw new HttpError(409, "CREDIT_LIMIT_EXCEEDED", "客户应收已超过授信额度，请改为预付款或调整额度");
      }
    }
    await reserveStock(conn, order);
    let nextStatus = "PENDING_SANLEI";
    if (order.settlement_method === "PREPAY") {
      const threshold = money(order.total_amount * order.prepay_ratio);
      nextStatus = order.paid_amount > 0
        ? (order.paid_amount >= threshold ? "PENDING_SANLEI" : "PARTIALLY_PAID")
        : "PENDING_PAYMENT";
    }
    await run(
      conn,
      "UPDATE orders SET status = ?, ops_note = COALESCE(NULLIF(?, ''), ops_note), updated_at = ? WHERE id = ?",
      [nextStatus, String(note || "").trim().slice(0, 1000), nowIso(), orderId]
    );
    await auditSql(conn, user, "CONFIRM_ORDER", "ORDER", orderId, { nextStatus });
    await notifySql(conn, order.customer_id, "订单已确认", `订单${order.order_no}已由邦邦确认。`);
  });
  return getOrder(db, user, orderId);
}

async function reserveStock(conn, order) {
  const items = await all(conn, "SELECT * FROM order_items WHERE order_id = ?", [order.id]);
  for (const item of items) {
    let needed = item.quantity;
    const stocks = await all(
      conn,
      `SELECT * FROM inventory
       WHERE product_id = ? AND quantity > reserved
       ORDER BY CASE source_type WHEN 'REAL' THEN 0 ELSE 1 END, updated_at`,
      [item.product_id]
    );
    for (const stock of stocks) {
      if (needed <= 0) break;
      const available = Math.max(0, stock.quantity - stock.reserved);
      const take = Math.min(available, needed);
      if (take <= 0) continue;
      await run(conn, "UPDATE inventory SET reserved = reserved + ?, updated_at = ? WHERE id = ?", [take, nowIso(), stock.id]);
      await run(
        conn,
        `INSERT INTO reservations (id, order_item_id, inventory_id, quantity, consumed_quantity, created_at)
         VALUES (?, ?, ?, ?, 0, ?)`,
        [id("reserve"), item.id, stock.id, take, nowIso()]
      );
      needed -= take;
    }
    await run(conn, "UPDATE order_items SET reserved_quantity = ? WHERE id = ?", [item.quantity - needed, item.id]);
  }
}

export async function acceptOrder(db, user, orderId) {
  await withTransaction(db, async (conn) => {
    const order = await first(conn, "SELECT * FROM orders WHERE id = ?", [orderId]);
    if (!order) throw new HttpError(404, "ORDER_NOT_FOUND", "订单不存在");
    if (order.status !== "PENDING_SANLEI") {
      throw new HttpError(409, "INVALID_ORDER_STATUS", "订单未达到三磊接单条件");
    }
    await run(conn, "UPDATE orders SET status = 'PREPARING', updated_at = ? WHERE id = ?", [nowIso(), orderId]);
    await auditSql(conn, user, "ACCEPT_ORDER", "ORDER", orderId);
    await notifySql(conn, order.customer_id, "三磊已接单", `订单${order.order_no}正在备货。`);
  });
  return getOrder(db, user, orderId);
}

export async function createPayment(db, user, payload) {
  const order = await first(db.$client, "SELECT * FROM orders WHERE id = ?", [payload.orderId]);
  if (!order) throw new HttpError(404, "ORDER_NOT_FOUND", "订单不存在");
  if (user.isCustomer && order.customer_id !== user.customerId) {
    throw new HttpError(404, "ORDER_NOT_FOUND", "订单不存在");
  }
  if (order.settlement_method !== "PREPAY") {
    throw new HttpError(409, "PAYMENT_NOT_REQUIRED", "该订单不是预付款订单");
  }
  if (!["PENDING_PAYMENT", "PARTIALLY_PAID"].includes(order.status)) {
    throw new HttpError(409, "INVALID_ORDER_STATUS", "订单当前状态不能发起付款");
  }
  const amount = money(parsePositiveNumber(payload.amount, "付款金额"));
  if (order.paid_amount + amount > order.total_amount) {
    throw new HttpError(400, "PAYMENT_EXCEEDS_TOTAL", "付款金额不能超过订单未付金额");
  }
  const paymentId = id("pay");
  const paymentNo = serialNumber("PAY");
  const createdAt = nowIso();
  let prepayId = null;
  let payParams = null;
  if (isWechatMock()) {
    prepayId = `mock_${paymentId}`;
  } else {
    const wechatPayment = await createMiniProgramPayment({
      orderNo: paymentNo,
      amount,
      openid: user.wechatOpenid,
      description: `三磊车邻汇预付款-${order.order_no}`
    });
    prepayId = wechatPayment.prepayId;
    payParams = wechatPayment.payParams;
  }
  await run(
    db.$client,
    `INSERT INTO payments (id, payment_no, customer_id, order_id, amount, channel, status,
       transaction_id, prepay_id, paid_at, created_at)
     VALUES (?, ?, ?, ?, ?, 'WECHAT', 'PENDING', NULL, ?, NULL, ?)`,
    [paymentId, paymentNo, order.customer_id, order.id, amount, prepayId, createdAt]
  );
  await auditSql(db.$client, user, "CREATE_PAYMENT", "PAYMENT", paymentId, { orderId: order.id, amount });
  return {
    id: paymentId,
    paymentNo,
    amount,
    status: "PENDING",
    mockMode: isWechatMock(),
    payParams,
    message: prepayId ? (isWechatMock() ? "当前为测试支付模式" : "微信预支付已创建") : "支付参数创建失败"
  };
}

export async function completeMockPayment(db, user, paymentId) {
  if (process.env.WECHAT_MODE && process.env.WECHAT_MODE !== "mock") {
    throw new HttpError(403, "MOCK_PAYMENT_DISABLED", "正式支付模式不允许模拟到账");
  }
  let orderId = null;
  await withTransaction(db, async (conn) => {
    const payment = await first(conn, "SELECT * FROM payments WHERE id = ?", [paymentId]);
    if (!payment) throw new HttpError(404, "PAYMENT_NOT_FOUND", "支付记录不存在");
    if (user.isCustomer && payment.customer_id !== user.customerId) {
      throw new HttpError(404, "PAYMENT_NOT_FOUND", "支付记录不存在");
    }
    orderId = payment.order_id;
    if (payment.status === "SUCCEEDED") return;
    if (payment.status !== "PENDING") throw new HttpError(409, "PAYMENT_NOT_PENDING", "支付记录状态异常");
    const transactionId = `MOCK-${String(Math.floor(Math.random() * 1e12)).padStart(12, "0")}`;
    await applySuccessfulPayment(conn, paymentId, transactionId, payment.amount, user, "MOCK");
  });
  return getOrder(db, user, orderId);
}

export async function markWechatPaymentSucceeded(db, paymentId, transactionId, paidAmount) {
  return withTransaction(db, async (conn) => {
    const payment = await first(conn, "SELECT * FROM payments WHERE id = ?", [paymentId]);
    if (!payment) throw new HttpError(404, "PAYMENT_NOT_FOUND", "支付记录不存在");
    if (payment.status === "SUCCEEDED") return { payment, duplicate: true };
    if (payment.status !== "PENDING") throw new HttpError(409, "PAYMENT_NOT_PENDING", "支付记录状态异常");
    if (money(payment.amount) !== money(paidAmount)) {
      throw new HttpError(409, "PAYMENT_AMOUNT_MISMATCH", "微信支付金额与系统订单不一致");
    }
    await applySuccessfulPayment(conn, paymentId, transactionId, payment.amount, null, "WECHAT");
    return { payment, duplicate: false };
  });
}

async function applySuccessfulPayment(conn, paymentId, transactionId, paymentAmount, actor, source) {
  const payment = await first(conn, "SELECT * FROM payments WHERE id = ?", [paymentId]);
  const paidAt = nowIso();
  await run(conn, "UPDATE payments SET status = 'SUCCEEDED', transaction_id = ?, paid_at = ? WHERE id = ?", [
    transactionId,
    paidAt,
    paymentId
  ]);
  const totalRow = await first(
    conn,
    "SELECT COALESCE(SUM(amount), 0) AS amount FROM payments WHERE order_id = ? AND status = 'SUCCEEDED'",
    [payment.order_id]
  );
  const order = await first(conn, "SELECT * FROM orders WHERE id = ?", [payment.order_id]);
  const threshold = money(order.total_amount * order.prepay_ratio);
  const ready = totalRow.amount >= threshold ? 1 : 0;
  await run(
    conn,
    `UPDATE orders SET paid_amount = ?,
       status = CASE
         WHEN status IN ('PENDING_PAYMENT', 'PARTIALLY_PAID') AND ? = 1 THEN 'PENDING_SANLEI'
         WHEN status IN ('PENDING_PAYMENT', 'PARTIALLY_PAID') THEN 'PARTIALLY_PAID'
         ELSE status
       END,
       updated_at = ?
     WHERE id = ?`,
    [money(totalRow.amount), ready, nowIso(), order.id]
  );
  await auditSql(
    conn,
    actor,
    source === "WECHAT" ? "WECHAT_PAYMENT_SUCCEEDED" : "PAYMENT_SUCCEEDED",
    "PAYMENT",
    paymentId,
    { amount: paymentAmount, transactionId, source }
  );
  await notifySql(conn, order.customer_id, "预付款已到账", `订单${order.order_no}已到账¥${money(payment.amount)}。`);
}

export async function shipOrder(db, user, orderId, payload) {
  await withTransaction(db, async (conn) => {
    const order = await first(conn, "SELECT * FROM orders WHERE id = ?", [orderId]);
    if (!order) throw new HttpError(404, "ORDER_NOT_FOUND", "订单不存在");
    if (!["PREPARING", "PARTIALLY_SHIPPED"].includes(order.status)) {
      throw new HttpError(409, "INVALID_ORDER_STATUS", "订单当前状态不能发货");
    }
    if (!Array.isArray(payload.items) || payload.items.length === 0) {
      throw new HttpError(400, "VALIDATION_ERROR", "请选择本批发货产品");
    }
    const shipmentCount = (
      await first(conn, "SELECT COUNT(*) AS count FROM shipments WHERE order_id = ?", [orderId])
    ).count;
    if (shipmentCount >= order.batch_limit) {
      throw new HttpError(409, "BATCH_LIMIT_REACHED", `该订单最多分${order.batch_limit}批发货`);
    }

    const detailItems = [];
    let shipmentAmount = 0;
    for (const requested of payload.items) {
      const quantity = parsePositiveInteger(requested.quantity, "发货数量");
      const item = await first(
        conn,
        `SELECT oi.*, p.name FROM order_items oi JOIN products p ON p.id = oi.product_id
         WHERE oi.id = ? AND oi.order_id = ?`,
        [requested.orderItemId, orderId]
      );
      if (!item) throw new HttpError(400, "ORDER_ITEM_NOT_FOUND", "订单产品行不存在");
      if (item.shipped_quantity + quantity > item.quantity) {
        throw new HttpError(400, "SHIPMENT_QUANTITY_EXCEEDED", `${item.name}发货数量超出订单剩余数量`);
      }
      if (item.reserved_quantity - item.shipped_quantity < quantity) {
        throw new HttpError(409, "INSUFFICIENT_RESERVED_STOCK", `${item.name}有效预占库存不足，请先补货或重新分配`);
      }
      const amount = money(item.unit_price * quantity);
      shipmentAmount += amount;
      detailItems.push({ item, quantity, amount });
    }
    shipmentAmount = money(shipmentAmount);
    if (!order.allow_overpayment && order.settlement_method === "PREPAY") {
      if (order.shipped_amount + shipmentAmount > order.paid_amount + 0.001) {
        throw new HttpError(
          409,
          "SHIPMENT_EXCEEDS_PREPAYMENT",
          `本批金额¥${shipmentAmount.toFixed(2)}超过预付款可用发货额度¥${money(order.paid_amount - order.shipped_amount).toFixed(2)}`
        );
      }
    }

    const shipmentId = id("shipment");
    const shipmentNo = serialNumber("SHIP");
    const shippedAt = nowIso();
    await run(
      conn,
      `INSERT INTO shipments (id, shipment_no, order_id, batch_no, status, logistics_company, tracking_no, dispatch_location,
         delivery_mode, amount, shipped_at, received_at, created_at)
       VALUES (?, ?, ?, ?, 'SHIPPED', ?, ?, ?, ?, ?, ?, NULL, ?)`,
      [
        shipmentId, shipmentNo, orderId, shipmentCount + 1,
        String(payload.logisticsCompany || "").trim().slice(0, 100),
        String(payload.trackingNo || "").trim().slice(0, 100),
        String(payload.dispatchLocation || "").trim().slice(0, 200),
        payload.deliveryMode === "PICKUP" ? "PICKUP" : "DELIVERY",
        shipmentAmount, shippedAt, shippedAt
      ]
    );

    for (const detail of detailItems) {
      await run(
        conn,
        `INSERT INTO shipment_items (id, shipment_id, order_item_id, product_id, quantity, amount)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [id("shipitem"), shipmentId, detail.item.id, detail.item.product_id, detail.quantity, detail.amount]
      );
      await consumeReservations(conn, detail.item.id, detail.quantity, shipmentId, user.id);
      await run(conn, "UPDATE order_items SET shipped_quantity = shipped_quantity + ? WHERE id = ?", [
        detail.quantity,
        detail.item.id
      ]);
    }
    const remaining = (
      await first(
        conn,
        "SELECT COUNT(*) AS count FROM order_items WHERE order_id = ? AND shipped_quantity < quantity",
        [orderId]
      )
    ).count;
    const nextStatus = remaining > 0 ? "PARTIALLY_SHIPPED" : "SHIPPED";
    await run(conn, "UPDATE orders SET shipped_amount = shipped_amount + ?, status = ?, updated_at = ? WHERE id = ?", [
      shipmentAmount,
      nextStatus,
      nowIso(),
      orderId
    ]);
    await auditSql(conn, user, "SHIP_ORDER", "SHIPMENT", shipmentId, {
      orderId,
      batchNo: shipmentCount + 1,
      shipmentAmount
    });
    await notifySql(
      conn,
      order.customer_id,
      `订单第${shipmentCount + 1}批已发货`,
      `运单：${String(payload.trackingNo || "").trim().slice(0, 100) || "待补充"}，物流：${String(payload.logisticsCompany || "").trim().slice(0, 100) || "待补充"}`
    );
  });
  return getOrder(db, user, orderId);
}

async function consumeReservations(conn, orderItemId, quantity, shipmentId, userId) {
  let remaining = quantity;
  const reservations = await all(
    conn,
    `SELECT r.*, i.quantity AS stock_quantity
     FROM reservations r JOIN inventory i ON i.id = r.inventory_id
     WHERE r.order_item_id = ? AND r.consumed_quantity < r.quantity
     ORDER BY r.created_at`,
    [orderItemId]
  );
  for (const reservation of reservations) {
    if (remaining <= 0) break;
    const take = Math.min(remaining, reservation.quantity - reservation.consumed_quantity);
    await run(conn, "UPDATE reservations SET consumed_quantity = consumed_quantity + ? WHERE id = ?", [take, reservation.id]);
    await run(
      conn,
      "UPDATE inventory SET quantity = quantity - ?, reserved = reserved - ?, updated_at = ? WHERE id = ?",
      [take, take, nowIso(), reservation.inventory_id]
    );
    await run(
      conn,
      `INSERT INTO inventory_movements (id, inventory_id, type, quantity, reference_type, reference_id, note, created_by, created_at)
       VALUES (?, ?, 'SHIPMENT', ?, 'SHIPMENT', ?, '订单发货', ?, ?)`,
      [id("move"), reservation.inventory_id, -take, shipmentId, userId, nowIso()]
    );
    remaining -= take;
  }
  if (remaining > 0) throw new HttpError(409, "INSUFFICIENT_RESERVED_STOCK", "预占库存扣减失败");
}

export async function receiveShipment(db, user, shipmentId) {
  let orderId = null;
  await withTransaction(db, async (conn) => {
    const shipment = await first(conn, "SELECT * FROM shipments WHERE id = ?", [shipmentId]);
    if (!shipment) throw new HttpError(404, "SHIPMENT_NOT_FOUND", "发货批次不存在");
    const order = await first(conn, "SELECT * FROM orders WHERE id = ?", [shipment.order_id]);
    if (user.isCustomer && order.customer_id !== user.customerId) {
      throw new HttpError(404, "SHIPMENT_NOT_FOUND", "发货批次不存在");
    }
    orderId = order.id;
    if (shipment.status === "RECEIVED") return;
    await run(conn, "UPDATE shipments SET status = 'RECEIVED', received_at = ? WHERE id = ?", [nowIso(), shipmentId]);
    const unfinishedShipments = (
      await first(conn, "SELECT COUNT(*) AS count FROM shipments WHERE order_id = ? AND status != 'RECEIVED'", [order.id])
    ).count;
    const unfinishedItems = (
      await first(conn, "SELECT COUNT(*) AS count FROM order_items WHERE order_id = ? AND shipped_quantity < quantity", [order.id])
    ).count;
    if (unfinishedShipments === 0 && unfinishedItems === 0) {
      await run(conn, "UPDATE orders SET status = 'COMPLETED', updated_at = ? WHERE id = ?", [nowIso(), order.id]);
    }
    await auditSql(conn, user, "RECEIVE_SHIPMENT", "SHIPMENT", shipmentId);
  });
  return getOrder(db, user, orderId);
}

export async function cancelOrder(db, user, orderId, reason = "") {
  await withTransaction(db, async (conn) => {
    const order = await first(conn, "SELECT * FROM orders WHERE id = ?", [orderId]);
    if (!order) throw new HttpError(404, "ORDER_NOT_FOUND", "订单不存在");
    if (user.isCustomer && order.customer_id !== user.customerId) {
      throw new HttpError(404, "ORDER_NOT_FOUND", "订单不存在");
    }
    if (!ACTIVE_STATUSES.includes(order.status)) {
      throw new HttpError(409, "ORDER_CANNOT_CANCEL", "订单已进入发货或完成阶段，不能取消");
    }
    if (order.paid_amount > 0) {
      throw new HttpError(409, "ORDER_HAS_PAYMENT", "订单已有付款，请先走退款流程");
    }
    await releaseReservations(conn, orderId, user.id);
    await run(conn, "UPDATE orders SET status = 'CANCELLED', ops_note = ?, updated_at = ? WHERE id = ?", [
      String(reason || "订单取消").trim().slice(0, 1000),
      nowIso(),
      orderId
    ]);
    if (order.plan_id && order.plan_week) {
      const items = await all(conn, "SELECT * FROM order_items WHERE order_id = ?", [orderId]);
      for (const item of items) {
        await run(
          conn,
          `UPDATE plan_items SET ordered_quantity = GREATEST(0, ordered_quantity - ?)
           WHERE plan_id = ? AND week_no = ? AND product_id = ?`,
          [item.quantity, order.plan_id, order.plan_week, item.product_id]
        );
      }
    }
    await auditSql(conn, user, "CANCEL_ORDER", "ORDER", orderId, { reason });
  });
  return getOrder(db, user, orderId);
}

async function releaseReservations(conn, orderId, userId) {
  const reservations = await all(
    conn,
    `SELECT r.* FROM reservations r
     JOIN order_items oi ON oi.id = r.order_item_id
     WHERE oi.order_id = ? AND r.consumed_quantity < r.quantity`,
    [orderId]
  );
  for (const reservation of reservations) {
    const quantity = reservation.quantity - reservation.consumed_quantity;
    await run(conn, "UPDATE inventory SET reserved = GREATEST(0, reserved - ?), updated_at = ? WHERE id = ?", [
      quantity,
      nowIso(),
      reservation.inventory_id
    ]);
    await run(conn, "UPDATE reservations SET consumed_quantity = quantity WHERE id = ?", [reservation.id]);
    await run(
      conn,
      `INSERT INTO inventory_movements (id, inventory_id, type, quantity, reference_type, reference_id, note, created_by, created_at)
       VALUES (?, ?, 'RELEASE', ?, 'ORDER', ?, '取消订单释放预占', ?, ?)`,
      [id("move"), reservation.inventory_id, quantity, orderId, userId, nowIso()]
    );
  }
}

export async function listPayments(db) {
  const rows = await all(
    db.$client,
    `SELECT pay.*, o.order_no, c.name AS customer_name
     FROM payments pay
     JOIN orders o ON o.id = pay.order_id
     JOIN customers c ON c.id = pay.customer_id
     ORDER BY pay.created_at DESC LIMIT 500`
  );
  return rows.map((row) => ({
    id: row.id,
    paymentNo: row.payment_no,
    customerName: row.customer_name,
    orderId: row.order_id,
    orderNo: row.order_no,
    amount: money(row.amount),
    channel: row.channel,
    status: row.status,
    transactionId: row.transaction_id,
    paidAt: row.paid_at,
    createdAt: row.created_at
  }));
}
