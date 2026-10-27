import { desc, eq, getTableColumns, sql } from "drizzle-orm";
import { inventory, products } from "@saas/db/schema";
import {
  asBoolean,
  cleanText,
  HttpError,
  id,
  isDuplicateEntry,
  money,
  nowIso,
  parsePositiveInteger,
  parsePositiveNumber,
  requireText
} from "../lib/core.js";
import { audit } from "./audit.js";

export function mapProduct(product) {
  return {
    id: product.id,
    sku: product.sku,
    name: product.name,
    category: product.category,
    vehicleModel: product.vehicleModel,
    minPackage: product.minPackage,
    basePrice: money(product.basePrice),
    warrantyMonths: product.warrantyMonths,
    warrantyKm: product.warrantyKm,
    active: asBoolean(product.active),
    description: product.description
  };
}

export async function listProducts(db) {
  const rows = await db
    .select({
      ...getTableColumns(products),
      realAvailable: sql`COALESCE(SUM(CASE WHEN ${inventory.sourceType} = 'REAL' THEN ${inventory.quantity} - ${inventory.reserved} ELSE 0 END), 0)`,
      virtualAvailable: sql`COALESCE(SUM(CASE WHEN ${inventory.sourceType} = 'VIRTUAL' THEN ${inventory.quantity} - ${inventory.reserved} ELSE 0 END), 0)`
    })
    .from(products)
    .leftJoin(inventory, eq(inventory.productId, products.id))
    .groupBy(products.id)
    .orderBy(desc(products.active), products.category, products.name);
  return rows.map((row) => {
    const realAvailable = Number(row.realAvailable);
    const virtualAvailable = Number(row.virtualAvailable);
    return {
      ...mapProduct(row),
      realAvailable,
      virtualAvailable,
      available: realAvailable + virtualAvailable
    };
  });
}

export async function saveProduct(db, user, payload, productId = null) {
  const existing = productId
    ? (await db.select().from(products).where(eq(products.id, productId)).limit(1))[0]
    : null;
  if (productId && !existing) throw new HttpError(404, "PRODUCT_NOT_FOUND", "产品不存在");
  const values = {
    sku: requireText(payload.sku ?? existing?.sku, "物料号", 80),
    name: requireText(payload.name ?? existing?.name, "产品名称", 200),
    category: requireText(payload.category ?? existing?.category, "产品分类", 50),
    vehicleModel: requireText(payload.vehicleModel ?? existing?.vehicleModel, "车型", 100),
    minPackage: parsePositiveInteger(payload.minPackage ?? existing?.minPackage ?? 1, "最小包装"),
    basePrice: parsePositiveNumber(payload.basePrice ?? existing?.basePrice, "基础价格"),
    warrantyMonths: Number(payload.warrantyMonths ?? existing?.warrantyMonths ?? 12),
    warrantyKm: Number(payload.warrantyKm ?? existing?.warrantyKm ?? 60000),
    active: payload.active === false || payload.active === 0 ? 0 : 1,
    description: cleanText(payload.description ?? existing?.description, 2000)
  };
  if (!Number.isInteger(values.warrantyMonths) || values.warrantyMonths < 0) {
    throw new HttpError(400, "VALIDATION_ERROR", "质保月数必须为非负整数");
  }
  if (!Number.isInteger(values.warrantyKm) || values.warrantyKm < 0) {
    throw new HttpError(400, "VALIDATION_ERROR", "质保里程必须为非负整数");
  }
  try {
    if (existing) {
      await db.update(products).set(values).where(eq(products.id, productId));
      await audit(db, user, "UPDATE_PRODUCT", "PRODUCT", productId, values);
    } else {
      productId = id("prod");
      await db.insert(products).values({ id: productId, ...values, createdAt: nowIso() });
      await audit(db, user, "CREATE_PRODUCT", "PRODUCT", productId, values);
    }
  } catch (error) {
    if (isDuplicateEntry(error)) {
      throw new HttpError(409, "PRODUCT_SKU_EXISTS", "物料号已存在");
    }
    throw error;
  }
  return (await listProducts(db)).find((product) => product.id === productId);
}
