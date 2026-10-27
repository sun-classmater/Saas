import { and, eq } from "drizzle-orm";
import { customerPrices, customers, priceRules, products } from "@saas/db/schema";
import { HttpError, id, money, nowIso, parsePositiveNumber, requireText } from "../lib/core.js";
import { mapProduct } from "./products.js";
import { audit } from "./audit.js";

export async function effectivePrice(db, customerId, productId) {
  const [customer] = await db
    .select({ priceTier: customers.priceTier })
    .from(customers)
    .where(and(eq(customers.id, customerId), eq(customers.active, 1)))
    .limit(1);
  if (!customer) throw new HttpError(404, "CUSTOMER_NOT_FOUND", "客户不存在或已停用");

  const [specificPrice] = await db
    .select({ price: customerPrices.price })
    .from(customerPrices)
    .where(and(eq(customerPrices.customerId, customerId), eq(customerPrices.productId, productId)))
    .limit(1);
  if (specificPrice) return { price: money(specificPrice.price), source: "CUSTOMER_SPECIFIC" };

  const [tierPrice] = await db
    .select({ price: priceRules.price })
    .from(priceRules)
    .where(and(eq(priceRules.priceTier, customer.priceTier), eq(priceRules.productId, productId)))
    .limit(1);
  if (tierPrice) return { price: money(tierPrice.price), source: "PRICE_TIER" };

  throw new HttpError(400, "PRICE_NOT_CONFIGURED", "该产品尚未配置当前客户可用价格");
}

export async function previewEffectivePrices(db, customerId) {
  const [customer] = await db
    .select({ id: customers.id })
    .from(customers)
    .where(eq(customers.id, customerId))
    .limit(1);
  if (!customer) throw new HttpError(404, "CUSTOMER_NOT_FOUND", "客户不存在");
  const rows = await db.select().from(products).where(eq(products.active, 1)).orderBy(products.category, products.name);
  const result = [];
  for (const product of rows) {
    try {
      const pricing = await effectivePrice(db, customerId, product.id);
      result.push({ productId: product.id, sku: product.sku, name: product.name, ...pricing });
    } catch (error) {
      if (error.code !== "PRICE_NOT_CONFIGURED") throw error;
    }
  }
  return result;
}

export async function getPriceMatrix(db) {
  const productRows = await db
    .select()
    .from(products)
    .where(eq(products.active, 1))
    .orderBy(products.category, products.name);
  const ruleRows = await db
    .select({
      id: priceRules.id,
      tier: priceRules.priceTier,
      productId: priceRules.productId,
      price: priceRules.price,
      sku: products.sku,
      productName: products.name
    })
    .from(priceRules)
    .innerJoin(products, eq(priceRules.productId, products.id))
    .orderBy(priceRules.priceTier, products.name);
  const customerRows = await db
    .select({
      id: customerPrices.id,
      customerId: customerPrices.customerId,
      customerName: customers.name,
      productId: customerPrices.productId,
      price: customerPrices.price,
      sku: products.sku,
      productName: products.name
    })
    .from(customerPrices)
    .innerJoin(customers, eq(customerPrices.customerId, customers.id))
    .innerJoin(products, eq(customerPrices.productId, products.id))
    .orderBy(customers.name, products.name);
  return {
    tiers: [...new Set(ruleRows.map((row) => row.tier))].sort(),
    products: productRows.map(mapProduct),
    tierPrices: ruleRows.map((row) => ({
      id: row.id,
      tier: row.tier,
      productId: row.productId,
      sku: row.sku,
      productName: row.productName,
      price: money(row.price)
    })),
    customerPrices: customerRows.map((row) => ({
      id: row.id,
      customerId: row.customerId,
      customerName: row.customerName,
      productId: row.productId,
      sku: row.sku,
      productName: row.productName,
      price: money(row.price)
    }))
  };
}

export async function setPrice(db, user, payload) {
  const price = parsePositiveNumber(payload.price, "价格");
  const [product] = await db.select().from(products).where(eq(products.id, payload.productId)).limit(1);
  if (!product) throw new HttpError(404, "PRODUCT_NOT_FOUND", "产品不存在");
  const createdAt = nowIso();
  if (payload.scope === "CUSTOMER") {
    const [customer] = await db.select().from(customers).where(eq(customers.id, payload.customerId)).limit(1);
    if (!customer) throw new HttpError(404, "CUSTOMER_NOT_FOUND", "客户不存在");
    await db
      .insert(customerPrices)
      .values({ id: id("cp"), customerId: customer.id, productId: product.id, price: money(price), createdAt, updatedAt: createdAt })
      .onDuplicateKeyUpdate({ set: { price: money(price), updatedAt: createdAt } });
    await audit(db, user, "SET_CUSTOMER_PRICE", "CUSTOMER", customer.id, { productId: product.id, price: money(price) });
  } else {
    const tier = requireText(payload.tier, "价格等级", 30);
    await db
      .insert(priceRules)
      .values({ id: id("price"), priceTier: tier, productId: product.id, price: money(price), createdAt, updatedAt: createdAt })
      .onDuplicateKeyUpdate({ set: { price: money(price), updatedAt: createdAt } });
    await audit(db, user, "SET_TIER_PRICE", "PRODUCT", product.id, { tier, price: money(price) });
  }
  return getPriceMatrix(db);
}
