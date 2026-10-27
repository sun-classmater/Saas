import {
  HttpError,
  asBoolean,
  audit,
  cleanText,
  customerOutstanding,
  effectivePrice,
  mapCustomer,
  money,
  notifyCustomer,
  parsePositiveInteger,
  parsePositiveNumber,
  requireRoles,
  requireStaff,
  requireText,
  serialNumber,
  settlementWeek,
  withTransaction
} from "./core.js";
import { id, nowIso } from "./database.js";
import { createMiniProgramPayment, isWechatMock } from "./wechat.js";

const ORDER_TYPES = new Set(["NORMAL", "PREPAY", "NEW_PRODUCT", "PLAN", "TEMPORARY"]);
const SETTLEMENT_METHODS = new Set(["CREDIT", "PREPAY"]);
const ORDER_ACTIVE_STATUSES = [
  "PENDING_BANGBANG",
  "PENDING_PAYMENT",
  "PARTIALLY_PAID",
  "PENDING_SANLEI",
  "PREPARING",
  "BACKORDER",
  "PARTIALLY_SHIPPED"
];

function mapOrderRow(row) {
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
    prepayRatio: row.prepay_ratio,
    allowOverpayment: asBoolean(row.allow_overpayment),
    batchLimit: row.batch_limit,
    planId: row.plan_id,
    planWeek: row.plan_week,
    customerNote: row.customer_note,
    opsNote: row.ops_note,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export function listOrders(db, user, query = {}) {
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
    const keyword = `%${cleanText(query.keyword)}%`;
    params.push(keyword, keyword, keyword);
  }
  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  return db.prepare(`
    SELECT o.*, g.group_no, c.name AS customer_name, c.grade AS customer_grade
    FROM orders o
    JOIN order_groups g ON g.id = o.group_id
    JOIN customers c ON c.id = o.customer_id
    ${where}
    ORDER BY o.created_at DESC
    LIMIT 500
  `).all(...params).map(mapOrderRow);
}

