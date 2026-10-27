import crypto from "node:crypto";
import { id, nowIso, verifyPassword } from "./database.js";

export class HttpError extends Error {
  constructor(status, code, message, details = null) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export function withTransaction(db, fn) {
  db.exec("BEGIN IMMEDIATE");
  try {
    const result = fn();
    db.exec("COMMIT");
    return result;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

export function money(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

export function asBoolean(value) {
  return Boolean(Number(value));
}

export function cleanText(value, maxLength = 1000) {
  return String(value ?? "").trim().slice(0, maxLength);
}

export function requireText(value, field, maxLength = 200) {
  const text = cleanText(value, maxLength);
  if (!text) throw new HttpError(400, "VALIDATION_ERROR", `${field}不能为空`);
  return text;
}

export function parsePositiveNumber(value, field) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) {
    throw new HttpError(400, "VALIDATION_ERROR", `${field}必须大于0`);
  }
  return number;
}

export function parsePositiveInteger(value, field) {
  const number = Number(value);
  if (!Number.isInteger(number) || number <= 0) {
    throw new HttpError(400, "VALIDATION_ERROR", `${field}必须为正整数`);
  }
  return number;
}

export function currentShanghaiParts(date = new Date()) {
  const formatter = new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  });
  const parts = Object.fromEntries(formatter.formatToParts(date).map((part) => [part.type, part.value]));
  return parts;
}

export function shanghaiDate(date = new Date()) {
  const p = currentShanghaiParts(date);
  return `${p.year}-${p.month}-${p.day}`;
}

export function settlementWeek(date = new Date()) {
  const dateText = shanghaiDate(date);
  const utc = new Date(`${dateText}T00:00:00Z`);
  const day = utc.getUTCDay() || 7;
  utc.setUTCDate(utc.getUTCDate() - day + 1);
  return utc.toISOString().slice(0, 10);
}

export function serialNumber(prefix) {
  const p = currentShanghaiParts();
  const stamp = `${p.year.slice(-2)}${p.month}${p.day}${p.hour}${p.minute}${p.second}`;
  return `${prefix}-${stamp}-${crypto.randomInt(1000, 9999)}`;
}

export function createSession(db, userId, ttlHours = 24 * 14) {
  const token = crypto.randomBytes(32).toString("base64url");
  const createdAt = nowIso();
  const expiresAt = new Date(Date.now() + ttlHours * 60 * 60 * 1000).toISOString();
  db.prepare("DELETE FROM sessions WHERE expires_at < ?").run(createdAt);
  db.prepare("INSERT INTO sessions (token, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)")
    .run(token, userId, expiresAt, createdAt);
  return token;
}

export function getUserFromToken(db, token) {
  if (!token) return null;
  const row = db.prepare(`
    SELECT u.*, s.expires_at
    FROM sessions s
    JOIN users u ON u.id = s.user_id
    WHERE s.token = ? AND s.expires_at > ? AND u.active = 1
  `).get(token, nowIso());
  if (!row) return null;
  return {
    id: row.id,
    username: row.username,
    displayName: row.display_name,
    phone: row.phone,
    wechatOpenid: row.wechat_openid,
    role: row.role,
    customerId: row.customer_id,
    isCustomer: row.role === "CUSTOMER_ADMIN" || row.role === "CUSTOMER_BUYER"
  };
}

export function loginWithPassword(db, username, password) {
  const user = db.prepare("SELECT * FROM users WHERE username = ? AND active = 1").get(cleanText(username));
  if (!user || !user.password_hash || !verifyPassword(String(password ?? ""), user.password_hash)) {
    throw new HttpError(401, "INVALID_CREDENTIALS", "用户名或密码错误");
  }
  return user;
}

export function requireRoles(user, roles) {
  if (!user || !roles.includes(user.role)) {
    throw new HttpError(403, "FORBIDDEN", "没有执行此操作的权限");
  }
}

export function requireStaff(user) {
  if (!user || user.isCustomer) {
    throw new HttpError(403, "FORBIDDEN", "该接口仅供内部人员使用");
  }
}

