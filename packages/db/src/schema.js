// MySQL 8 schema（Drizzle ORM），对应 packages/db/sql/001_init.sql。
// 注意：DDL 以 sql/*.sql 为准（迁移由 src/migrate.js 执行）；本文件用于查询构建与类型提示。
// 约定：id 使用 VARCHAR(64)；时间保持 ISO 字符串（VARCHAR(32)），保证与旧代码的字符串比较语义一致，
// 金额使用 DECIMAL(14,2)，比例使用 DECIMAL(6,4)。后续可在独立阶段统一改为 DATETIME/DECIMAL 规范。
import {
  mysqlTable,
  varchar,
  int,
  decimal,
  text,
  unique,
  uniqueIndex,
  index
} from "drizzle-orm/mysql-core";

const iso = (name) => varchar(name, { length: 32 });
const id = (name = "id") => varchar(name, { length: 64 }).primaryKey();
const money = (name) => decimal(name, { precision: 14, scale: 2 });
const ratio = (name) => decimal(name, { precision: 6, scale: 4 });

export const customers = mysqlTable("customers", {
  id: id(),
  code: varchar("code", { length: 80 }).notNull().unique(),
  name: varchar("name", { length: 200 }).notNull(),
  province: varchar("province", { length: 50 }),
  city: varchar("city", { length: 50 }),
  channelType: varchar("channel_type", { length: 32 }).notNull(),
  grade: varchar("grade", { length: 20 }).notNull(),
  priceTier: varchar("price_tier", { length: 32 }).notNull(),
  settlementMethod: varchar("settlement_method", { length: 32 }).notNull().default("CREDIT"),
  paymentTermsDays: int("payment_terms_days").notNull().default(0),
  creditLimit: money("credit_limit").notNull().default("0.00"),
  prepayRatio: ratio("prepay_ratio").notNull().default("1.0000"),
  batchLimit: int("batch_limit").notNull().default(3),
  allowOverpayment: int("allow_overpayment").notNull().default(0),
  phone: varchar("phone", { length: 32 }),
  address: varchar("address", { length: 500 }),
  active: int("active").notNull().default(1),
  notes: text("notes"),
  createdAt: iso("created_at").notNull()
});

export const users = mysqlTable("users", {
  id: id(),
  username: varchar("username", { length: 80 }).notNull().unique(),
  passwordHash: text("password_hash"),
  displayName: varchar("display_name", { length: 100 }).notNull(),
  phone: varchar("phone", { length: 32 }),
  wechatOpenid: varchar("wechat_openid", { length: 128 }),
  role: varchar("role", { length: 32 }).notNull(),
  customerId: varchar("customer_id", { length: 64 }).references(() => customers.id),
  active: int("active").notNull().default(1),
  createdAt: iso("created_at").notNull()
}, (t) => [
  index("idx_users_customer").on(t.customerId),
  uniqueIndex("idx_users_wechat_openid").on(t.wechatOpenid)
]);

export const sessions = mysqlTable("sessions", {
  token: varchar("token", { length: 64 }).primaryKey(),
  userId: varchar("user_id", { length: 64 }).notNull().references(() => users.id, { onDelete: "cascade" }),
  expiresAt: iso("expires_at").notNull(),
  createdAt: iso("created_at").notNull()
});

export const customerVehicleAuthorizations = mysqlTable("customer_vehicle_authorizations", {
  id: id(),
  customerId: varchar("customer_id", { length: 64 }).notNull().references(() => customers.id, { onDelete: "cascade" }),
  vehicleModel: varchar("vehicle_model", { length: 100 }).notNull(),
  province: varchar("province", { length: 50 }),
  city: varchar("city", { length: 50 }),
  active: int("active").notNull().default(1),
  createdAt: iso("created_at").notNull()
}, (t) => [
  unique("uq_customer_vehicle").on(t.customerId, t.vehicleModel, t.province, t.city),
  index("idx_customer_vehicle_auth").on(t.customerId, t.vehicleModel)
]);

export const suppliers = mysqlTable("suppliers", {
  id: id(),
  name: varchar("name", { length: 200 }).notNull(),
  type: varchar("type", { length: 32 }).notNull(),
  contact: varchar("contact", { length: 100 }),
  phone: varchar("phone", { length: 32 }),
  active: int("active").notNull().default(1)
});

