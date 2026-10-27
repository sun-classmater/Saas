import { HttpError, cleanText, money, nowIso, parsePositiveNumber, requireText } from "../lib/core.js";
import { all, first, run, withTransaction } from "../lib/sql.js";
import { auditSql } from "../lib/audit-sql.js";
import { parseCsv, toCsv } from "../lib/csv.js";
import { readWorkbookRows, writeWorkbookRows } from "../lib/xlsx.js";
import { id } from "../lib/core.js";

function dateStamp() {
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date()).replaceAll("/", "");
}

const EXPORT_DEFINITIONS = {
  orders: {
    filename: () => `订单导出-${dateStamp()}.csv`,
    sheet: "订单",
    headers: ["订单号", "总单号", "客户", "等级", "车型", "订单类型", "结算方式", "状态", "订单金额", "已付金额", "已发金额", "创建时间"],
    query: `SELECT o.order_no, g.group_no, c.name AS customer_name, c.grade, o.vehicle_model,
              o.order_type, o.settlement_method, o.status, o.total_amount, o.paid_amount,
              o.shipped_amount, o.created_at
            FROM orders o
            JOIN order_groups g ON g.id = o.group_id
            JOIN customers c ON c.id = o.customer_id
            ORDER BY o.created_at DESC`,
    row: (row) => [
      row.order_no, row.group_no, row.customer_name, row.grade, row.vehicle_model,
      row.order_type, row.settlement_method, row.status, money(row.total_amount),
      money(row.paid_amount), money(row.shipped_amount), row.created_at
    ]
  },
  inventory: {
    filename: () => `库存导出-${dateStamp()}.csv`,
    sheet: "库存",
    headers: ["物料号", "品名", "仓库", "库存类型", "数量", "已预占", "可用", "供应商"],
    query: `SELECT p.sku, p.name, i.warehouse_name, i.source_type, i.quantity, i.reserved,
              i.quantity - i.reserved AS available, COALESCE(s.name, '') AS supplier_name
            FROM inventory i JOIN products p ON p.id = i.product_id
            LEFT JOIN suppliers s ON s.id = i.supplier_id
            ORDER BY p.sku, i.source_type`,
    row: (row) => [
      row.sku, row.name, row.warehouse_name, row.source_type,
      row.quantity, row.reserved, row.available, row.supplier_name
    ]
  },
  payments: {
    filename: () => `收款导出-${dateStamp()}.csv`,
    sheet: "收款",
    headers: ["支付单号", "订单号", "客户", "金额", "渠道", "状态", "交易号", "创建时间", "到账时间"],
    query: `SELECT pay.payment_no, o.order_no, c.name, pay.amount, pay.channel,
              pay.status, pay.transaction_id, pay.created_at, pay.paid_at
            FROM payments pay
            JOIN orders o ON o.id = pay.order_id
            JOIN customers c ON c.id = pay.customer_id
            ORDER BY pay.created_at DESC`,
    row: (row) => [
      row.payment_no, row.order_no, row.name, money(row.amount), row.channel,
      row.status, row.transaction_id || "", row.created_at, row.paid_at || ""
    ]
  },
  plans: {
    filename: () => `采购计划导出-${dateStamp()}.csv`,
    sheet: "采购计划",
    headers: ["计划单号", "计划月份", "客户", "等级", "周次", "物料号", "品名", "计划数量", "已下单数量"],
    query: `SELECT p.plan_no, p.plan_month, c.name, c.grade, pi.week_no,
              pr.sku, pr.name AS product_name, pi.quantity, pi.ordered_quantity
            FROM plans p
            JOIN customers c ON c.id = p.customer_id
            JOIN plan_items pi ON pi.plan_id = p.id
            JOIN products pr ON pr.id = pi.product_id
            ORDER BY p.plan_month DESC, p.plan_no, pi.week_no`,
    row: (row) => [
      row.plan_no, row.plan_month, row.name, row.grade, row.week_no,
      row.sku, row.product_name, row.quantity, row.ordered_quantity
    ]
  }
};

export async function exportData(db, kind) {
  const definition = EXPORT_DEFINITIONS[kind];
  if (!definition) throw new HttpError(404, "EXPORT_NOT_FOUND", "导出类型不存在");
  const rows = await all(db.$client, definition.query);
  return {
    filename: definition.filename(),
    content: toCsv(definition.headers, rows.map(definition.row)),
    headers: definition.headers,
    rows: rows.map(definition.row),
    sheet: definition.sheet
  };
}

export async function exportXlsx(db, kind) {
  const exported = await exportData(db, kind);
  return {
    filename: exported.filename.replace(/\.csv$/i, ".xlsx"),
    buffer: writeWorkbookRows(exported.headers, exported.rows, exported.sheet)
  };
}

const CHANNEL_TYPES = { "批发商": "WHOLESALER", "4S集团": "4S_GROUP", "连锁": "CHAIN" };
const SETTLEMENT_METHODS = { "账期": "CREDIT", "预付款": "PREPAY" };

