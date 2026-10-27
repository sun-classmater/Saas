import { desc, eq } from "drizzle-orm";
import { suppliers } from "@saas/db/schema";
import { asBoolean, cleanText, HttpError, id, requireText } from "../lib/core.js";
import { audit } from "./audit.js";

export function mapSupplier(row) {
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    contact: row.contact,
    phone: row.phone,
    active: asBoolean(row.active)
  };
}

export async function listSuppliers(db) {
  const rows = await db.select().from(suppliers).orderBy(desc(suppliers.active), suppliers.name);
  return rows.map(mapSupplier);
}

export async function saveSupplier(db, user, payload, supplierId = null) {
  const existing = supplierId
    ? (await db.select().from(suppliers).where(eq(suppliers.id, supplierId)).limit(1))[0]
    : null;
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
    await db.update(suppliers).set(values).where(eq(suppliers.id, supplierId));
    await audit(db, user, "UPDATE_SUPPLIER", "SUPPLIER", supplierId, values);
  } else {
    supplierId = id("sup");
    await db.insert(suppliers).values({ id: supplierId, ...values });
    await audit(db, user, "CREATE_SUPPLIER", "SUPPLIER", supplierId, values);
  }
  return mapSupplier((await db.select().from(suppliers).where(eq(suppliers.id, supplierId)).limit(1))[0]);
}
