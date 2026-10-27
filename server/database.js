import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { DatabaseSync } from "node:sqlite";

export const DEFAULT_DB_PATH = path.resolve(process.cwd(), "data", "order-system.db");

export function nowIso() {
  return new Date().toISOString();
}

export function id(prefix = "id") {
  return `${prefix}_${crypto.randomUUID()}`;
}

export function hashPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(password, stored) {
  const [salt, expected] = String(stored || "").split(":");
  if (!salt || !expected) return false;
  const actual = crypto.scryptSync(password, salt, 64);
  const expectedBuffer = Buffer.from(expected, "hex");
  return expectedBuffer.length === actual.length && crypto.timingSafeEqual(expectedBuffer, actual);
}

export function createDatabase(file = DEFAULT_DB_PATH) {
  if (file !== ":memory:") {
    fs.mkdirSync(path.dirname(file), { recursive: true });
  }
  const db = new DatabaseSync(file);
  db.exec("PRAGMA foreign_keys = ON;");
  db.exec("PRAGMA journal_mode = WAL;");
  db.exec("PRAGMA busy_timeout = 5000;");
  migrate(db);
  seed(db);
  backfill(db);
  return db;
}

function migrate(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT,
      display_name TEXT NOT NULL,
      phone TEXT,
      wechat_openid TEXT,
      role TEXT NOT NULL,
      customer_id TEXT,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      FOREIGN KEY (customer_id) REFERENCES customers(id)
    );

    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS customers (
      id TEXT PRIMARY KEY,
      code TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      province TEXT,
      city TEXT,
      channel_type TEXT NOT NULL,
      grade TEXT NOT NULL,
      price_tier TEXT NOT NULL,
      settlement_method TEXT NOT NULL DEFAULT 'CREDIT',
      payment_terms_days INTEGER NOT NULL DEFAULT 0,
      credit_limit REAL NOT NULL DEFAULT 0,
      prepay_ratio REAL NOT NULL DEFAULT 1,
      batch_limit INTEGER NOT NULL DEFAULT 3,
      allow_overpayment INTEGER NOT NULL DEFAULT 0,
      phone TEXT,
      address TEXT,
      active INTEGER NOT NULL DEFAULT 1,
      notes TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS customer_vehicle_authorizations (
      id TEXT PRIMARY KEY,
      customer_id TEXT NOT NULL,
      vehicle_model TEXT NOT NULL,
      province TEXT,
      city TEXT,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      UNIQUE (customer_id, vehicle_model, province, city),
      FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS suppliers (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      contact TEXT,
      phone TEXT,
      active INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS products (
      id TEXT PRIMARY KEY,
      sku TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      category TEXT NOT NULL,
      vehicle_model TEXT NOT NULL,
      min_package INTEGER NOT NULL DEFAULT 1,
      base_price REAL NOT NULL,
      warranty_months INTEGER NOT NULL DEFAULT 12,
      warranty_km INTEGER NOT NULL DEFAULT 60000,
      active INTEGER NOT NULL DEFAULT 1,
      description TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS price_rules (
      id TEXT PRIMARY KEY,
      price_tier TEXT NOT NULL,
      product_id TEXT NOT NULL,
      price REAL NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE (price_tier, product_id),
      FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS customer_prices (
      id TEXT PRIMARY KEY,
      customer_id TEXT NOT NULL,
      product_id TEXT NOT NULL,
      price REAL NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE (customer_id, product_id),
      FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE,
      FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS inventory (
      id TEXT PRIMARY KEY,
      product_id TEXT NOT NULL,
      warehouse_name TEXT NOT NULL,
      source_type TEXT NOT NULL,
      supplier_id TEXT,
      quantity INTEGER NOT NULL DEFAULT 0,
      reserved INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (product_id) REFERENCES products(id),
      FOREIGN KEY (supplier_id) REFERENCES suppliers(id)
    );

    CREATE TABLE IF NOT EXISTS inventory_movements (
      id TEXT PRIMARY KEY,
      inventory_id TEXT NOT NULL,
      type TEXT NOT NULL,
      quantity INTEGER NOT NULL,
      reference_type TEXT,
      reference_id TEXT,
      note TEXT,
      created_by TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (inventory_id) REFERENCES inventory(id)
    );

    CREATE TABLE IF NOT EXISTS plans (
      id TEXT PRIMARY KEY,
      plan_no TEXT UNIQUE NOT NULL,
      customer_id TEXT NOT NULL,
      plan_month TEXT NOT NULL,
      status TEXT NOT NULL,
      customer_note TEXT,
      bangbang_note TEXT,
      sanlei_note TEXT,
      submitted_at TEXT,
      bangbang_reviewed_at TEXT,
      sanlei_reviewed_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (customer_id) REFERENCES customers(id)
    );

    CREATE TABLE IF NOT EXISTS plan_items (
      id TEXT PRIMARY KEY,
      plan_id TEXT NOT NULL,
      week_no INTEGER NOT NULL,
      product_id TEXT NOT NULL,
      quantity INTEGER NOT NULL,
      ordered_quantity INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (plan_id) REFERENCES plans(id) ON DELETE CASCADE,
      FOREIGN KEY (product_id) REFERENCES products(id)
    );

    CREATE TABLE IF NOT EXISTS order_groups (
      id TEXT PRIMARY KEY,
      group_no TEXT UNIQUE NOT NULL,
      customer_id TEXT NOT NULL,
      settlement_week TEXT NOT NULL,
      settlement_method TEXT NOT NULL,
      currency TEXT NOT NULL DEFAULT 'CNY',
      tax_mode TEXT NOT NULL DEFAULT 'INCLUDED',
      created_at TEXT NOT NULL,
      FOREIGN KEY (customer_id) REFERENCES customers(id)
    );

    CREATE TABLE IF NOT EXISTS orders (
      id TEXT PRIMARY KEY,
      order_no TEXT UNIQUE NOT NULL,
      group_id TEXT NOT NULL,
      customer_id TEXT NOT NULL,
      vehicle_model TEXT NOT NULL,
      order_type TEXT NOT NULL,
      settlement_method TEXT NOT NULL,
      status TEXT NOT NULL,
      total_amount REAL NOT NULL,
      paid_amount REAL NOT NULL DEFAULT 0,
      shipped_amount REAL NOT NULL DEFAULT 0,
      prepay_ratio REAL NOT NULL,
      allow_overpayment INTEGER NOT NULL DEFAULT 0,
      batch_limit INTEGER NOT NULL DEFAULT 3,
      plan_id TEXT,
      plan_week INTEGER,
      customer_note TEXT,
      ops_note TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (group_id) REFERENCES order_groups(id),
      FOREIGN KEY (customer_id) REFERENCES customers(id),
      FOREIGN KEY (plan_id) REFERENCES plans(id)
    );

    CREATE TABLE IF NOT EXISTS order_items (
      id TEXT PRIMARY KEY,
      order_id TEXT NOT NULL,
      product_id TEXT NOT NULL,
      quantity INTEGER NOT NULL,
      unit_price REAL NOT NULL,
      amount REAL NOT NULL,
      reserved_quantity INTEGER NOT NULL DEFAULT 0,
      shipped_quantity INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
      FOREIGN KEY (product_id) REFERENCES products(id)
    );

    CREATE TABLE IF NOT EXISTS reservations (
      id TEXT PRIMARY KEY,
      order_item_id TEXT NOT NULL,
      inventory_id TEXT NOT NULL,
      quantity INTEGER NOT NULL,
      consumed_quantity INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      FOREIGN KEY (order_item_id) REFERENCES order_items(id) ON DELETE CASCADE,
      FOREIGN KEY (inventory_id) REFERENCES inventory(id)
    );

    CREATE TABLE IF NOT EXISTS payments (
      id TEXT PRIMARY KEY,
      payment_no TEXT UNIQUE NOT NULL,
      customer_id TEXT NOT NULL,
      order_id TEXT NOT NULL,
      amount REAL NOT NULL,
      channel TEXT NOT NULL,
      status TEXT NOT NULL,
      transaction_id TEXT,
      prepay_id TEXT,
      paid_at TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (customer_id) REFERENCES customers(id),
      FOREIGN KEY (order_id) REFERENCES orders(id)
    );

    CREATE TABLE IF NOT EXISTS shipments (
      id TEXT PRIMARY KEY,
      shipment_no TEXT UNIQUE NOT NULL,
      order_id TEXT NOT NULL,
      batch_no INTEGER NOT NULL,
      status TEXT NOT NULL,
      logistics_company TEXT,
      tracking_no TEXT,
      dispatch_location TEXT,
      delivery_mode TEXT NOT NULL DEFAULT 'DELIVERY',
      amount REAL NOT NULL,
      shipped_at TEXT,
      received_at TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (order_id) REFERENCES orders(id)
    );

    CREATE TABLE IF NOT EXISTS shipment_items (
      id TEXT PRIMARY KEY,
      shipment_id TEXT NOT NULL,
      order_item_id TEXT NOT NULL,
      product_id TEXT NOT NULL,
      quantity INTEGER NOT NULL,
      amount REAL NOT NULL,
      FOREIGN KEY (shipment_id) REFERENCES shipments(id) ON DELETE CASCADE,
      FOREIGN KEY (order_item_id) REFERENCES order_items(id),
      FOREIGN KEY (product_id) REFERENCES products(id)
    );

    CREATE TABLE IF NOT EXISTS after_sales_cases (
      id TEXT PRIMARY KEY,
      case_no TEXT UNIQUE NOT NULL,
      customer_id TEXT NOT NULL,
      order_id TEXT,
      type TEXT NOT NULL,
      status TEXT NOT NULL,
      description TEXT NOT NULL,
      claim_amount REAL NOT NULL DEFAULT 0,
      resolution TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (customer_id) REFERENCES customers(id),
      FOREIGN KEY (order_id) REFERENCES orders(id)
    );

    CREATE TABLE IF NOT EXISTS invoices (
      id TEXT PRIMARY KEY,
      invoice_no TEXT UNIQUE NOT NULL,
      order_id TEXT NOT NULL,
      customer_id TEXT NOT NULL,
      title TEXT NOT NULL,
      tax_number TEXT,
      amount REAL NOT NULL,
      tax_rate REAL NOT NULL DEFAULT 13,
      status TEXT NOT NULL DEFAULT 'PENDING',
      note TEXT,
      issued_at TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (order_id) REFERENCES orders(id),
      FOREIGN KEY (customer_id) REFERENCES customers(id)
    );

    CREATE TABLE IF NOT EXISTS freight_charges (
      id TEXT PRIMARY KEY,
      order_id TEXT NOT NULL,
      customer_id TEXT NOT NULL,
      amount REAL NOT NULL,
      payer TEXT NOT NULL DEFAULT 'CUSTOMER',
      status TEXT NOT NULL DEFAULT 'PENDING',
      description TEXT,
      settled_at TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (order_id) REFERENCES orders(id),
      FOREIGN KEY (customer_id) REFERENCES customers(id)
    );

    CREATE TABLE IF NOT EXISTS financial_adjustments (
      id TEXT PRIMARY KEY,
      adjustment_no TEXT UNIQUE NOT NULL,
      customer_id TEXT NOT NULL,
      order_id TEXT,
      type TEXT NOT NULL,
      amount REAL NOT NULL,
      status TEXT NOT NULL DEFAULT 'PENDING',
      description TEXT,
      settled_at TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (customer_id) REFERENCES customers(id),
      FOREIGN KEY (order_id) REFERENCES orders(id)
    );

    CREATE TABLE IF NOT EXISTS notifications (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      read_at TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      action TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id TEXT,
      details TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_users_customer ON users(customer_id);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_users_wechat_openid ON users(wechat_openid) WHERE wechat_openid IS NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_plans_customer ON plans(customer_id, plan_month);
    CREATE INDEX IF NOT EXISTS idx_orders_customer ON orders(customer_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
    CREATE INDEX IF NOT EXISTS idx_payments_order ON payments(order_id);
    CREATE INDEX IF NOT EXISTS idx_shipments_order ON shipments(order_id);
    CREATE INDEX IF NOT EXISTS idx_inventory_product ON inventory(product_id);
    CREATE INDEX IF NOT EXISTS idx_customer_vehicle_auth ON customer_vehicle_authorizations(customer_id, vehicle_model);
    CREATE INDEX IF NOT EXISTS idx_invoices_order ON invoices(order_id);
    CREATE INDEX IF NOT EXISTS idx_freight_order ON freight_charges(order_id);
  `);
  ensureColumn(db, "shipments", "dispatch_location", "TEXT");
}

function ensureColumn(db, table, column, definition) {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all();
  if (!columns.some((item) => item.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

function seed(db) {
  const existing = db.prepare("SELECT COUNT(*) AS count FROM users").get();
  if (existing.count > 0) return;

  const createdAt = nowIso();
  const password = process.env.DEMO_ADMIN_PASSWORD || "Admin@123";
  const customerId = "cust_shanghai_mingche";
  const customer2Id = "cust_guangzhou_xingchi";
  const customer3Id = "cust_hangzhou_lianhe";

  const insertCustomer = db.prepare(`
    INSERT INTO customers (
      id, code, name, province, city, channel_type, grade, price_tier,
      settlement_method, payment_terms_days, credit_limit, prepay_ratio,
      batch_limit, allow_overpayment, phone, address, active, notes, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  insertCustomer.run(
    customerId, "CUS-001", "上海明澈汽配有限公司", "上海市", "上海市", "WHOLESALER",
    "A+", "VIP", "CREDIT", 40, 50000, 1, 3, 0, "13800000001",
    "上海市嘉定区汽车城安亭路88号", 1, "传祺、埃安核心批发客户", createdAt
  );
  insertCustomer.run(
    customer2Id, "CUS-002", "广州星驰汽车服务集团", "广东省", "广州市", "4S_GROUP",
    "A", "GOLD", "PREPAY", 0, 20000, 0.5, 3, 0, "13800000002",
    "广州市白云区机场路1668号", 1, "4S集团集成服务客户", createdAt
  );
  insertCustomer.run(
    customer3Id, "CUS-003", "杭州联和汽配连锁", "浙江省", "杭州市", "CHAIN",
    "B+", "STANDARD", "CREDIT", 20, 20000, 1, 2, 0, "13800000003",
    "杭州市拱墅区石祥路588号", 1, "小规模连锁渠道", createdAt
  );

  const insertUser = db.prepare(`
    INSERT INTO users (id, username, password_hash, display_name, phone, role, customer_id, active, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)
  `);
  insertUser.run("usr_admin", "admin", hashPassword(password), "系统管理员", "", "SUPER_ADMIN", null, createdAt);
  insertUser.run("usr_bangbang", "bangbang", hashPassword(password), "邦邦订单运营", "", "BANGBANG_OPS", null, createdAt);
  insertUser.run("usr_bangbang_fin", "bangbang-finance", hashPassword(password), "邦邦应收财务", "", "BANGBANG_FINANCE", null, createdAt);
  insertUser.run("usr_sanlei", "sanlei", hashPassword(password), "三磊销售内勤", "", "SANLEI_SALES", null, createdAt);
  insertUser.run("usr_warehouse", "warehouse", hashPassword(password), "三磊仓库", "", "SANLEI_WAREHOUSE", null, createdAt);
  insertUser.run("usr_finance", "finance", hashPassword(password), "三磊财务", "", "SANLEI_FINANCE", null, createdAt);
  insertUser.run("usr_service", "service", hashPassword(password), "三磊售后", "", "SANLEI_AFTERSALES", null, createdAt);
  insertUser.run("usr_customer_1", "mingche", null, "明澈汽配采购员", "13800000001", "CUSTOMER_BUYER", customerId, createdAt);
  insertUser.run("usr_customer_2", "xingchi", null, "星驰汽配采购员", "13800000002", "CUSTOMER_BUYER", customer2Id, createdAt);
  insertUser.run("usr_customer_3", "lianhe", null, "联和汽配采购员", "13800000003", "CUSTOMER_BUYER", customer3Id, createdAt);

  const supplierId = "sup_factory_sanlei";
  db.prepare("INSERT INTO suppliers (id, name, type, contact, phone, active) VALUES (?, ?, ?, ?, ?, 1)")
    .run(supplierId, "三磊工厂直供", "FACTORY", "王经理", "021-60000001");

  const insertProduct = db.prepare(`
    INSERT INTO products (
      id, sku, name, category, vehicle_model, min_package, base_price,
      warranty_months, warranty_km, active, description, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
  `);
  const products = [
    ["prod_ball_m8", "SL-B001", "高性能转向球头", "球头", "传祺M8", 10, 128, 24, 60000, "高强度合金钢，适配传祺M8前悬挂"],
    ["prod_arm_ae", "SL-A001", "前下摆臂总成", "摆臂", "埃安Y", 2, 460, 24, 60000, "含衬套与球头总成"],
    ["prod_shock_gs", "SL-S001", "前减震器", "减震器", "传祺GS8", 2, 680, 12, 60000, "原厂适配阻尼曲线"],
    ["prod_ball_ae", "SL-B002", "加强型平衡杆球头", "球头", "埃安S", 10, 96, 12, 60000, "防尘罩加强版"],
    ["prod_arm_m8", "SL-A002", "上摆臂总成", "摆臂", "传祺M8", 2, 520, 24, 60000, "左右通用型"],
    ["prod_shock_ae", "SL-S002", "后减震器", "减震器", "埃安Y", 2, 590, 12, 60000, "城市道路舒适调校"]
  ];
  for (const [productId, sku, name, category, vehicle, minPackage, basePrice, months, km, description] of products) {
    insertProduct.run(productId, sku, name, category, vehicle, minPackage, basePrice, months, km, description, createdAt);
  }

  const priceInsert = db.prepare(`
    INSERT INTO price_rules (id, price_tier, product_id, price, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  const tierFactors = { VIP: 0.82, GOLD: 0.9, STANDARD: 1 };
  for (const [productId, , , , , , basePrice] of products) {
    for (const [tier, factor] of Object.entries(tierFactors)) {
      const price = Math.round(basePrice * factor * 100) / 100;
      priceInsert.run(id("price"), tier, productId, price, createdAt, createdAt);
    }
  }
  db.prepare(`
    INSERT INTO customer_prices (id, customer_id, product_id, price, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(id("cp"), customerId, "prod_ball_m8", 99, createdAt, createdAt);

  const inventoryInsert = db.prepare(`
    INSERT INTO inventory (id, product_id, warehouse_name, source_type, supplier_id, quantity, reserved, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  for (const [index, [productId]] of products.entries()) {
    inventoryInsert.run(id("inv"), productId, "上海总仓", "REAL", null, 100 + index * 15, 0, createdAt);
    inventoryInsert.run(id("inv"), productId, "供应商储备仓", "VIRTUAL", supplierId, 30 + index * 5, 0, createdAt);
  }

  const settingsInsert = db.prepare("INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)");
  settingsInsert.run("company_name", "上海三磊汽车转向悬挂系统", createdAt);
  settingsInsert.run("service_provider", "邦邦汽服", createdAt);
  settingsInsert.run("wechat_mode", process.env.WECHAT_MODE || "mock", createdAt);
  settingsInsert.run("default_batch_limit", "3", createdAt);
}

function backfill(db) {
  const authorizationCount = db.prepare(
    "SELECT COUNT(*) AS count FROM customer_vehicle_authorizations"
  ).get().count;
  if (authorizationCount > 0) return;
  const customers = db.prepare(
    "SELECT id, province, city FROM customers WHERE active = 1"
  ).all();
  const vehicles = db.prepare(
    "SELECT DISTINCT vehicle_model FROM products WHERE active = 1"
  ).all();
  const insert = db.prepare(`
    INSERT OR IGNORE INTO customer_vehicle_authorizations (
      id, customer_id, vehicle_model, province, city, active, created_at
    ) VALUES (?, ?, ?, ?, ?, 1, ?)
  `);
  const createdAt = nowIso();
  for (const customer of customers) {
    for (const vehicle of vehicles) {
      insert.run(id("auth"), customer.id, vehicle.vehicle_model, customer.province, customer.city, createdAt);
    }
  }
}
