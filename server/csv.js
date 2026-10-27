import { HttpError, audit, cleanText, money, parsePositiveNumber, requireStaff, withTransaction } from "./core.js";
import { id, nowIso } from "./database.js";
import { saveCustomer, saveProduct } from "./admin.js";
import { readWorkbookRows, writeWorkbookRows } from "./xlsx.js";

const TEMPLATES = {
  customers: [
    "客户编码", "客户名称", "省份", "城市", "渠道类型", "客户等级", "价格等级",
    "结算方式", "账期天数", "授信额度", "预付款比例", "最多发货批次", "手机号", "地址"
  ],
  products: [
    "物料号", "品名", "分类", "车型", "最小包装", "基础价", "质保月数", "质保公里", "说明"
  ],
  prices: ["范围", "价格等级或客户编码", "物料号", "价格"],
  inventory: ["物料号", "仓库名称", "库存类型", "数量", "供应商名称"]
};

export function parseCsv(text) {
  const source = String(text || "").replace(/^\uFEFF/, "");
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    if (inQuotes) {
      if (char === '"' && source[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        field += char;
      }
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field.replace(/\r$/, ""));
      if (row.some((value) => value !== "")) rows.push(row);
      row = [];
      field = "";
    } else {
      field += char;
    }
  }
  row.push(field.replace(/\r$/, ""));
  if (row.some((value) => value !== "")) rows.push(row);
  if (rows.length === 0) return [];
  const headers = rows.shift().map((header) => header.trim());
  return rows.map((values) => Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""])));
}

export function toCsv(headers, rows) {
  const escape = (value) => {
    const text = String(value ?? "");
    return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
  };
  return `\uFEFF${[headers, ...rows].map((row) => row.map(escape).join(",")).join("\r\n")}`;
}

export function getTemplate(kind) {
  if (!TEMPLATES[kind]) throw new HttpError(404, "TEMPLATE_NOT_FOUND", "导入模板不存在");
  return toCsv(TEMPLATES[kind], []);
}

export function getXlsxTemplate(kind) {
  if (!TEMPLATES[kind]) throw new HttpError(404, "TEMPLATE_NOT_FOUND", "导入模板不存在");
  return writeWorkbookRows(TEMPLATES[kind], [], templateName(kind));
}

export function exportData(db, kind) {
  if (kind === "orders") {
    const rows = db.prepare(`
      SELECT o.order_no, g.group_no, c.name AS customer_name, c.grade, o.vehicle_model,
        o.order_type, o.settlement_method, o.status, o.total_amount, o.paid_amount,
        o.shipped_amount, o.created_at
      FROM orders o
      JOIN order_groups g ON g.id = o.group_id
      JOIN customers c ON c.id = o.customer_id
      ORDER BY o.created_at DESC
    `).all();
    return {
      filename: `订单导出-${dateStamp()}.csv`,
      content: toCsv(
        ["订单号", "总单号", "客户", "等级", "车型", "订单类型", "结算方式", "状态", "订单金额", "已付金额", "已发金额", "创建时间"],
        rows.map((row) => [
          row.order_no, row.group_no, row.customer_name, row.grade, row.vehicle_model,
          row.order_type, row.settlement_method, row.status, money(row.total_amount),
          money(row.paid_amount), money(row.shipped_amount), row.created_at
        ])
      )
    };
  }
  if (kind === "inventory") {
    const rows = db.prepare(`
      SELECT p.sku, p.name, i.warehouse_name, i.source_type, i.quantity, i.reserved,
        i.quantity - i.reserved AS available, COALESCE(s.name, '') AS supplier_name
      FROM inventory i JOIN products p ON p.id = i.product_id
      LEFT JOIN suppliers s ON s.id = i.supplier_id
      ORDER BY p.sku, i.source_type
    `).all();
    return {
      filename: `库存导出-${dateStamp()}.csv`,
      content: toCsv(
        ["物料号", "品名", "仓库", "库存类型", "数量", "已预占", "可用", "供应商"],
        rows.map((row) => [
          row.sku, row.name, row.warehouse_name, row.source_type,
          row.quantity, row.reserved, row.available, row.supplier_name
        ])
      )
    };
  }
  if (kind === "payments") {
    const rows = db.prepare(`
      SELECT pay.payment_no, o.order_no, c.name, pay.amount, pay.channel,
        pay.status, pay.transaction_id, pay.created_at, pay.paid_at
      FROM payments pay
      JOIN orders o ON o.id = pay.order_id
      JOIN customers c ON c.id = pay.customer_id
      ORDER BY pay.created_at DESC
    `).all();
    return {
      filename: `收款导出-${dateStamp()}.csv`,
      content: toCsv(
        ["支付单号", "订单号", "客户", "金额", "渠道", "状态", "交易号", "创建时间", "到账时间"],
        rows.map((row) => [
          row.payment_no, row.order_no, row.name, money(row.amount), row.channel,
          row.status, row.transaction_id || "", row.created_at, row.paid_at || ""
        ])
      )
    };
  }
  if (kind === "plans") {
    const rows = db.prepare(`
      SELECT p.plan_no, p.plan_month, c.name, c.grade, pi.week_no,
        pr.sku, pr.name AS product_name, pi.quantity, pi.ordered_quantity
      FROM plans p
      JOIN customers c ON c.id = p.customer_id
      JOIN plan_items pi ON pi.plan_id = p.id
      JOIN products pr ON pr.id = pi.product_id
      ORDER BY p.plan_month DESC, p.plan_no, pi.week_no
    `).all();
    return {
      filename: `采购计划导出-${dateStamp()}.csv`,
      content: toCsv(
        ["计划单号", "计划月份", "客户", "等级", "周次", "物料号", "品名", "计划数量", "已下单数量"],
        rows.map((row) => [
          row.plan_no, row.plan_month, row.name, row.grade, row.week_no,
          row.sku, row.product_name, row.quantity, row.ordered_quantity
        ])
      )
    };
  }
  throw new HttpError(404, "EXPORT_NOT_FOUND", "导出类型不存在");
}