export const products = mysqlTable("products", {
  id: id(),
  sku: varchar("sku", { length: 80 }).notNull().unique(),
  name: varchar("name", { length: 200 }).notNull(),
  category: varchar("category", { length: 50 }).notNull(),
  vehicleModel: varchar("vehicle_model", { length: 100 }).notNull(),
  minPackage: int("min_package").notNull().default(1),
  basePrice: money("base_price").notNull(),
  warrantyMonths: int("warranty_months").notNull().default(12),
  warrantyKm: int("warranty_km").notNull().default(60000),
  active: int("active").notNull().default(1),
  description: text("description"),
  createdAt: iso("created_at").notNull()
});

export const priceRules = mysqlTable("price_rules", {
  id: id(),
  priceTier: varchar("price_tier", { length: 32 }).notNull(),
  productId: varchar("product_id", { length: 64 }).notNull().references(() => products.id, { onDelete: "cascade" }),
  price: money("price").notNull(),
  createdAt: iso("created_at").notNull(),
  updatedAt: iso("updated_at").notNull()
}, (t) => [unique("uq_price_tier_product").on(t.priceTier, t.productId)]);

export const customerPrices = mysqlTable("customer_prices", {
  id: id(),
  customerId: varchar("customer_id", { length: 64 }).notNull().references(() => customers.id, { onDelete: "cascade" }),
  productId: varchar("product_id", { length: 64 }).notNull().references(() => products.id, { onDelete: "cascade" }),
  price: money("price").notNull(),
  createdAt: iso("created_at").notNull(),
  updatedAt: iso("updated_at").notNull()
}, (t) => [unique("uq_customer_product_price").on(t.customerId, t.productId)]);

export const inventory = mysqlTable("inventory", {
  id: id(),
  productId: varchar("product_id", { length: 64 }).notNull().references(() => products.id),
  warehouseName: varchar("warehouse_name", { length: 100 }).notNull(),
  sourceType: varchar("source_type", { length: 16 }).notNull(),
  supplierId: varchar("supplier_id", { length: 64 }).references(() => suppliers.id),
  quantity: int("quantity").notNull().default(0),
  reserved: int("reserved").notNull().default(0),
  updatedAt: iso("updated_at").notNull()
}, (t) => [index("idx_inventory_product").on(t.productId)]);

export const inventoryMovements = mysqlTable("inventory_movements", {
  id: id(),
  inventoryId: varchar("inventory_id", { length: 64 }).notNull().references(() => inventory.id),
  type: varchar("type", { length: 32 }).notNull(),
  quantity: int("quantity").notNull(),
  referenceType: varchar("reference_type", { length: 32 }),
  referenceId: varchar("reference_id", { length: 64 }),
  note: varchar("note", { length: 500 }),
  createdBy: varchar("created_by", { length: 64 }),
  createdAt: iso("created_at").notNull()
});

export const plans = mysqlTable("plans", {
  id: id(),
  planNo: varchar("plan_no", { length: 64 }).notNull().unique(),
  customerId: varchar("customer_id", { length: 64 }).notNull().references(() => customers.id),
  planMonth: varchar("plan_month", { length: 7 }).notNull(),
  status: varchar("status", { length: 32 }).notNull(),
  customerNote: text("customer_note"),
  bangbangNote: text("bangbang_note"),
  sanleiNote: text("sanlei_note"),
  submittedAt: iso("submitted_at"),
  bangbangReviewedAt: iso("bangbang_reviewed_at"),
  sanleiReviewedAt: iso("sanlei_reviewed_at"),
  createdAt: iso("created_at").notNull(),
  updatedAt: iso("updated_at").notNull()
}, (t) => [index("idx_plans_customer").on(t.customerId, t.planMonth)]);

export const planItems = mysqlTable("plan_items", {
  id: id(),
  planId: varchar("plan_id", { length: 64 }).notNull().references(() => plans.id, { onDelete: "cascade" }),
  weekNo: int("week_no").notNull(),
  productId: varchar("product_id", { length: 64 }).notNull().references(() => products.id),
  quantity: int("quantity").notNull(),
  orderedQuantity: int("ordered_quantity").notNull().default(0)
});