function channelType(value) {
  const raw = cleanText(value).toUpperCase();
  return CHANNEL_TYPES[value] || raw || "WHOLESALER";
}

function settlementMethod(value) {
  const raw = cleanText(value).toUpperCase();
  return SETTLEMENT_METHODS[value] || raw || "CREDIT";
}

export async function importData(db, user, kind, csvText) {
  return importRows(db, user, kind, parseCsv(csvText));
}

export async function importXlsx(db, user, kind, buffer) {
  let rows;
  try {
    rows = readWorkbookRows(buffer);
  } catch (error) {
    throw new HttpError(400, "INVALID_XLSX", `无法读取Excel文件：${error.message}`);
  }
  return importRows(db, user, kind, rows);
}

async function importRows(db, user, kind, rows) {
  if (rows.length === 0) throw new HttpError(400, "EMPTY_IMPORT", "导入文件没有数据");
  if (rows.length > 5000) throw new HttpError(400, "IMPORT_TOO_LARGE", "单次最多导入5000行");
  if (!["customers", "products", "prices", "inventory"].includes(kind)) {
    throw new HttpError(404, "IMPORT_NOT_FOUND", "导入类型不存在");
  }
  const errors = [];
  let imported = 0;
  await withTransaction(db, async (conn) => {
    for (let index = 0; index < rows.length; index += 1) {
      try {
        if (kind === "customers") await importCustomer(conn, rows[index]);
        else if (kind === "products") await importProduct(conn, rows[index]);
        else if (kind === "prices") await importPrice(conn, rows[index]);
        else await importInventory(conn, rows[index]);
        imported += 1;
      } catch (error) {
        errors.push({ row: index + 2, message: error.message });
      }
    }
    if (errors.length > 0) {
      throw new HttpError(400, "IMPORT_VALIDATION_FAILED", `有${errors.length}行导入失败，整批已回滚`, errors.slice(0, 100));
    }
    await auditSql(conn, user, "IMPORT_DATA", "IMPORT", kind, { imported });
  });
  return { imported, kind };
}

async function importCustomer(conn, row) {
  const values = {
    code: requireText(row["客户编码"], "客户编码"),
    name: requireText(row["客户名称"], "客户名称"),
    province: cleanText(row["省份"], 50),
    city: cleanText(row["城市"], 50),
    channelType: channelType(row["渠道类型"]),
    grade: requireText(row["客户等级"], "客户等级", 20),
    priceTier: requireText(row["价格等级"], "价格等级", 20),
    settlementMethod: settlementMethod(row["结算方式"]),
    paymentTermsDays: Number(row["账期天数"] || 0),
    creditLimit: Number(row["授信额度"] || 0),
    prepayRatio: Number(row["预付款比例"] || 1),
    batchLimit: Number(row["最多发货批次"] || 3),
    phone: cleanText(row["手机号"], 30),
    address: cleanText(row["地址"], 500)
  };
  if (!CHANNEL_TYPES[cleanText(row["渠道类型"])] && !["WHOLESALER", "4S_GROUP", "CHAIN"].includes(values.channelType)) {
    throw new HttpError(400, "VALIDATION_ERROR", "渠道类型无效");
  }
  if (!SETTLEMENT_METHODS[cleanText(row["结算方式"])] && !["CREDIT", "PREPAY"].includes(values.settlementMethod)) {
    throw new HttpError(400, "VALIDATION_ERROR", "结算方式无效");
  }
  if (!Number.isInteger(values.paymentTermsDays) || values.paymentTermsDays < 0) {
    throw new HttpError(400, "VALIDATION_ERROR", "账期天数必须为非负整数");
  }
  if (!Number.isFinite(values.creditLimit) || values.creditLimit < 0) {
    throw new HttpError(400, "VALIDATION_ERROR", "信用额度必须为非负数");
  }
  if (!(values.prepayRatio > 0 && values.prepayRatio <= 1)) {
    throw new HttpError(400, "VALIDATION_ERROR", "预付款比例必须大于0且不超过1");
  }
  if (!Number.isInteger(values.batchLimit) || values.batchLimit <= 0 || values.batchLimit > 20) {
    throw new HttpError(400, "VALIDATION_ERROR", "最多发货批次必须为正整数且不超过20");
  }
  const existing = await first(conn, "SELECT id FROM customers WHERE code = ?", [values.code]);
  if (existing) throw new HttpError(400, "CUSTOMER_CODE_EXISTS", "客户编码已存在");
  await run(
    conn,
    `INSERT INTO customers (id, code, name, province, city, channel_type, grade, price_tier,
       settlement_method, payment_terms_days, credit_limit, prepay_ratio, batch_limit,
       allow_overpayment, phone, address, active, notes, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, 1, NULL, ?)`,
    [
      id("cust"), values.code, values.name, values.province, values.city, values.channelType,
      values.grade, values.priceTier, values.settlementMethod, values.paymentTermsDays,
      money(values.creditLimit), values.prepayRatio, values.batchLimit, values.phone,
      values.address, nowIso()
    ]
  );
}