export function audit(db, user, action, entityType, entityId, details = null) {
  db.prepare(`
    INSERT INTO audit_logs (id, user_id, action, entity_type, entity_id, details, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    id("audit"),
    user?.id || null,
    action,
    entityType,
    entityId || null,
    details ? JSON.stringify(details) : null,
    nowIso()
  );
}

export function notifyCustomer(db, customerId, title, content) {
  const users = db.prepare(
    "SELECT id FROM users WHERE customer_id = ? AND active = 1 AND role LIKE 'CUSTOMER_%'"
  ).all(customerId);
  const insert = db.prepare(
    "INSERT INTO notifications (id, user_id, title, content, read_at, created_at) VALUES (?, ?, ?, ?, NULL, ?)"
  );
  for (const user of users) {
    insert.run(id("notice"), user.id, title, content, nowIso());
  }
}

export function effectivePrice(db, customerId, productId) {
  const customer = db.prepare("SELECT price_tier FROM customers WHERE id = ? AND active = 1").get(customerId);
  if (!customer) throw new HttpError(404, "CUSTOMER_NOT_FOUND", "客户不存在或已停用");

  const specific = db.prepare(`
    SELECT price FROM customer_prices WHERE customer_id = ? AND product_id = ?
  `).get(customerId, productId);
  if (specific) return { price: money(specific.price), source: "CUSTOMER_SPECIFIC" };

  const tierPrice = db.prepare(`
    SELECT price FROM price_rules WHERE price_tier = ? AND product_id = ?
  `).get(customer.price_tier, productId);
  if (tierPrice) return { price: money(tierPrice.price), source: "PRICE_TIER" };

  throw new HttpError(400, "PRICE_NOT_CONFIGURED", "该产品尚未配置当前客户可用价格");
}

export function productCatalog(db, customerId) {
  const products = db.prepare(`
    SELECT p.*,
      COALESCE(SUM(CASE WHEN i.source_type = 'REAL' THEN i.quantity - i.reserved ELSE 0 END), 0) AS real_available,
      COALESCE(SUM(CASE WHEN i.source_type = 'VIRTUAL' THEN i.quantity - i.reserved ELSE 0 END), 0) AS virtual_available
    FROM products p
    LEFT JOIN inventory i ON i.product_id = p.id
    WHERE p.active = 1
      AND EXISTS (
        SELECT 1 FROM customer_vehicle_authorizations a
        WHERE a.customer_id = ? AND a.vehicle_model = p.vehicle_model AND a.active = 1
      )
    GROUP BY p.id
    ORDER BY p.category, p.name
  `).all(customerId);
  return products.map((product) => {
    try {
      const pricing = effectivePrice(db, customerId, product.id);
      return {
        id: product.id,
        sku: product.sku,
        name: product.name,
        category: product.category,
        vehicleModel: product.vehicle_model,
        minPackage: product.min_package,
        description: product.description,
        warrantyMonths: product.warranty_months,
        warrantyKm: product.warranty_km,
        price: pricing.price,
        priceSource: pricing.source,
        realAvailable: product.real_available,
        virtualAvailable: product.virtual_available,
        available: Math.max(0, product.real_available) + Math.max(0, product.virtual_available)
      };
    } catch (error) {
      if (error.code === "PRICE_NOT_CONFIGURED") return null;
      throw error;
    }
  }).filter(Boolean);
}

export function customerOutstanding(db, customerId) {
  const row = db.prepare(`
    SELECT COALESCE(SUM(
      CASE
        WHEN settlement_method = 'CREDIT' AND status NOT IN ('COMPLETED', 'CANCELLED')
        THEN total_amount - paid_amount
        ELSE 0
      END
    ), 0) AS outstanding
    FROM orders WHERE customer_id = ?
  `).get(customerId);
  return money(row.outstanding);
}

export function mapCustomer(db, customer) {
  if (!customer) return null;
  return {
    id: customer.id,
    code: customer.code,
    name: customer.name,
    province: customer.province,
    city: customer.city,
    channelType: customer.channel_type,
    grade: customer.grade,
    priceTier: customer.price_tier,
    settlementMethod: customer.settlement_method,
    paymentTermsDays: customer.payment_terms_days,
    creditLimit: money(customer.credit_limit),
    creditOutstanding: customerOutstanding(db, customer.id),
    prepayRatio: customer.prepay_ratio,
    batchLimit: customer.batch_limit,
    allowOverpayment: asBoolean(customer.allow_overpayment),
    phone: customer.phone,
    address: customer.address,
    active: asBoolean(customer.active),
    notes: customer.notes,
    createdAt: customer.created_at
  };
}

export function mapProduct(product) {
  return {
    id: product.id,
    sku: product.sku,
    name: product.name,
    category: product.category,
    vehicleModel: product.vehicle_model,
    minPackage: product.min_package,
    basePrice: money(product.base_price),
    warrantyMonths: product.warranty_months,
    warrantyKm: product.warranty_km,
    active: asBoolean(product.active),
    description: product.description
  };
}