export const orderGroups = mysqlTable("order_groups", {
  id: id(),
  groupNo: varchar("group_no", { length: 64 }).notNull().unique(),
  customerId: varchar("customer_id", { length: 64 }).notNull().references(() => customers.id),
  settlementWeek: varchar("settlement_week", { length: 16 }).notNull(),
  settlementMethod: varchar("settlement_method", { length: 32 }).notNull(),
  currency: varchar("currency", { length: 8 }).notNull().default("CNY"),
  taxMode: varchar("tax_mode", { length: 16 }).notNull().default("INCLUDED"),
  createdAt: iso("created_at").notNull()
});

export const orders = mysqlTable("orders", {
  id: id(),
  orderNo: varchar("order_no", { length: 64 }).notNull().unique(),
  groupId: varchar("group_id", { length: 64 }).notNull().references(() => orderGroups.id),
  customerId: varchar("customer_id", { length: 64 }).notNull().references(() => customers.id),
  vehicleModel: varchar("vehicle_model", { length: 100 }).notNull(),
  orderType: varchar("order_type", { length: 32 }).notNull(),
  settlementMethod: varchar("settlement_method", { length: 32 }).notNull(),
  status: varchar("status", { length: 32 }).notNull(),
  totalAmount: money("total_amount").notNull(),
  paidAmount: money("paid_amount").notNull().default("0.00"),
  shippedAmount: money("shipped_amount").notNull().default("0.00"),
  prepayRatio: ratio("prepay_ratio").notNull(),
  allowOverpayment: int("allow_overpayment").notNull().default(0),
  batchLimit: int("batch_limit").notNull().default(3),
  planId: varchar("plan_id", { length: 64 }).references(() => plans.id),
  planWeek: int("plan_week"),
  customerNote: text("customer_note"),
  opsNote: text("ops_note"),
  createdAt: iso("created_at").notNull(),
  updatedAt: iso("updated_at").notNull()
}, (t) => [
  index("idx_orders_customer").on(t.customerId, t.createdAt),
  index("idx_orders_status").on(t.status)
]);

export const orderItems = mysqlTable("order_items", {
  id: id(),
  orderId: varchar("order_id", { length: 64 }).notNull().references(() => orders.id, { onDelete: "cascade" }),
  productId: varchar("product_id", { length: 64 }).notNull().references(() => products.id),
  quantity: int("quantity").notNull(),
  unitPrice: money("unit_price").notNull(),
  amount: money("amount").notNull(),
  reservedQuantity: int("reserved_quantity").notNull().default(0),
  shippedQuantity: int("shipped_quantity").notNull().default(0)
});

export const reservations = mysqlTable("reservations", {
  id: id(),
  orderItemId: varchar("order_item_id", { length: 64 }).notNull().references(() => orderItems.id, { onDelete: "cascade" }),
  inventoryId: varchar("inventory_id", { length: 64 }).notNull().references(() => inventory.id),
  quantity: int("quantity").notNull(),
  consumedQuantity: int("consumed_quantity").notNull().default(0),
  createdAt: iso("created_at").notNull()
});

export const payments = mysqlTable("payments", {
  id: id(),
  paymentNo: varchar("payment_no", { length: 64 }).notNull().unique(),
  customerId: varchar("customer_id", { length: 64 }).notNull().references(() => customers.id),
  orderId: varchar("order_id", { length: 64 }).notNull().references(() => orders.id),
  amount: money("amount").notNull(),
  channel: varchar("channel", { length: 16 }).notNull(),
  status: varchar("status", { length: 32 }).notNull(),
  transactionId: varchar("transaction_id", { length: 128 }),
  prepayId: varchar("prepay_id", { length: 128 }),
  paidAt: iso("paid_at"),
  createdAt: iso("created_at").notNull()
}, (t) => [index("idx_payments_order").on(t.orderId)]);

export const shipments = mysqlTable("shipments", {
  id: id(),
  shipmentNo: varchar("shipment_no", { length: 64 }).notNull().unique(),
  orderId: varchar("order_id", { length: 64 }).notNull().references(() => orders.id),
  batchNo: int("batch_no").notNull(),
  status: varchar("status", { length: 32 }).notNull(),
  logisticsCompany: varchar("logistics_company", { length: 100 }),
  trackingNo: varchar("tracking_no", { length: 100 }),
  dispatchLocation: varchar("dispatch_location", { length: 200 }),
  deliveryMode: varchar("delivery_mode", { length: 16 }).notNull().default("DELIVERY"),
  amount: money("amount").notNull(),
  shippedAt: iso("shipped_at"),
  receivedAt: iso("received_at"),
  createdAt: iso("created_at").notNull()
}, (t) => [index("idx_shipments_order").on(t.orderId)]);