async function importProduct(conn, row) {
  const values = {
    sku: requireText(row["物料号"], "物料号", 80),
    name: requireText(row["品名"], "产品名称", 200),
    category: requireText(row["分类"], "产品分类", 50),
    vehicleModel: requireText(row["车型"], "车型", 100),
    minPackage: Number(row["最小包装"] || 1),
    basePrice: parsePositiveNumber(row["基础价"], "基础价格"),
    warrantyMonths: Number(row["质保月数"] || 12),
    warrantyKm: Number(row["质保公里"] || 60000),
    description: cleanText(row["说明"], 2000)
  };
  if (!Number.isInteger(values.minPackage) || values.minPackage <= 0) {
    throw new HttpError(400, "VALIDATION_ERROR", "最小包装必须为正整数");
  }
  const existing = await first(conn, "SELECT id FROM products WHERE sku = ?", [values.sku]);
  if (existing) throw new HttpError(400, "PRODUCT_SKU_EXISTS", "物料号已存在");
  await run(
    conn,
    `INSERT INTO products (id, sku, name, category, vehicle_model, min_package, base_price,
       warranty_months, warranty_km, active, description, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
    [
      id("prod"), values.sku, values.name, values.category, values.vehicleModel,
      values.minPackage, money(values.basePrice), values.warrantyMonths, values.warrantyKm,
      values.description, nowIso()
    ]
  );
}

async function importPrice(conn, row) {
  const product = await first(conn, "SELECT * FROM products WHERE sku = ?", [cleanText(row["物料号"])]);
  if (!product) throw new HttpError(400, "PRODUCT_NOT_FOUND", `物料号${row["物料号"]}不存在`);
  const price = parsePositiveNumber(row["价格"], "价格");
  const scope = cleanText(row["范围"]).toUpperCase();
  const target = cleanText(row["价格等级或客户编码"]);
  const now = nowIso();
  if (scope === "客户" || scope === "CUSTOMER") {
    const customer = await first(conn, "SELECT * FROM customers WHERE code = ?", [target]);
    if (!customer) throw new HttpError(400, "CUSTOMER_NOT_FOUND", `客户${target}不存在`);
    await run(
      conn,
      `INSERT INTO customer_prices (id, customer_id, product_id, price, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE price = VALUES(price), updated_at = VALUES(updated_at)`,
      [id("cp"), customer.id, product.id, money(price), now, now]
    );
  } else {
    await run(
      conn,
      `INSERT INTO price_rules (id, price_tier, product_id, price, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE price = VALUES(price), updated_at = VALUES(updated_at)`,
      [id("price"), target, product.id, money(price), now, now]
    );
  }
}

async function importInventory(conn, row) {
  const product = await first(conn, "SELECT * FROM products WHERE sku = ?", [cleanText(row["物料号"])]);
  if (!product) throw new HttpError(400, "PRODUCT_NOT_FOUND", `物料号${row["物料号"]}不存在`);
  const warehouse = cleanText(row["仓库名称"]);
  if (!warehouse) throw new HttpError(400, "VALIDATION_ERROR", "仓库名称不能为空");
  const rawType = cleanText(row["库存类型"]).toUpperCase();
  const sourceType = ["虚拟", "VIRTUAL"].includes(rawType) ? "VIRTUAL" : "REAL";
  const quantity = Number(row["数量"]);
  if (!Number.isInteger(quantity) || quantity < 0) {
    throw new HttpError(400, "VALIDATION_ERROR", "库存数量必须为非负整数");
  }
  let supplierId = null;
  if (row["供应商名称"]) {
    const supplier = await first(conn, "SELECT * FROM suppliers WHERE name = ?", [cleanText(row["供应商名称"])]);
    if (supplier) supplierId = supplier.id;
    else {
      supplierId = id("sup");
      await run(
        conn,
        "INSERT INTO suppliers (id, name, type, contact, phone, active) VALUES (?, ?, 'INTEGRATOR', NULL, NULL, 1)",
        [supplierId, cleanText(row["供应商名称"])]
      );
    }
  }
  const existing = await first(
    conn,
    "SELECT * FROM inventory WHERE product_id = ? AND warehouse_name = ? AND source_type = ?",
    [product.id, warehouse, sourceType]
  );
  if (existing) {
    if (quantity < existing.reserved) throw new HttpError(400, "INVALID_STOCK", "库存不能低于已预占数量");
    await run(conn, "UPDATE inventory SET quantity = ?, supplier_id = ?, updated_at = ? WHERE id = ?", [
      quantity,
      supplierId,
      nowIso(),
      existing.id
    ]);
  } else {
    await run(
      conn,
      `INSERT INTO inventory (id, product_id, warehouse_name, source_type, supplier_id, quantity, reserved, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 0, ?)`,
      [id("inv"), product.id, warehouse, sourceType, supplierId, quantity, nowIso()]
    );
  }
}
