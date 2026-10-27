import {
  HttpError,
  asBoolean,
  audit,
  cleanText,
  effectivePrice,
  mapCustomer,
  mapProduct,
  money,
  parsePositiveInteger,
  parsePositiveNumber,
  requireRoles,
  requireText,
  withTransaction
} from "./core.js";
import { hashPassword, id, nowIso } from "./database.js";

const CHANNEL_TYPES = new Set(["WHOLESALER", "4S_GROUP", "CHAIN"]);
const SETTLEMENT_METHODS = new Set(["CREDIT", "PREPAY"]);

export function listCustomers(db, query = {}) {
  const conditions = [];
  const params = [];
  if (query.keyword) {
    conditions.push("(name LIKE ? OR code LIKE ? OR phone LIKE ?)");
    const keyword = `%${cleanText(query.keyword)}%`;
    params.push(keyword, keyword, keyword);
  }
  if (query.active !== undefined && query.active !== "") {
    conditions.push("active = ?");
    params.push(query.active === "true" || query.active === "1" ? 1 : 0);
  }
  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  return db.prepare(`SELECT * FROM customers ${where} ORDER BY active DESC, created_at DESC`)
    .all(...params)
    .map((customer) => mapCustomer(db, customer));
}

export function saveCustomer(db, user, payload, customerId = null) {
  requireRoles(user, ["SUPER_ADMIN", "BANGBANG_OPS"]);
  const existing = customerId
    ? db.prepare("SELECT * FROM customers WHERE id = ?").get(customerId)
    : null;
  if (customerId && !existing) throw new HttpError(404, "CUSTOMER_NOT_FOUND", "客户不存在");
  const channelType = cleanText(payload.channelType || existing?.channel_type || "WHOLESALER").toUpperCase();
  const settlementMethod = cleanText(payload.settlementMethod || existing?.settlement_method || "CREDIT").toUpperCase();
  if (!CHANNEL_TYPES.has(channelType)) throw new HttpError(400, "VALIDATION_ERROR", "渠道类型无效");
  if (!SETTLEMENT_METHODS.has(settlementMethod)) throw new HttpError(400, "VALIDATION_ERROR", "结算方式无效");
  const values = {
    code: requireText(payload.code ?? existing?.code, "客户编码"),
    name: requireText(payload.name ?? existing?.name, "客户名称"),
    province: cleanText(payload.province ?? existing?.province, 50),
    city: cleanText(payload.city ?? existing?.city, 50),
    channelType,
    grade: requireText(payload.grade ?? existing?.grade, "客户等级", 20),
    priceTier: requireText(payload.priceTier ?? existing?.price_tier, "价格等级", 20),
    settlementMethod,
    paymentTermsDays: nonNegativeInteger(payload.paymentTermsDays ?? existing?.payment_terms_days ?? 0, "账期天数"),
    creditLimit: nonNegativeNumber(payload.creditLimit ?? existing?.credit_limit ?? 0, "信用额度"),
    prepayRatio: ratio(payload.prepayRatio ?? existing?.prepay_ratio ?? 1),
    batchLimit: parsePositiveInteger(payload.batchLimit ?? existing?.batch_limit ?? 3, "最多发货批次"),
    allowOverpayment: payload.allowOverpayment === true || payload.allowOverpayment === 1 ? 1 : 0,
    phone: cleanText(payload.phone ?? existing?.phone, 30),
    address: cleanText(payload.address ?? existing?.address, 500),
    active: payload.active === false || payload.active === 0 ? 0 : 1,
    notes: cleanText(payload.notes ?? existing?.notes, 1000)
  };
  if (values.batchLimit > 20) throw new HttpError(400, "VALIDATION_ERROR", "最多发货批次不能超过20");
  const createdAt = existing?.created_at || nowIso();
  try {
    if (existing) {
      db.prepare(`
        UPDATE customers SET code = ?, name = ?, province = ?, city = ?, channel_type = ?,
          grade = ?, price_tier = ?, settlement_method = ?, payment_terms_days = ?,
          credit_limit = ?, prepay_ratio = ?, batch_limit = ?, allow_overpayment = ?,
          phone = ?, address = ?, active = ?, notes = ?
        WHERE id = ?
      `).run(
        values.code, values.name, values.province, values.city, values.channelType,
        values.grade, values.priceTier, values.settlementMethod, values.paymentTermsDays,
        values.creditLimit, values.prepayRatio, values.batchLimit, values.allowOverpayment,
        values.phone, values.address, values.active, values.notes, customerId
      );
      audit(db, user, "UPDATE_CUSTOMER", "CUSTOMER", customerId, values);
    } else {
      customerId = id("cust");
      db.prepare(`
        INSERT INTO customers (
          id, code, name, province, city, channel_type, grade, price_tier,
          settlement_method, payment_terms_days, credit_limit, prepay_ratio,
          batch_limit, allow_overpayment, phone, address, active, notes, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        customerId, values.code, values.name, values.province, values.city, values.channelType,
        values.grade, values.priceTier, values.settlementMethod, values.paymentTermsDays,
        values.creditLimit, values.prepayRatio, values.batchLimit, values.allowOverpayment,
        values.phone, values.address, values.active, values.notes, createdAt
      );
      audit(db, user, "CREATE_CUSTOMER", "CUSTOMER", customerId, values);
    }
  } catch (error) {
    if (String(error.message).includes("UNIQUE constraint failed: customers.code")) {
      throw new HttpError(409, "CUSTOMER_CODE_EXISTS", "客户编码已存在");
    }
    throw error;
  }
  return mapCustomer(db, db.prepare("SELECT * FROM customers WHERE id = ?").get(customerId));
}

export function listProducts(db) {
  return db.prepare("SELECT * FROM products ORDER BY active DESC, category, name")
    .all()
    .map((product) => {
      const stock = db.prepare(`
        SELECT
          COALESCE(SUM(CASE WHEN source_type = 'REAL' THEN quantity - reserved ELSE 0 END), 0) AS real_available,
          COALESCE(SUM(CASE WHEN source_type = 'VIRTUAL' THEN quantity - reserved ELSE 0 END), 0) AS virtual_available
        FROM inventory WHERE product_id = ?
      `).get(product.id);
      return {
        ...mapProduct(product),
        realAvailable: stock.real_available,
        virtualAvailable: stock.virtual_available,
        available: stock.real_available + stock.virtual_available
      };
    });
}

export function saveProduct(db, user, payload, productId = null) {
  requireRoles(user, ["SUPER_ADMIN", "SANLEI_SALES"]);
  const existing = productId ? db.prepare("SELECT * FROM products WHERE id = ?").get(productId) : null;
  if (productId && !existing) throw new HttpError(404, "PRODUCT_NOT_FOUND", "产品不存在");
  const values = {
    sku: requireText(payload.sku ?? existing?.sku, "物料号", 80),
    name: requireText(payload.name ?? existing?.name, "产品名称", 200),
    category: requireText(payload.category ?? existing?.category, "产品分类", 50),
    vehicleModel: requireText(payload.vehicleModel ?? existing?.vehicle_model, "车型", 100),
    minPackage: parsePositiveInteger(payload.minPackage ?? existing?.min_package ?? 1, "最小包装"),
    basePrice: parsePositiveNumber(payload.basePrice ?? existing?.base_price, "基础价格"),
    warrantyMonths: nonNegativeInteger(payload.warrantyMonths ?? existing?.warranty_months ?? 12, "质保月数"),
    warrantyKm: nonNegativeInteger(payload.warrantyKm ?? existing?.warranty_km ?? 60000, "质保里程"),
    active: payload.active === false || payload.active === 0 ? 0 : 1,
    description: cleanText(payload.description ?? existing?.description, 2000)
  };
  try {
    if (existing) {
      db.prepare(`
        UPDATE products SET sku = ?, name = ?, category = ?, vehicle_model = ?,
          min_package = ?, base_price = ?, warranty_months = ?, warranty_km = ?,
          active = ?, description = ? WHERE id = ?
      `).run(
        values.sku, values.name, values.category, values.vehicleModel, values.minPackage,
        money(values.basePrice), values.warrantyMonths, values.warrantyKm,
        values.active, values.description, productId
      );
      audit(db, user, "UPDATE_PRODUCT", "PRODUCT", productId, values);
    } else {
      productId = id("prod");
      db.prepare(`
        INSERT INTO products (
          id, sku, name, category, vehicle_model, min_package, base_price,
          warranty_months, warranty_km, active, description, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        productId, values.sku, values.name, values.category, values.vehicleModel,
        values.minPackage, money(values.basePrice), values.warrantyMonths,
        values.warrantyKm, values.active, values.description, nowIso()
      );
      audit(db, user, "CREATE_PRODUCT", "PRODUCT", productId, values);
    }
  } catch (error) {
    if (String(error.message).includes("UNIQUE constraint failed: products.sku")) {
      throw new HttpError(409, "PRODUCT_SKU_EXISTS", "物料号已存在");
    }
    throw error;
  }
  return listProducts(db).find((product) => product.id === productId);
}

export function getPriceMatrix(db) {
  const products = db.prepare("SELECT * FROM products WHERE active = 1 ORDER BY category, name").all();
  const rules = db.prepare(`
    SELECT pr.*, p.sku, p.name FROM price_rules pr JOIN products p ON p.id = pr.product_id
    ORDER BY pr.price_tier, p.name
  `).all();
  const customerPrices = db.prepare(`
    SELECT cp.*, c.name AS customer_name, p.sku, p.name AS product_name
    FROM customer_prices cp
    JOIN customers c ON c.id = cp.customer_id
    JOIN products p ON p.id = cp.product_id
    ORDER BY c.name, p.name
  `).all();
  const tiers = [...new Set(rules.map((rule) => rule.price_tier))].sort();
  return {
    tiers,
    products: products.map(mapProduct),
    tierPrices: rules.map((rule) => ({
      id: rule.id,
      tier: rule.price_tier,
      productId: rule.product_id,
      sku: rule.sku,
      productName: rule.name,
      price: money(rule.price)
    })),
    customerPrices: customerPrices.map((price) => ({
      id: price.id,
      customerId: price.customer_id,
      customerName: price.customer_name,
      productId: price.product_id,
      sku: price.sku,
      productName: price.product_name,
      price: money(price.price)
    }))
  };
}

export function setPrice(db, user, payload) {
  requireRoles(user, ["SUPER_ADMIN", "SANLEI_SALES"]);
  const price = parsePositiveNumber(payload.price, "价格");
  const product = db.prepare("SELECT * FROM products WHERE id = ?").get(payload.productId);
  if (!product) throw new HttpError(404, "PRODUCT_NOT_FOUND", "产品不存在");
  const createdAt = nowIso();
  if (payload.scope === "CUSTOMER") {
    const customer = db.prepare("SELECT * FROM customers WHERE id = ?").get(payload.customerId);
    if (!customer) throw new HttpError(404, "CUSTOMER_NOT_FOUND", "客户不存在");
    db.prepare(`
      INSERT INTO customer_prices (id, customer_id, product_id, price, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(customer_id, product_id) DO UPDATE SET price = excluded.price, updated_at = excluded.updated_at
    `).run(id("cp"), customer.id, product.id, money(price), createdAt, createdAt);
    audit(db, user, "SET_CUSTOMER_PRICE", "CUSTOMER", customer.id, {
      productId: product.id, price: money(price)
    });
  } else {
    const tier = requireText(payload.tier, "价格等级", 30);
    db.prepare(`
      INSERT INTO price_rules (id, price_tier, product_id, price, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(price_tier, product_id) DO UPDATE SET price = excluded.price, updated_at = excluded.updated_at
    `).run(id("price"), tier, product.id, money(price), createdAt, createdAt);
    audit(db, user, "SET_TIER_PRICE", "PRODUCT", product.id, { tier, price: money(price) });
  }
  return getPriceMatrix(db);
}

export function previewEffectivePrices(db, customerId) {
  const customer = db.prepare("SELECT * FROM customers WHERE id = ? AND active = 1").get(customerId);
  if (!customer) throw new HttpError(404, "CUSTOMER_NOT_FOUND", "客户不存在");
  const products = db.prepare("SELECT * FROM products WHERE active = 1 ORDER BY category, name").all();
  return products.flatMap((product) => {
    try {
      const pricing = effectivePrice(db, customerId, product.id);
      return [{ productId: product.id, sku: product.sku, name: product.name, ...pricing }];
    } catch (error) {
      if (error.code === "PRICE_NOT_CONFIGURED") return [];
      throw error;
    }
  });
}

export function getCustomerAuthorizations(db, customerId) {
  const customer = db.prepare("SELECT * FROM customers WHERE id = ?").get(customerId);
  if (!customer) throw new HttpError(404, "CUSTOMER_NOT_FOUND", "客户不存在");
  const allVehicles = db.prepare(
    "SELECT DISTINCT vehicle_model FROM products WHERE active = 1 ORDER BY vehicle_model"
  ).all().map((row) => row.vehicle_model);
  const authorized = db.prepare(`
    SELECT vehicle_model FROM customer_vehicle_authorizations
    WHERE customer_id = ? AND active = 1
    ORDER BY vehicle_model
  `).all(customerId).map((row) => row.vehicle_model);
  return {
    customerId,
    province: customer.province,
    city: customer.city,
    allVehicles,
    authorizedVehicles: authorized
  };
}

export function setCustomerAuthorizations(db, user, customerId, vehicles) {
  requireRoles(user, ["SUPER_ADMIN", "SANLEI_SALES"]);
  const customer = db.prepare("SELECT * FROM customers WHERE id = ?").get(customerId);
  if (!customer) throw new HttpError(404, "CUSTOMER_NOT_FOUND", "客户不存在");
  if (!Array.isArray(vehicles) || vehicles.length === 0) {
    throw new HttpError(400, "VALIDATION_ERROR", "至少授权一个车型");
  }
  const validVehicles = new Set(db.prepare("SELECT DISTINCT vehicle_model FROM products WHERE active = 1")
    .all().map((row) => row.vehicle_model));
  for (const vehicle of vehicles) {
    if (!validVehicles.has(vehicle)) {
      throw new HttpError(400, "INVALID_VEHICLE_MODEL", `车型${vehicle}不存在`);
    }
  }
  return withTransaction(db, () => {
    db.prepare("UPDATE customer_vehicle_authorizations SET active = 0 WHERE customer_id = ?")
      .run(customerId);
    const insert = db.prepare(`
      INSERT INTO customer_vehicle_authorizations (
        id, customer_id, vehicle_model, province, city, active, created_at
      ) VALUES (?, ?, ?, ?, ?, 1, ?)
      ON CONFLICT(customer_id, vehicle_model, province, city)
      DO UPDATE SET active = 1
    `);
    for (const vehicle of [...new Set(vehicles)]) {
      insert.run(id("auth"), customerId, vehicle, customer.province, customer.city, nowIso());
    }
    audit(db, user, "SET_VEHICLE_AUTH", "CUSTOMER", customerId, { vehicles });
    return getCustomerAuthorizations(db, customerId);
  });
}

export function listPayments(db) {
  return db.prepare(`
    SELECT pay.*, o.order_no, c.name AS customer_name
    FROM payments pay
    JOIN orders o ON o.id = pay.order_id
    JOIN customers c ON c.id = pay.customer_id
    ORDER BY pay.created_at DESC LIMIT 500
  `).all().map((row) => ({
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

export function listUsers(db) {
  return db.prepare(`
    SELECT u.id, u.username, u.display_name, u.phone, u.role, u.active, u.created_at,
      c.name AS customer_name
    FROM users u LEFT JOIN customers c ON c.id = u.customer_id
    ORDER BY u.created_at
  `).all().map((row) => ({
    id: row.id,
    username: row.username,
    displayName: row.display_name,
    phone: row.phone,
    role: row.role,
    customerName: row.customer_name,
    active: asBoolean(row.active),
    createdAt: row.created_at
  }));
}

export function listSuppliers(db) {
  return db.prepare("SELECT * FROM suppliers ORDER BY active DESC, name").all().map((row) => ({
    id: row.id,
    name: row.name,
    type: row.type,
    contact: row.contact,
    phone: row.phone,
    active: asBoolean(row.active)
  }));
}

export function saveSupplier(db, user, payload, supplierId = null) {
  requireRoles(user, ["SUPER_ADMIN", "SANLEI_SALES", "SANLEI_WAREHOUSE"]);
  const existing = supplierId ? db.prepare("SELECT * FROM suppliers WHERE id = ?").get(supplierId) : null;
  if (supplierId && !existing) throw new HttpError(404, "SUPPLIER_NOT_FOUND", "供应商不存在");
  const values = {
    name: requireText(payload.name ?? existing?.name, "供应商名称"),
    type: cleanText(payload.type ?? existing?.type ?? "INTEGRATOR").toUpperCase(),
    contact: cleanText(payload.contact ?? existing?.contact, 100),
    phone: cleanText(payload.phone ?? existing?.phone, 30),
    active: payload.active === false || payload.active === 0 ? 0 : 1
  };
  if (!["FACTORY", "INTEGRATOR"].includes(values.type)) {
    throw new HttpError(400, "VALIDATION_ERROR", "供应商类型无效");
  }
  if (existing) {
    db.prepare(`
      UPDATE suppliers SET name = ?, type = ?, contact = ?, phone = ?, active = ? WHERE id = ?
    `).run(values.name, values.type, values.contact, values.phone, values.active, supplierId);
    audit(db, user, "UPDATE_SUPPLIER", "SUPPLIER", supplierId, values);
  } else {
    supplierId = id("sup");
    db.prepare(`
      INSERT INTO suppliers (id, name, type, contact, phone, active)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(supplierId, values.name, values.type, values.contact, values.phone, values.active);
    audit(db, user, "CREATE_SUPPLIER", "SUPPLIER", supplierId, values);
  }
  return listSuppliers(db).find((item) => item.id === supplierId);
}

export function createCustomerUser(db, user, payload) {
  requireRoles(user, ["SUPER_ADMIN", "BANGBANG_OPS"]);
  const customer = db.prepare("SELECT * FROM customers WHERE id = ?").get(payload.customerId);
  if (!customer) throw new HttpError(404, "CUSTOMER_NOT_FOUND", "客户不存在");
  const phone = requireText(payload.phone, "手机号", 30);
  const userId = id("user");
  try {
    db.prepare(`
      INSERT INTO users (
        id, username, password_hash, display_name, phone, wechat_openid,
        role, customer_id, active, created_at
      ) VALUES (?, ?, NULL, ?, ?, NULL, ?, ?, 1, ?)
    `).run(
      userId,
      cleanText(payload.username || phone, 80),
      requireText(payload.displayName || customer.name, "账号名称"),
      phone,
      "CUSTOMER_BUYER",
      customer.id,
      nowIso()
    );
  } catch (error) {
    if (String(error.message).includes("UNIQUE")) {
      throw new HttpError(409, "USER_EXISTS", "登录名或手机号已绑定其他账号");
    }
    throw error;
  }
  audit(db, user, "CREATE_CUSTOMER_USER", "USER", userId, { customerId: customer.id, phone });
  return listUsers(db).find((item) => item.id === userId);
}

export function toggleUser(db, user, userId, active) {
  requireRoles(user, ["SUPER_ADMIN"]);
  const existing = db.prepare("SELECT * FROM users WHERE id = ?").get(userId);
  if (!existing) throw new HttpError(404, "USER_NOT_FOUND", "账号不存在");
  if (existing.role === "SUPER_ADMIN" && !active) {
    throw new HttpError(409, "CANNOT_DISABLE_ADMIN", "不能停用超级管理员");
  }
  db.prepare("UPDATE users SET active = ? WHERE id = ?").run(active ? 1 : 0, userId);
  audit(db, user, active ? "ENABLE_USER" : "DISABLE_USER", "USER", userId);
  return listUsers(db).find((item) => item.id === userId);
}

export function createStaffUser(db, user, payload) {
  requireRoles(user, ["SUPER_ADMIN"]);
  const roles = new Set([
    "BANGBANG_OPS",
    "BANGBANG_FINANCE",
    "SANLEI_SALES",
    "SANLEI_WAREHOUSE",
    "SANLEI_FINANCE",
    "SANLEI_AFTERSALES"
  ]);
  const role = cleanText(payload.role).toUpperCase();
  if (!roles.has(role)) throw new HttpError(400, "VALIDATION_ERROR", "内部角色无效");
  const password = requireText(payload.password, "登录密码", 200);
  if (password.length < 8) throw new HttpError(400, "WEAK_PASSWORD", "登录密码至少8位");
  const userId = id("user");
  try {
    db.prepare(`
      INSERT INTO users (
        id, username, password_hash, display_name, phone, wechat_openid,
        role, customer_id, active, created_at
      ) VALUES (?, ?, ?, ?, ?, NULL, ?, NULL, 1, ?)
    `).run(
      userId,
      requireText(payload.username, "登录名", 80),
      hashPassword(password),
      requireText(payload.displayName, "姓名", 100),
      cleanText(payload.phone, 30),
      role,
      nowIso()
    );
  } catch (error) {
    if (String(error.message).includes("UNIQUE")) throw new HttpError(409, "USER_EXISTS", "登录名已存在");
    throw error;
  }
  audit(db, user, "CREATE_STAFF_USER", "USER", userId, { role });
  return listUsers(db).find((item) => item.id === userId);
}

export function getAuditLogs(db) {
  return db.prepare(`
    SELECT a.*, u.display_name FROM audit_logs a
    LEFT JOIN users u ON u.id = a.user_id
    ORDER BY a.created_at DESC LIMIT 500
  `).all().map((row) => ({
    id: row.id,
    userName: row.display_name || "系统",
    action: row.action,
    entityType: row.entity_type,
    entityId: row.entity_id,
    details: row.details,
    createdAt: row.created_at
  }));
}

function nonNegativeInteger(value, field) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 0) {
    throw new HttpError(400, "VALIDATION_ERROR", `${field}必须为非负整数`);
  }
  return number;
}

function nonNegativeNumber(value, field) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) {
    throw new HttpError(400, "VALIDATION_ERROR", `${field}必须为非负数`);
  }
  return number;
}

function ratio(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0 || number > 1) {
    throw new HttpError(400, "VALIDATION_ERROR", "预付款比例必须大于0且不超过1");
  }
  return Math.round(number * 10000) / 10000;
}