export const shipmentItems = mysqlTable("shipment_items", {
  id: id(),
  shipmentId: varchar("shipment_id", { length: 64 }).notNull().references(() => shipments.id, { onDelete: "cascade" }),
  orderItemId: varchar("order_item_id", { length: 64 }).notNull().references(() => orderItems.id),
  productId: varchar("product_id", { length: 64 }).notNull().references(() => products.id),
  quantity: int("quantity").notNull(),
  amount: money("amount").notNull()
});

export const afterSalesCases = mysqlTable("after_sales_cases", {
  id: id(),
  caseNo: varchar("case_no", { length: 64 }).notNull().unique(),
  customerId: varchar("customer_id", { length: 64 }).notNull().references(() => customers.id),
  orderId: varchar("order_id", { length: 64 }).references(() => orders.id),
  type: varchar("type", { length: 32 }).notNull(),
  status: varchar("status", { length: 32 }).notNull(),
  description: text("description").notNull(),
  claimAmount: money("claim_amount").notNull().default("0.00"),
  resolution: text("resolution"),
  createdAt: iso("created_at").notNull(),
  updatedAt: iso("updated_at").notNull()
});

export const invoices = mysqlTable("invoices", {
  id: id(),
  invoiceNo: varchar("invoice_no", { length: 64 }).notNull().unique(),
  orderId: varchar("order_id", { length: 64 }).notNull().references(() => orders.id),
  customerId: varchar("customer_id", { length: 64 }).notNull().references(() => customers.id),
  title: varchar("title", { length: 300 }).notNull(),
  taxNumber: varchar("tax_number", { length: 100 }),
  amount: money("amount").notNull(),
  taxRate: decimal("tax_rate", { precision: 6, scale: 2 }).notNull().default("13.00"),
  status: varchar("status", { length: 32 }).notNull().default("PENDING"),
  note: text("note"),
  issuedAt: iso("issued_at"),
  createdAt: iso("created_at").notNull()
}, (t) => [index("idx_invoices_order").on(t.orderId)]);

export const freightCharges = mysqlTable("freight_charges", {
  id: id(),
  orderId: varchar("order_id", { length: 64 }).notNull().references(() => orders.id),
  customerId: varchar("customer_id", { length: 64 }).notNull().references(() => customers.id),
  amount: money("amount").notNull(),
  payer: varchar("payer", { length: 16 }).notNull().default("CUSTOMER"),
  status: varchar("status", { length: 32 }).notNull().default("PENDING"),
  description: text("description"),
  settledAt: iso("settled_at"),
  createdAt: iso("created_at").notNull()
}, (t) => [index("idx_freight_order").on(t.orderId)]);

export const financialAdjustments = mysqlTable("financial_adjustments", {
  id: id(),
  adjustmentNo: varchar("adjustment_no", { length: 64 }).notNull().unique(),
  customerId: varchar("customer_id", { length: 64 }).notNull().references(() => customers.id),
  orderId: varchar("order_id", { length: 64 }).references(() => orders.id),
  type: varchar("type", { length: 32 }).notNull(),
  amount: money("amount").notNull(),
  status: varchar("status", { length: 32 }).notNull().default("PENDING"),
  description: text("description"),
  settledAt: iso("settled_at"),
  createdAt: iso("created_at").notNull()
});

export const notifications = mysqlTable("notifications", {
  id: id(),
  userId: varchar("user_id", { length: 64 }).notNull().references(() => users.id),
  title: varchar("title", { length: 200 }).notNull(),
  content: text("content").notNull(),
  readAt: iso("read_at"),
  createdAt: iso("created_at").notNull()
});

export const auditLogs = mysqlTable("audit_logs", {
  id: id(),
  userId: varchar("user_id", { length: 64 }),
  action: varchar("action", { length: 64 }).notNull(),
  entityType: varchar("entity_type", { length: 32 }).notNull(),
  entityId: varchar("entity_id", { length: 64 }),
  details: text("details"),
  createdAt: iso("created_at").notNull()
});

export const settings = mysqlTable("settings", {
  key: varchar("key", { length: 64 }).primaryKey(),
  value: text("value").notNull(),
  updatedAt: iso("updated_at").notNull()
});
