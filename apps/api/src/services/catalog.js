import { all } from "../lib/sql.js";
import { effectivePrice } from "./pricing.js";

function mapCatalogProduct(product, pricing) {
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
    realAvailable: Number(product.real_available),
    virtualAvailable: Number(product.virtual_available),
    available: Math.max(0, Number(product.real_available)) + Math.max(0, Number(product.virtual_available))
  };
}

export async function productCatalog(db, customerId) {
  const products = await all(
    db.$client,
    `SELECT p.*,
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
     ORDER BY p.category, p.name`,
    [customerId]
  );
  const result = [];
  for (const product of products) {
    try {
      const pricing = await effectivePrice(db, customerId, product.id);
      result.push(mapCatalogProduct(product, pricing));
    } catch (error) {
      if (error.code !== "PRICE_NOT_CONFIGURED") throw error;
    }
  }
  return result;
}