export function importData(db, user, kind, csvText) {
  return importRows(db, user, kind, parseCsv(csvText));
}

export function importXlsx(db, user, kind, buffer) {
  let rows;
  try {
    rows = readWorkbookRows(buffer);
  } catch (error) {
    throw new HttpError(400, "INVALID_XLSX", `无法读取Excel文件：${error.message}`);
  }
  return importRows(db, user, kind, rows);
}

function importRows(db, user, kind, rows) {
  requireStaff(user);
  if (rows.length === 0) throw new HttpError(400, "EMPTY_IMPORT", "导入文件没有数据");
  if (rows.length > 5000) throw new HttpError(400, "IMPORT_TOO_LARGE", "单次最多导入5000行");
  const errors = [];
  let imported = 0;
  return withTransaction(db, () => {
    rows.forEach((row, index) => {
      try {
        if (kind === "customers") importCustomer(db, user, row);
        else if (kind === "products") importProduct(db, user, row);
        else if (kind === "prices") importPrice(db, user, row);
        else if (kind === "inventory") importInventory(db, user, row);
        else throw new HttpError(404, "IMPORT_NOT_FOUND", "导入类型不存在");
        imported += 1;
      } catch (error) {
        errors.push({ row: index + 2, message: error.message });
      }
    });
    if (errors.length > 0) {
      throw new HttpError(400, "IMPORT_VALIDATION_FAILED", `有${errors.length}行导入失败，整批已回滚`, errors.slice(0, 100));
    }
    audit(db, user, "IMPORT_DATA", "IMPORT", kind, { imported });
    return { imported, kind };
  });
}

export function exportXlsx(db, kind) {
  const csv = exportData(db, kind);
  const text = csv.content.replace(/^\uFEFF/, "");
  const headerLine = text.split(/\r?\n/, 1)[0] || "";
  const headers = headerLine.split(",").map((item) => item.replace(/^"|"$/g, ""));
  const objects = parseCsv(csv.content);
  const rows = objects.map((row) => headers.map((header) => row[header] ?? ""));
  return {
    filename: csv.filename.replace(/\.csv$/i, ".xlsx"),
    buffer: writeWorkbookRows(headers, rows, exportSheetName(kind))
  };
}

function importCustomer(db, user, row) {
  saveCustomer(db, user, {
    code: row["客户编码"],
    name: row["客户名称"],
    province: row["省份"],
    city: row["城市"],
    channelType: channelType(row["渠道类型"]),
    grade: row["客户等级"],
    priceTier: row["价格等级"],
    settlementMethod: settlementMethod(row["结算方式"]),
    paymentTermsDays: row["账期天数"],
    creditLimit: row["授信额度"],
    prepayRatio: row["预付款比例"],
    batchLimit: row["最多发货批次"] || 3,
    phone: row["手机号"],
    address: row["地址"]
  });
}

function importProduct(db, user, row) {
  saveProduct(db, user, {
    sku: row["物料号"],
    name: row["品名"],
    category: row["分类"],
    vehicleModel: row["车型"],
    minPackage: row["最小包装"],
    basePrice: row["基础价"],
    warrantyMonths: row["质保月数"] || 12,
    warrantyKm: row["质保公里"] || 60000,
    description: row["说明"]
  });
}