export function getOrder(db, user, orderId) {
  const row = db.prepare(`
    SELECT o.*, g.group_no, c.name AS customer_name, c.grade AS customer_grade
    FROM orders o
    JOIN order_groups g ON g.id = o.group_id
    JOIN customers c ON c.id = o.customer_id
    WHERE o.id = ?
  `).get(orderId);
  if (!row) throw new HttpError(404, "ORDER_NOT_FOUND", "订单不存在");
  if (user.isCustomer && row.customer_id !== user.customerId) {
    throw new HttpError(404, "ORDER_NOT_FOUND", "订单不存在");
  }
  const order = mapOrderRow(row);
  order.items = db.prepare(`
    SELECT oi.*, p.sku, p.name, p.category, p.vehicle_model, p.min_package
    FROM order_items oi
    JOIN products p ON p.id = oi.product_id
    WHERE oi.order_id = ?
    ORDER BY p.category, p.name
  `).all(orderId).map((item) => ({
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
  order.payments = db.prepare(`
    SELECT id, payment_no, amount, channel, status, transaction_id, paid_at, created_at
    FROM payments WHERE order_id = ? ORDER BY created_at DESC
  `).all(orderId).map((payment) => ({
    id: payment.id,
    paymentNo: payment.payment_no,
    amount: money(payment.amount),
    channel: payment.channel,
    status: payment.status,
    transactionId: payment.transaction_id,
    paidAt: payment.paid_at,
    createdAt: payment.created_at
  }));
  order.shipments = db.prepare(`
    SELECT s.*, GROUP_CONCAT(p.name || ' ×' || si.quantity, '、') AS summary
    FROM shipments s
    LEFT JOIN shipment_items si ON si.shipment_id = s.id
    LEFT JOIN products p ON p.id = si.product_id
    WHERE s.order_id = ?
    GROUP BY s.id
    ORDER BY s.batch_no
  `).all(orderId).map((shipment) => ({
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
  order.group = db.prepare("SELECT * FROM order_groups WHERE id = ?").get(row.group_id);
  order.group.siblingOrders = db.prepare(`
    SELECT id, order_no, vehicle_model, total_amount, status
    FROM orders WHERE group_id = ? ORDER BY created_at
  `).all(row.group_id).map((sibling) => ({
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

export function createOrder(db, user, payload) {
  requireRoles(user, ["CUSTOMER_ADMIN", "CUSTOMER_BUYER", "SUPER_ADMIN"]);
  const customerId = user.isCustomer ? user.customerId : payload.customerId;
  const customer = db.prepare("SELECT * FROM customers WHERE id = ? AND active = 1").get(customerId);
  if (!customer) throw new HttpError(400, "CUSTOMER_NOT_FOUND", "客户不存在或已停用");
  const orderType = cleanText(payload.orderType || "NORMAL").toUpperCase();
  if (!ORDER_TYPES.has(orderType)) throw new HttpError(400, "VALIDATION_ERROR", "订单类型无效");

  let settlementMethod = cleanText(payload.settlementMethod || customer.settlement_method).toUpperCase();
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
    const productId = requireText(rawItem.productId, "产品");
    const quantity = parsePositiveInteger(rawItem.quantity, "数量");
    merged.set(productId, (merged.get(productId) || 0) + quantity);
  }

  let plan = null;
  const planWeek = payload.planWeek == null ? null : parsePositiveInteger(payload.planWeek, "计划周");
  if (orderType === "PLAN") {
    if (!payload.planId || !planWeek || planWeek > 6) {
      throw new HttpError(400, "VALIDATION_ERROR", "计划订单必须选择已审核计划和计划周");
    }
    plan = db.prepare("SELECT * FROM plans WHERE id = ? AND customer_id = ?").get(payload.planId, customerId);
    if (!plan || plan.status !== "APPROVED") {
      throw new HttpError(400, "PLAN_NOT_APPROVED", "只能从已审核通过的计划创建计划订单");
    }
  }

  const normalizedItems = [];
  for (const [productId, quantity] of merged) {
    const product = db.prepare("SELECT * FROM products WHERE id = ? AND active = 1").get(productId);
    if (!product) throw new HttpError(400, "PRODUCT_NOT_FOUND", "产品不存在或已停用");
    if (quantity % product.min_package !== 0) {
      throw new HttpError(400, "PACKAGE_QUANTITY", `${product.name}数量必须为${product.min_package}的最小包装倍数`);
    }
    const priced = effectivePrice(db, customerId, productId);
    if (plan) {
      const planItem = db.prepare(`
        SELECT * FROM plan_items WHERE plan_id = ? AND week_no = ? AND product_id = ?
      `).get(plan.id, planWeek, productId);
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

  return withTransaction(db, () => {
    const groupId = id("group");
    const groupNo = serialNumber("SO");
    const createdAt = nowIso();
    const week = settlementWeek();
    db.prepare(`
      INSERT INTO order_groups (
        id, group_no, customer_id, settlement_week, settlement_method, currency, tax_mode, created_at
      ) VALUES (?, ?, ?, ?, ?, 'CNY', 'INCLUDED', ?)
    `).run(groupId, groupNo, customerId, week, settlementMethod, createdAt);

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
      db.prepare(`
        INSERT INTO orders (
          id, order_no, group_id, customer_id, vehicle_model, order_type, settlement_method,
          status, total_amount, paid_amount, shipped_amount, prepay_ratio, allow_overpayment,
          batch_limit, plan_id, plan_week, customer_note, ops_note, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 'PENDING_BANGBANG', ?, 0, 0, ?, ?, ?, ?, ?, ?, NULL, ?, ?)
      `).run(
        orderId, orderNo, groupId, customerId, vehicleModel, orderType, settlementMethod,
        totalAmount, customer.prepay_ratio, customer.allow_overpayment, customer.batch_limit,
        plan?.id || null, planWeek, cleanText(payload.note, 1000), createdAt, createdAt
      );
      const insertItem = db.prepare(`
        INSERT INTO order_items (
          id, order_id, product_id, quantity, unit_price, amount,
          reserved_quantity, shipped_quantity
        ) VALUES (?, ?, ?, ?, ?, ?, 0, 0)
      `);
      for (const item of items) {
        insertItem.run(
          id("item"), orderId, item.product.id, item.quantity,
          item.unitPrice, item.amount
        );
        if (plan) {
          db.prepare(`
            UPDATE plan_items SET ordered_quantity = ordered_quantity + ?
            WHERE plan_id = ? AND week_no = ? AND product_id = ?
          `).run(item.quantity, plan.id, planWeek, item.product.id);
        }
      }
      createdOrders.push(orderId);
    }
    audit(db, user, "CREATE_ORDER", "ORDER_GROUP", groupId, {
      orderType,
      settlementMethod,
      totalAmount: money(normalizedItems.reduce((sum, item) => sum + item.amount, 0))
    });
    notifyCustomer(db, customerId, "订单已提交", `订单${groupNo}已提交，等待邦邦确认。`);
    return {
      groupId,
      groupNo,
      orderIds: createdOrders,
      totalAmount: money(normalizedItems.reduce((sum, item) => sum + item.amount, 0))
    };
  });
}

export function confirmOrder(db, user, orderId, note = "") {
  requireRoles(user, ["BANGBANG_OPS", "SUPER_ADMIN"]);
  return withTransaction(db, () => {
    const order = db.prepare(`
      SELECT o.*, c.credit_limit, c.name AS customer_name
      FROM orders o JOIN customers c ON c.id = o.customer_id WHERE o.id = ?
    `).get(orderId);
    if (!order) throw new HttpError(404, "ORDER_NOT_FOUND", "订单不存在");
    if (order.status !== "PENDING_BANGBANG") {
      throw new HttpError(409, "INVALID_ORDER_STATUS", "订单当前状态不能由邦邦确认");
    }
    if (order.settlement_method === "CREDIT") {
      const outstanding = customerOutstanding(db, order.customer_id);
      if (outstanding > order.credit_limit) {
        throw new HttpError(409, "CREDIT_LIMIT_EXCEEDED", "客户应收已超过授信额度，请改为预付款或调整额度");
      }
    }

    reserveStock(db, order);
    let nextStatus = "PENDING_SANLEI";
    if (order.settlement_method === "PREPAY") {
      const threshold = money(order.total_amount * order.prepay_ratio);
      nextStatus = order.paid_amount > 0
        ? (order.paid_amount >= threshold ? "PENDING_SANLEI" : "PARTIALLY_PAID")
        : "PENDING_PAYMENT";
    }
    db.prepare(`
      UPDATE orders SET status = ?, ops_note = COALESCE(NULLIF(?, ''), ops_note), updated_at = ?
      WHERE id = ?
    `).run(nextStatus, cleanText(note, 1000), nowIso(), orderId);
    audit(db, user, "CONFIRM_ORDER", "ORDER", orderId, { nextStatus });
    notifyCustomer(db, order.customer_id, "订单已确认", `订单${order.order_no}已由邦邦确认。`);
    return getOrder(db, user, orderId);
  });
}

function reserveStock(db, order) {
  const items = db.prepare("SELECT * FROM order_items WHERE order_id = ?").all(order.id);
  for (const item of items) {
    let needed = item.quantity;
    const stocks = db.prepare(`
      SELECT * FROM inventory
      WHERE product_id = ? AND quantity > reserved
      ORDER BY CASE source_type WHEN 'REAL' THEN 0 ELSE 1 END, updated_at
    `).all(item.product_id);
    for (const stock of stocks) {
      if (needed <= 0) break;
      const available = Math.max(0, stock.quantity - stock.reserved);
      const take = Math.min(available, needed);
      if (take <= 0) continue;
      db.prepare("UPDATE inventory SET reserved = reserved + ?, updated_at = ? WHERE id = ?")
        .run(take, nowIso(), stock.id);
      db.prepare(`
        INSERT INTO reservations (id, order_item_id, inventory_id, quantity, consumed_quantity, created_at)
        VALUES (?, ?, ?, ?, 0, ?)
      `).run(id("reserve"), item.id, stock.id, take, nowIso());
      needed -= take;
    }
    db.prepare("UPDATE order_items SET reserved_quantity = ? WHERE id = ?")
      .run(item.quantity - needed, item.id);
  }
}

export function acceptOrder(db, user, orderId) {
  requireRoles(user, ["SANLEI_SALES", "SUPER_ADMIN"]);
  return withTransaction(db, () => {
    const order = db.prepare("SELECT * FROM orders WHERE id = ?").get(orderId);
    if (!order) throw new HttpError(404, "ORDER_NOT_FOUND", "订单不存在");
    if (order.status !== "PENDING_SANLEI") {
      throw new HttpError(409, "INVALID_ORDER_STATUS", "订单未达到三磊接单条件");
    }
    db.prepare("UPDATE orders SET status = 'PREPARING', updated_at = ? WHERE id = ?")
      .run(nowIso(), orderId);
    audit(db, user, "ACCEPT_ORDER", "ORDER", orderId);
    notifyCustomer(db, order.customer_id, "三磊已接单", `订单${order.order_no}正在备货。`);
    return getOrder(db, user, orderId);
  });
}

export async function createPayment(db, user, payload) {
  const order = db.prepare("SELECT * FROM orders WHERE id = ?").get(payload.orderId);
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
  db.prepare(`
    INSERT INTO payments (
      id, payment_no, customer_id, order_id, amount, channel, status,
      transaction_id, prepay_id, paid_at, created_at
    ) VALUES (?, ?, ?, ?, ?, 'WECHAT', 'PENDING', NULL, ?, NULL, ?)
  `).run(paymentId, paymentNo, order.customer_id, order.id, amount, prepayId, createdAt);
  audit(db, user, "CREATE_PAYMENT", "PAYMENT", paymentId, { orderId: order.id, amount });
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

export function completeMockPayment(db, user, paymentId) {
  if (process.env.WECHAT_MODE && process.env.WECHAT_MODE !== "mock") {
    throw new HttpError(403, "MOCK_PAYMENT_DISABLED", "正式支付模式不允许模拟到账");
  }
  return withTransaction(db, () => {
    const payment = db.prepare("SELECT * FROM payments WHERE id = ?").get(paymentId);
    if (!payment) throw new HttpError(404, "PAYMENT_NOT_FOUND", "支付记录不存在");
    if (user.isCustomer && payment.customer_id !== user.customerId) {
      throw new HttpError(404, "PAYMENT_NOT_FOUND", "支付记录不存在");
    }
    if (payment.status === "SUCCEEDED") return getOrder(db, user, payment.order_id);
    if (payment.status !== "PENDING") throw new HttpError(409, "PAYMENT_NOT_PENDING", "支付记录状态异常");
    const transactionId = `MOCK-${cryptoRandomDigits()}`;
    applySuccessfulPayment(db, paymentId, transactionId, payment.amount, user, "MOCK");
    return getOrder(db, user, payment.order_id);
  });
}

export function markWechatPaymentSucceeded(db, paymentId, transactionId, paidAmount) {
  return withTransaction(db, () => {
    const payment = db.prepare("SELECT * FROM payments WHERE id = ?").get(paymentId);
    if (!payment) throw new HttpError(404, "PAYMENT_NOT_FOUND", "支付记录不存在");
    if (payment.status === "SUCCEEDED") return { payment, duplicate: true };
    if (payment.status !== "PENDING") throw new HttpError(409, "PAYMENT_NOT_PENDING", "支付记录状态异常");
    if (money(payment.amount) !== money(paidAmount)) {
      throw new HttpError(409, "PAYMENT_AMOUNT_MISMATCH", "微信支付金额与系统订单不一致");
    }
    applySuccessfulPayment(db, paymentId, transactionId, payment.amount, null, "WECHAT");
    return { payment, duplicate: false };
  });
}

function applySuccessfulPayment(db, paymentId, transactionId, paymentAmount, actor, source) {
  const payment = db.prepare("SELECT * FROM payments WHERE id = ?").get(paymentId);
  const paidAt = nowIso();
  db.prepare(`
    UPDATE payments SET status = 'SUCCEEDED', transaction_id = ?, paid_at = ? WHERE id = ?
  `).run(transactionId, paidAt, paymentId);
    const totalPaid = db.prepare(
      "SELECT COALESCE(SUM(amount), 0) AS amount FROM payments WHERE order_id = ? AND status = 'SUCCEEDED'"
    ).get(payment.order_id).amount;
    const order = db.prepare("SELECT * FROM orders WHERE id = ?").get(payment.order_id);
    const threshold = money(order.total_amount * order.prepay_ratio);
    const shouldBeReady = totalPaid >= threshold;
    db.prepare(`
      UPDATE orders SET paid_amount = ?,
        status = CASE
          WHEN status IN ('PENDING_PAYMENT', 'PARTIALLY_PAID') AND ? = 1 THEN 'PENDING_SANLEI'
          WHEN status IN ('PENDING_PAYMENT', 'PARTIALLY_PAID') THEN 'PARTIALLY_PAID'
          ELSE status
        END,
        updated_at = ?
      WHERE id = ?
    `).run(money(totalPaid), shouldBeReady ? 1 : 0, nowIso(), order.id);
    audit(db, actor, source === "WECHAT" ? "WECHAT_PAYMENT_SUCCEEDED" : "PAYMENT_SUCCEEDED",
      "PAYMENT", paymentId, { amount: paymentAmount, transactionId, source });
    notifyCustomer(db, order.customer_id, "预付款已到账", `订单${order.order_no}已到账¥${money(payment.amount)}。`);
}

function cryptoRandomDigits() {
  return String(Math.floor(Math.random() * 1e12)).padStart(12, "0");
}

export function shipOrder(db, user, orderId, payload) {
  requireRoles(user, ["SANLEI_WAREHOUSE", "SUPER_ADMIN"]);
  return withTransaction(db, () => {
    const order = db.prepare("SELECT * FROM orders WHERE id = ?").get(orderId);
    if (!order) throw new HttpError(404, "ORDER_NOT_FOUND", "订单不存在");
    if (!["PREPARING", "PARTIALLY_SHIPPED"].includes(order.status)) {
      throw new HttpError(409, "INVALID_ORDER_STATUS", "订单当前状态不能发货");
    }
    if (!Array.isArray(payload.items) || payload.items.length === 0) {
      throw new HttpError(400, "VALIDATION_ERROR", "请选择本批发货产品");
    }
    const shipmentCount = db.prepare("SELECT COUNT(*) AS count FROM shipments WHERE order_id = ?")
      .get(orderId).count;
    if (shipmentCount >= order.batch_limit) {
      throw new HttpError(409, "BATCH_LIMIT_REACHED", `该订单最多分${order.batch_limit}批发货`);
    }

    const detailItems = [];
    let shipmentAmount = 0;
    for (const requested of payload.items) {
      const quantity = parsePositiveInteger(requested.quantity, "发货数量");
      const item = db.prepare(`
        SELECT oi.*, p.name FROM order_items oi
        JOIN products p ON p.id = oi.product_id
        WHERE oi.id = ? AND oi.order_id = ?
      `).get(requested.orderItemId, orderId);
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
    db.prepare(`
      INSERT INTO shipments (
        id, shipment_no, order_id, batch_no, status, logistics_company, tracking_no, dispatch_location,
        delivery_mode, amount, shipped_at, received_at, created_at
      ) VALUES (?, ?, ?, ?, 'SHIPPED', ?, ?, ?, ?, ?, ?, NULL, ?)
    `).run(
      shipmentId, shipmentNo, orderId, shipmentCount + 1,
      cleanText(payload.logisticsCompany, 100), cleanText(payload.trackingNo, 100),
      cleanText(payload.dispatchLocation, 200),
      payload.deliveryMode === "PICKUP" ? "PICKUP" : "DELIVERY",
      shipmentAmount, shippedAt, shippedAt
    );

    for (const detail of detailItems) {
      db.prepare(`
        INSERT INTO shipment_items (id, shipment_id, order_item_id, product_id, quantity, amount)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(id("shipitem"), shipmentId, detail.item.id, detail.item.product_id, detail.quantity, detail.amount);
      consumeReservations(db, detail.item.id, detail.quantity, shipmentId, user.id);
      db.prepare("UPDATE order_items SET shipped_quantity = shipped_quantity + ? WHERE id = ?")
        .run(detail.quantity, detail.item.id);
    }
    const remaining = db.prepare(`
      SELECT COUNT(*) AS count FROM order_items
      WHERE order_id = ? AND shipped_quantity < quantity
    `).get(orderId).count;
    const nextStatus = remaining > 0 ? "PARTIALLY_SHIPPED" : "SHIPPED";
    db.prepare(`
      UPDATE orders SET shipped_amount = shipped_amount + ?, status = ?, updated_at = ? WHERE id = ?
    `).run(shipmentAmount, nextStatus, nowIso(), orderId);
    audit(db, user, "SHIP_ORDER", "SHIPMENT", shipmentId, {
      orderId, batchNo: shipmentCount + 1, shipmentAmount
    });
    notifyCustomer(
      db,
      order.customer_id,
      `订单第${shipmentCount + 1}批已发货`,
      `运单：${cleanText(payload.trackingNo, 100) || "待补充"}，物流：${cleanText(payload.logisticsCompany, 100) || "待补充"}`
    );
    return getOrder(db, user, orderId);
  });
}

function consumeReservations(db, orderItemId, quantity, shipmentId, userId) {
  let remaining = quantity;
  const reservations = db.prepare(`
    SELECT r.*, i.quantity AS stock_quantity
    FROM reservations r JOIN inventory i ON i.id = r.inventory_id
    WHERE r.order_item_id = ? AND r.consumed_quantity < r.quantity
    ORDER BY r.created_at
  `).all(orderItemId);
  for (const reservation of reservations) {
    if (remaining <= 0) break;
    const take = Math.min(remaining, reservation.quantity - reservation.consumed_quantity);
    db.prepare("UPDATE reservations SET consumed_quantity = consumed_quantity + ? WHERE id = ?")
      .run(take, reservation.id);
    db.prepare(`
      UPDATE inventory SET quantity = quantity - ?, reserved = reserved - ?, updated_at = ?
      WHERE id = ?
    `).run(take, take, nowIso(), reservation.inventory_id);
    db.prepare(`
      INSERT INTO inventory_movements (
        id, inventory_id, type, quantity, reference_type, reference_id, note, created_by, created_at
      ) VALUES (?, ?, 'SHIPMENT', ?, 'SHIPMENT', ?, ?, ?, ?)
    `).run(id("move"), reservation.inventory_id, -take, shipmentId, "订单发货", userId, nowIso());
    remaining -= take;
  }
  if (remaining > 0) throw new HttpError(409, "INSUFFICIENT_RESERVED_STOCK", "预占库存扣减失败");
}

export function receiveShipment(db, user, shipmentId) {
  return withTransaction(db, () => {
    const shipment = db.prepare("SELECT * FROM shipments WHERE id = ?").get(shipmentId);
    if (!shipment) throw new HttpError(404, "SHIPMENT_NOT_FOUND", "发货批次不存在");
    const order = db.prepare("SELECT * FROM orders WHERE id = ?").get(shipment.order_id);
    if (user.isCustomer && order.customer_id !== user.customerId) {
      throw new HttpError(404, "SHIPMENT_NOT_FOUND", "发货批次不存在");
    }
    if (shipment.status === "RECEIVED") return getOrder(db, user, order.id);
    db.prepare("UPDATE shipments SET status = 'RECEIVED', received_at = ? WHERE id = ?")
      .run(nowIso(), shipmentId);
    const unfinishedShipments = db.prepare(
      "SELECT COUNT(*) AS count FROM shipments WHERE order_id = ? AND status != 'RECEIVED'"
    ).get(order.id).count;
    const unfinishedItems = db.prepare(
      "SELECT COUNT(*) AS count FROM order_items WHERE order_id = ? AND shipped_quantity < quantity"
    ).get(order.id).count;
    if (unfinishedShipments === 0 && unfinishedItems === 0) {
      db.prepare("UPDATE orders SET status = 'COMPLETED', updated_at = ? WHERE id = ?")
        .run(nowIso(), order.id);
    }
    audit(db, user, "RECEIVE_SHIPMENT", "SHIPMENT", shipmentId);
    return getOrder(db, user, order.id);
  });
}

export function cancelOrder(db, user, orderId, reason = "") {
  return withTransaction(db, () => {
    const order = db.prepare("SELECT * FROM orders WHERE id = ?").get(orderId);
    if (!order) throw new HttpError(404, "ORDER_NOT_FOUND", "订单不存在");
    if (user.isCustomer && order.customer_id !== user.customerId) {
      throw new HttpError(404, "ORDER_NOT_FOUND", "订单不存在");
    }
    if (!ORDER_ACTIVE_STATUSES.includes(order.status)) {
      throw new HttpError(409, "ORDER_CANNOT_CANCEL", "订单已进入发货或完成阶段，不能取消");
    }
    if (order.paid_amount > 0) {
      throw new HttpError(409, "ORDER_HAS_PAYMENT", "订单已有付款，请先走退款流程");
    }
    releaseReservations(db, orderId, user.id);
    db.prepare("UPDATE orders SET status = 'CANCELLED', ops_note = ?, updated_at = ? WHERE id = ?")
      .run(cleanText(reason || "订单取消", 1000), nowIso(), orderId);
    if (order.plan_id && order.plan_week) {
      const items = db.prepare("SELECT * FROM order_items WHERE order_id = ?").all(orderId);
      for (const item of items) {
        db.prepare(`
          UPDATE plan_items SET ordered_quantity = MAX(0, ordered_quantity - ?)
          WHERE plan_id = ? AND week_no = ? AND product_id = ?
        `).run(item.quantity, order.plan_id, order.plan_week, item.product_id);
      }
    }
    audit(db, user, "CANCEL_ORDER", "ORDER", orderId, { reason });
    return getOrder(db, user, orderId);
  });
}

function releaseReservations(db, orderId, userId) {
  const reservations = db.prepare(`
    SELECT r.* FROM reservations r
    JOIN order_items oi ON oi.id = r.order_item_id
    WHERE oi.order_id = ? AND r.consumed_quantity < r.quantity
  `).all(orderId);
  for (const reservation of reservations) {
    const quantity = reservation.quantity - reservation.consumed_quantity;
    db.prepare("UPDATE inventory SET reserved = MAX(0, reserved - ?), updated_at = ? WHERE id = ?")
      .run(quantity, nowIso(), reservation.inventory_id);
    db.prepare("UPDATE reservations SET consumed_quantity = quantity WHERE id = ?")
      .run(reservation.id);
    db.prepare(`
      INSERT INTO inventory_movements (
        id, inventory_id, type, quantity, reference_type, reference_id, note, created_by, created_at
      ) VALUES (?, ?, 'RELEASE', ?, 'ORDER', ?, '取消订单释放预占', ?, ?)
    `).run(id("move"), reservation.inventory_id, quantity, orderId, userId, nowIso());
  }
}

export function listPlans(db, user, query = {}) {
  const conditions = [];
  const params = [];
  if (user.isCustomer) {
    conditions.push("p.customer_id = ?");
    params.push(user.customerId);
  } else if (query.customerId) {
    conditions.push("p.customer_id = ?");
    params.push(query.customerId);
  }
  if (query.status) {
    conditions.push("p.status = ?");
    params.push(query.status);
  }
  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const plans = db.prepare(`
    SELECT p.*, c.name AS customer_name, c.grade
    FROM plans p JOIN customers c ON c.id = p.customer_id
    ${where}
    ORDER BY p.plan_month DESC, p.created_at DESC
    LIMIT 300
  `).all(...params);
  return plans.map((plan) => {
    const items = db.prepare(`
      SELECT pi.*, pr.sku, pr.name, pr.vehicle_model
      FROM plan_items pi JOIN products pr ON pr.id = pi.product_id
      WHERE pi.plan_id = ? ORDER BY pi.week_no, pr.name
    `).all(plan.id);
    return {
      id: plan.id,
      planNo: plan.plan_no,
      customerId: plan.customer_id,
      customerName: plan.customer_name,
      grade: plan.grade,
      planMonth: plan.plan_month,
      status: plan.status,
      customerNote: plan.customer_note,
      bangbangNote: plan.bangbang_note,
      sanleiNote: plan.sanlei_note,
      submittedAt: plan.submitted_at,
      bangbangReviewedAt: plan.bangbang_reviewed_at,
      sanleiReviewedAt: plan.sanlei_reviewed_at,
      createdAt: plan.created_at,
      itemCount: items.length,
      totalQuantity: items.reduce((sum, item) => sum + item.quantity, 0),
      items: items.map((item) => ({
        id: item.id,
        weekNo: item.week_no,
        productId: item.product_id,
        sku: item.sku,
        name: item.name,
        vehicleModel: item.vehicle_model,
        quantity: item.quantity,
        orderedQuantity: item.ordered_quantity
      }))
    };
  });
}

export function createPlan(db, user, payload) {
  const customerId = user.isCustomer ? user.customerId : payload.customerId;
  const planMonth = cleanText(payload.planMonth);
  if (!/^\d{4}-\d{2}$/.test(planMonth)) {
    throw new HttpError(400, "VALIDATION_ERROR", "计划月份格式应为YYYY-MM");
  }
  validatePlanItems(db, payload.items);
  return withTransaction(db, () => {
    const planId = id("plan");
    const planNo = serialNumber("PLAN");
    const createdAt = nowIso();
    db.prepare(`
      INSERT INTO plans (
        id, plan_no, customer_id, plan_month, status, customer_note,
        bangbang_note, sanlei_note, submitted_at, bangbang_reviewed_at,
        sanlei_reviewed_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, 'DRAFT', ?, NULL, NULL, NULL, NULL, NULL, ?, ?)
    `).run(planId, planNo, customerId, planMonth, cleanText(payload.note, 1000), createdAt, createdAt);
    insertPlanItems(db, planId, payload.items);
    audit(db, user, "CREATE_PLAN", "PLAN", planId, { planMonth });
    return listPlans(db, user).find((plan) => plan.id === planId);
  });
}

export function updatePlan(db, user, planId, payload) {
  const plan = db.prepare("SELECT * FROM plans WHERE id = ?").get(planId);
  if (!plan) throw new HttpError(404, "PLAN_NOT_FOUND", "采购计划不存在");
  if (user.isCustomer && plan.customer_id !== user.customerId) throw new HttpError(404, "PLAN_NOT_FOUND", "采购计划不存在");
  if (!["DRAFT", "REJECTED"].includes(plan.status)) {
    throw new HttpError(409, "PLAN_CANNOT_EDIT", "审核中的计划请先撤回再修改");
  }
  validatePlanItems(db, payload.items);
  return withTransaction(db, () => {
    db.prepare(`
      UPDATE plans SET plan_month = ?, customer_note = ?, status = 'DRAFT',
        submitted_at = NULL, bangbang_reviewed_at = NULL, sanlei_reviewed_at = NULL,
        bangbang_note = NULL, sanlei_note = NULL, updated_at = ?
      WHERE id = ?
    `).run(
      cleanText(payload.planMonth || plan.plan_month, 7),
      cleanText(payload.note ?? plan.customer_note, 1000),
      nowIso(),
      planId
    );
    db.prepare("DELETE FROM plan_items WHERE plan_id = ?").run(planId);
    insertPlanItems(db, planId, payload.items);
    audit(db, user, "UPDATE_PLAN", "PLAN", planId);
    return listPlans(db, user).find((item) => item.id === planId);
  });
}

function validatePlanItems(db, items) {
  if (!Array.isArray(items) || items.length === 0) {
    throw new HttpError(400, "VALIDATION_ERROR", "采购计划至少需要一个产品");
  }
  for (const item of items) {
    const weekNo = parsePositiveInteger(item.weekNo, "计划周");
    if (weekNo > 6) throw new HttpError(400, "VALIDATION_ERROR", "计划周必须在1到6之间");
    const quantity = parsePositiveInteger(item.quantity, "计划数量");
    const product = db.prepare("SELECT * FROM products WHERE id = ? AND active = 1").get(item.productId);
    if (!product) throw new HttpError(400, "PRODUCT_NOT_FOUND", "计划产品不存在");
    if (quantity % product.min_package !== 0) {
      throw new HttpError(400, "PACKAGE_QUANTITY", `${product.name}数量必须为${product.min_package}的倍数`);
    }
  }
}

function insertPlanItems(db, planId, items) {
  const merged = new Map();
  for (const item of items) {
    const key = `${item.weekNo}:${item.productId}`;
    merged.set(key, (merged.get(key) || 0) + Number(item.quantity));
  }
  const insert = db.prepare(`
    INSERT INTO plan_items (id, plan_id, week_no, product_id, quantity, ordered_quantity)
    VALUES (?, ?, ?, ?, ?, 0)
  `);
  for (const [key, quantity] of merged) {
    const [weekNo, productId] = key.split(":");
    insert.run(id("planitem"), planId, Number(weekNo), productId, quantity);
  }
}

export function planAction(db, user, planId, action, note = "") {
  const plan = db.prepare("SELECT * FROM plans WHERE id = ?").get(planId);
  if (!plan) throw new HttpError(404, "PLAN_NOT_FOUND", "采购计划不存在");
  if (user.isCustomer && plan.customer_id !== user.customerId) throw new HttpError(404, "PLAN_NOT_FOUND", "采购计划不存在");
  return withTransaction(db, () => {
    let nextStatus;
    const timestamp = nowIso();
    if (action === "SUBMIT") {
      if (!["DRAFT", "REJECTED"].includes(plan.status)) {
        throw new HttpError(409, "INVALID_PLAN_STATUS", "当前计划不能提交");
      }
      nextStatus = "BANGBANG_REVIEW";
      db.prepare("UPDATE plans SET status = ?, submitted_at = ?, updated_at = ? WHERE id = ?")
        .run(nextStatus, timestamp, timestamp, planId);
    } else if (action === "WITHDRAW") {
      if (!["BANGBANG_REVIEW", "SANLEI_REVIEW"].includes(plan.status)) {
        throw new HttpError(409, "INVALID_PLAN_STATUS", "当前计划不能撤回");
      }
      nextStatus = "DRAFT";
      db.prepare(`
        UPDATE plans SET status = 'DRAFT', submitted_at = NULL, bangbang_reviewed_at = NULL,
          sanlei_reviewed_at = NULL, bangbang_note = NULL, sanlei_note = NULL, updated_at = ?
        WHERE id = ?
      `).run(timestamp, planId);
    } else if (action === "BANGBANG_APPROVE") {
      requireRoles(user, ["BANGBANG_OPS", "SUPER_ADMIN"]);
      if (plan.status !== "BANGBANG_REVIEW") throw new HttpError(409, "INVALID_PLAN_STATUS", "计划不在邦邦审核阶段");
      nextStatus = "SANLEI_REVIEW";
      db.prepare(`
        UPDATE plans SET status = ?, bangbang_note = ?, bangbang_reviewed_at = ?, updated_at = ?
        WHERE id = ?
      `).run(nextStatus, cleanText(note, 1000), timestamp, timestamp, planId);
    } else if (action === "BANGBANG_REJECT") {
      requireRoles(user, ["BANGBANG_OPS", "SUPER_ADMIN"]);
      if (plan.status !== "BANGBANG_REVIEW") throw new HttpError(409, "INVALID_PLAN_STATUS", "计划不在邦邦审核阶段");
      nextStatus = "REJECTED";
      db.prepare(`
        UPDATE plans SET status = ?, bangbang_note = ?, bangbang_reviewed_at = ?, updated_at = ?
        WHERE id = ?
      `).run(nextStatus, cleanText(note || "邦邦退回", 1000), timestamp, timestamp, planId);
    } else if (action === "SANLEI_APPROVE") {
      requireRoles(user, ["SANLEI_SALES", "SUPER_ADMIN"]);
      if (plan.status !== "SANLEI_REVIEW") throw new HttpError(409, "INVALID_PLAN_STATUS", "计划不在三磊审核阶段");
      nextStatus = "APPROVED";
      db.prepare(`
        UPDATE plans SET status = ?, sanlei_note = ?, sanlei_reviewed_at = ?, updated_at = ?
        WHERE id = ?
      `).run(nextStatus, cleanText(note, 1000), timestamp, timestamp, planId);
    } else if (action === "SANLEI_REJECT") {
      requireRoles(user, ["SANLEI_SALES", "SUPER_ADMIN"]);
      if (plan.status !== "SANLEI_REVIEW") throw new HttpError(409, "INVALID_PLAN_STATUS", "计划不在三磊审核阶段");
      nextStatus = "REJECTED";
      db.prepare(`
        UPDATE plans SET status = ?, sanlei_note = ?, sanlei_reviewed_at = ?, updated_at = ?
        WHERE id = ?
      `).run(nextStatus, cleanText(note || "三磊退回", 1000), timestamp, timestamp, planId);
    } else {
      throw new HttpError(400, "INVALID_PLAN_ACTION", "计划操作无效");
    }
    audit(db, user, `PLAN_${action}`, "PLAN", planId, { nextStatus, note });
    if (plan.customer_id) {
      notifyCustomer(db, plan.customer_id, "采购计划状态更新", `计划${plan.plan_no}：${nextStatus}`);
    }
    return listPlans(db, user).find((item) => item.id === planId);
  });
}

export function listInventory(db, query = {}) {
  requireStaff(query.user);
  const conditions = [];
  const params = [];
  if (query.productId) {
    conditions.push("i.product_id = ?");
    params.push(query.productId);
  }
  if (query.lowStock === "true") conditions.push("(i.quantity - i.reserved) <= 20");
  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  return db.prepare(`
    SELECT i.*, p.sku, p.name, p.vehicle_model, p.min_package, s.name AS supplier_name
    FROM inventory i
    JOIN products p ON p.id = i.product_id
    LEFT JOIN suppliers s ON s.id = i.supplier_id
    ${where}
    ORDER BY p.category, p.name, i.source_type DESC
  `).all(...params).map((row) => ({
    id: row.id,
    productId: row.product_id,
    sku: row.sku,
    name: row.name,
    vehicleModel: row.vehicle_model,
    minPackage: row.min_package,
    warehouseName: row.warehouse_name,
    sourceType: row.source_type,
    supplierName: row.supplier_name,
    quantity: row.quantity,
    reserved: row.reserved,
    available: row.quantity - row.reserved,
    updatedAt: row.updated_at
  }));
}

export function adjustInventory(db, user, inventoryId, quantity, note) {
  requireRoles(user, ["SANLEI_WAREHOUSE", "SUPER_ADMIN"]);
  const delta = Number(quantity);
  if (!Number.isInteger(delta) || delta === 0) {
    throw new HttpError(400, "VALIDATION_ERROR", "库存调整数量必须为非零整数");
  }
  return withTransaction(db, () => {
    const inventory = db.prepare("SELECT * FROM inventory WHERE id = ?").get(inventoryId);
    if (!inventory) throw new HttpError(404, "INVENTORY_NOT_FOUND", "库存记录不存在");
    if (inventory.quantity + delta < 0 || inventory.quantity + delta < inventory.reserved) {
      throw new HttpError(409, "INVALID_INVENTORY_ADJUSTMENT", "调整后库存不能低于已预占数量");
    }
    db.prepare("UPDATE inventory SET quantity = quantity + ?, updated_at = ? WHERE id = ?")
      .run(delta, nowIso(), inventoryId);
    db.prepare(`
      INSERT INTO inventory_movements (
        id, inventory_id, type, quantity, reference_type, reference_id, note, created_by, created_at
      ) VALUES (?, ?, 'ADJUST', ?, 'MANUAL', NULL, ?, ?, ?)
    `).run(id("move"), inventoryId, delta, cleanText(note || "库存调整", 500), user.id, nowIso());
    audit(db, user, "ADJUST_INVENTORY", "INVENTORY", inventoryId, { delta, note });
    return listInventory(db, { user }).find((item) => item.id === inventoryId);
  });
}

export function dashboard(db, user) {
  requireStaff(user);
  const pendingPlan = db.prepare("SELECT COUNT(*) AS count FROM plans WHERE status IN ('BANGBANG_REVIEW', 'SANLEI_REVIEW')").get().count;
  const pendingConfirm = db.prepare("SELECT COUNT(*) AS count FROM orders WHERE status = 'PENDING_BANGBANG'").get().count;
  const pendingPayment = db.prepare("SELECT COUNT(*) AS count FROM orders WHERE status IN ('PENDING_PAYMENT', 'PARTIALLY_PAID')").get().count;
  const preparing = db.prepare("SELECT COUNT(*) AS count FROM orders WHERE status IN ('PENDING_SANLEI', 'PREPARING', 'PARTIALLY_SHIPPED')").get().count;
  const monthAmount = db.prepare(`
    SELECT COALESCE(SUM(total_amount), 0) AS amount FROM orders
    WHERE status != 'CANCELLED' AND substr(created_at, 1, 7) = substr(?, 1, 7)
  `).get(nowIso()).amount;
  const overduePrepay = db.prepare(`
    SELECT COUNT(*) AS count FROM orders
    WHERE settlement_method = 'PREPAY' AND status IN ('PENDING_PAYMENT', 'PARTIALLY_PAID')
      AND julianday('now') - julianday(created_at) > 3
  `).get().count;
  const lowStock = db.prepare(`
    SELECT p.id AS product_id, p.sku, p.name,
      COALESCE(SUM(CASE WHEN i.source_type = 'REAL' THEN i.quantity - i.reserved ELSE 0 END), 0) AS available
    FROM products p LEFT JOIN inventory i ON i.product_id = p.id
    GROUP BY p.id HAVING available <= 20 ORDER BY available
  `).all();
  return {
    metrics: {
      pendingPlan,
      pendingConfirm,
      pendingPayment,
      preparing,
      monthAmount: money(monthAmount),
      overduePrepay
    },
    lowStock,
    recentOrders: listOrders(db, user).slice(0, 8)
  };
}

export function createAfterSalesCase(db, user, payload) {
  const order = db.prepare("SELECT * FROM orders WHERE id = ?").get(payload.orderId);
  if (!order) throw new HttpError(404, "ORDER_NOT_FOUND", "订单不存在");
  if (user.isCustomer && order.customer_id !== user.customerId) {
    throw new HttpError(404, "ORDER_NOT_FOUND", "订单不存在");
  }
  const type = cleanText(payload.type || "QUALITY").toUpperCase();
  if (!["RETURN", "CLAIM", "WRONG_ITEM", "REPLACEMENT", "MARKET_FEEDBACK"].includes(type)) {
    throw new HttpError(400, "VALIDATION_ERROR", "售后类型无效");
  }
  const caseId = id("case");
  const caseNo = serialNumber("AS");
  const createdAt = nowIso();
  db.prepare(`
    INSERT INTO after_sales_cases (
      id, case_no, customer_id, order_id, type, status, description,
      claim_amount, resolution, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, 'OPEN', ?, ?, NULL, ?, ?)
  `).run(
    caseId, caseNo, order.customer_id, order.id, type,
    requireText(payload.description, "问题描述", 2000),
    money(Number(payload.claimAmount) || 0), createdAt, createdAt
  );
  audit(db, user, "CREATE_AFTER_SALES", "AFTER_SALES", caseId, { type, orderId: order.id });
  return getAfterSalesCase(db, user, caseId);
}

export function listAfterSales(db, user) {
  const customerClause = user.isCustomer ? "WHERE a.customer_id = ?" : "";
  const params = user.isCustomer ? [user.customerId] : [];
  return db.prepare(`
    SELECT a.*, c.name AS customer_name, o.order_no
    FROM after_sales_cases a
    JOIN customers c ON c.id = a.customer_id
    LEFT JOIN orders o ON o.id = a.order_id
    ${customerClause}
    ORDER BY a.created_at DESC LIMIT 300
  `).all(...params).map(mapAfterSales);
}

export function getAfterSalesCase(db, user, caseId) {
  const row = db.prepare(`
    SELECT a.*, c.name AS customer_name, o.order_no
    FROM after_sales_cases a
    JOIN customers c ON c.id = a.customer_id
    LEFT JOIN orders o ON o.id = a.order_id
    WHERE a.id = ?
  `).get(caseId);
  if (!row || (user.isCustomer && row.customer_id !== user.customerId)) {
    throw new HttpError(404, "AFTER_SALES_NOT_FOUND", "售后单不存在");
  }
  return mapAfterSales(row);
}

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

export function updateAfterSalesStatus(db, user, caseId, status, resolution = "") {
  requireRoles(user, ["SANLEI_AFTERSALES", "SUPER_ADMIN"]);
  if (!["REVIEWING", "APPROVED", "REJECTED", "CLOSED"].includes(status)) {
    throw new HttpError(400, "VALIDATION_ERROR", "售后状态无效");
  }
  const existing = db.prepare("SELECT * FROM after_sales_cases WHERE id = ?").get(caseId);
  if (!existing) throw new HttpError(404, "AFTER_SALES_NOT_FOUND", "售后单不存在");
  db.prepare(`
    UPDATE after_sales_cases SET status = ?, resolution = ?, updated_at = ? WHERE id = ?
  `).run(status, cleanText(resolution, 2000), nowIso(), caseId);
  audit(db, user, "UPDATE_AFTER_SALES", "AFTER_SALES", caseId, { status, resolution });
  return getAfterSalesCase(db, user, caseId);
}

export function planExecutionReport(db, user) {
  requireStaff(user);
  return db.prepare(`
    SELECT p.plan_month, c.name AS customer_name, c.grade,
      SUM(pi.quantity) AS planned_quantity,
      SUM(pi.ordered_quantity) AS ordered_quantity,
      ROUND(CASE WHEN SUM(pi.quantity) > 0
        THEN SUM(pi.ordered_quantity) * 100.0 / SUM(pi.quantity) ELSE 0 END, 2) AS execution_rate
    FROM plans p
    JOIN customers c ON c.id = p.customer_id
    JOIN plan_items pi ON pi.plan_id = p.id
    WHERE p.status = 'APPROVED'
    GROUP BY p.id
    ORDER BY p.plan_month DESC, c.name
  `).all().map((row) => ({
    planMonth: row.plan_month,
    customerName: row.customer_name,
    grade: row.grade,
    plannedQuantity: row.planned_quantity,
    orderedQuantity: row.ordered_quantity,
    executionRate: row.execution_rate
  }));
}

export function getCustomerProfile(db, customerId) {
  return mapCustomer(db, db.prepare("SELECT * FROM customers WHERE id = ?").get(customerId));
}