function importPrice(db, user, row) {
  const product = db.prepare("SELECT * FROM products WHERE sku = ?").get(cleanText(row["物料号"]));
  if (!product) throw new HttpError(400, "PRODUCT_NOT_FOUND", `物料号${row["物料号"]}不存在`);
  const price = parsePositiveNumber(row["价格"], "价格");
  const scope = cleanText(row["范围"]).toUpperCase();
  const target = cleanText(row["价格等级或客户编码"]);
  const createdAt = nowIso();
  if (scope === "客户" || scope === "CUSTOMER") {
    const customer = db.prepare("SELECT * FROM customers WHERE code = ?").get(target);
    if (!customer) throw new HttpError(400, "CUSTOMER_NOT_FOUND", `客户${target}不存在`);
    db.prepare(`
      INSERT INTO customer_prices (id, customer_id, product_id, price, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(customer_id, product_id) DO UPDATE SET price = excluded.price, updated_at = excluded.updated_at
    `).run(id("cp"), customer.id, product.id, money(price), createdAt, createdAt);
  } else {
    db.prepare(`
      INSERT INTO price_rules (id, price_tier, product_id, price, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(price_tier, product_id) DO UPDATE SET price = excluded.price, updated_at = excluded.updated_at
    `).run(id("price"), target, product.id, money(price), createdAt, createdAt);
  }
}

function importInventory(db, user, row) {
  const product = db.prepare("SELECT * FROM products WHERE sku = ?").get(cleanText(row["物料号"]));
  if (!product) throw new HttpError(400, "PRODUCT_NOT_FOUND", `物料号${row["物料号"]}不存在`);
  const warehouse = cleanText(row["仓库名称"]);
  if (!warehouse) throw new HttpError(400, "VALIDATION_ERROR", "仓库名称不能为空");
  const rawType = cleanText(row["库存类型"]).toUpperCase();
  const sourceType = ["虚拟", "VIRTUAL"].includes(rawType) ? "VIRTUAL" : "REAL";
  const quantity = Number(row["数量"]);
  if (!Number.isInteger(quantity) || quantity < 0) throw new HttpError(400, "VALIDATION_ERROR", "库存数量必须为非负整数");
  let supplierId = null;
  if (row["供应商名称"]) {
    const supplier = db.prepare("SELECT * FROM suppliers WHERE name = ?").get(cleanText(row["供应商名称"]));
    if (supplier) supplierId = supplier.id;
    else {
      supplierId = id("sup");
      db.prepare("INSERT INTO suppliers (id, name, type, contact, phone, active) VALUES (?, ?, 'INTEGRATOR', NULL, NULL, 1)")
        .run(supplierId, cleanText(row["供应商名称"]));
    }
  }
  const existing = db.prepare(`
    SELECT * FROM inventory WHERE product_id = ? AND warehouse_name = ? AND source_type = ?
  `).get(product.id, warehouse, sourceType);
  if (existing) {
    if (quantity < existing.reserved) throw new HttpError(400, "INVALID_STOCK", "库存不能低于已预占数量");
    db.prepare("UPDATE inventory SET quantity = ?, supplier_id = ?, updated_at = ? WHERE id = ?")
      .run(quantity, supplierId, nowIso(), existing.id);
  } else {
    db.prepare(`
      INSERT INTO inventory (id, product_id, warehouse_name, source_type, supplier_id, quantity, reserved, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, 0, ?)
    `).run(id("inv"), product.id, warehouse, sourceType, supplierId, quantity, nowIso());
  }
}

function channelType(value) {
  const raw = cleanText(value).toUpperCase();
  return { "批发商": "WHOLESALER", "4S集团": "4S_GROUP", "连锁": "CHAIN" }[value] || raw || "WHOLESALER";
}

function settlementMethod(value) {
  const raw = cleanText(value).toUpperCase();
  return { "账期": "CREDIT", "预付款": "PREPAY" }[value] || raw || "CREDIT";
}

function dateStamp() {
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date()).replaceAll("/", "");
}

function templateName(kind) {
  return {
    customers: "客户档案",
    products: "产品档案",
    prices: "价格矩阵",
    inventory: "期初库存"
  }[kind] || "导入模板";
}

function exportSheetName(kind) {
  return {
    orders: "订单",
    inventory: "库存",
    payments: "收款",
    plans: "采购计划"
  }[kind] || "数据";
}
