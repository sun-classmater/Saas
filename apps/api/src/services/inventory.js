import { eq, sql } from "drizzle-orm";
import { inventory, inventoryMovements } from "@saas/db/schema";
import { cleanText, HttpError, id, nowIso, parsePositiveInteger, serialNumber } from "../lib/core.js";
import { audit } from "./audit.js";

function mapInventoryRow(row) {
  return {
    id: row.id,
    productId: row.product_id,
    sku: row.sku,
    name: row.name,
    vehicleModel: row.vehicle_model,
    minPackage: row.min_package,
    warehouseName: row.warehouse_name,
    sourceType: row.source_type,
    supplierName: row.supplier_name,
    quantity: row.quantity,
    reserved: row.reserved,
    available: row.quantity - row.reserved,
    updatedAt: row.updated_at
  };
}

export async function listInventory(db, query = {}) {
  const conditions = [];
  const params = [];
  if (query.productId) {
    conditions.push("i.product_id = ?");
    params.push(query.productId);
  }
  if (query.lowStock === "true") conditions.push("(i.quantity - i.reserved) <= 20");
  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const [rows] = await db.$client.query(
    `SELECT i.*, p.sku, p.name, p.vehicle_model, p.min_package, s.name AS supplier_name
     FROM inventory i
     JOIN products p ON p.id = i.product_id
     LEFT JOIN suppliers s ON s.id = i.supplier_id
     ${where}
     ORDER BY p.category, p.name, i.source_type DESC`,
    params
  );
  return rows.map(mapInventoryRow);
}

export async function listInventoryMovements(db, productId = "") {
  const where = productId ? "WHERE i.product_id = ?" : "";
  const [rows] = await db.$client.query(
    `SELECT m.*, i.warehouse_name, p.sku, p.name
     FROM inventory_movements m
     JOIN inventory i ON i.id = m.inventory_id
     JOIN products p ON p.id = i.product_id
     ${where}
     ORDER BY m.created_at DESC LIMIT 500`,
    productId ? [productId] : []
  );
  return rows.map((row) => ({
    id: row.id,
    sku: row.sku,
    name: row.name,
    warehouseName: row.warehouse_name,
    type: row.type,
    quantity: row.quantity,
    referenceType: row.reference_type,
    referenceId: row.reference_id,
    note: row.note,
    createdAt: row.created_at
  }));
}

export async function transferInventory(db, user, payload) {
  const quantity = parsePositiveInteger(payload.quantity, "移库数量");
  return db.transaction(async (tx) => {
    const [source] = await tx.select().from(inventory).where(eq(inventory.id, payload.sourceId)).limit(1);
    const [destination] = await tx.select().from(inventory).where(eq(inventory.id, payload.destinationId)).limit(1);
    if (!source || !destination) throw new HttpError(404, "INVENTORY_NOT_FOUND", "源库存或目标库存不存在");
    if (source.id === destination.id) throw new HttpError(400, "INVALID_TRANSFER", "源仓库与目标仓库不能相同");
    if (source.productId !== destination.productId) throw new HttpError(400, "INVALID_TRANSFER", "只能移动同一产品");
    if (source.quantity - source.reserved < quantity) {
      throw new HttpError(409, "INSUFFICIENT_TRANSFER_STOCK", "源库存可用量不足");
    }
    const transferNo = serialNumber("MOVE");
    const timestamp = nowIso();
    await tx
      .update(inventory)
      .set({ quantity: sql`${inventory.quantity} - ${quantity}`, updatedAt: timestamp })
      .where(eq(inventory.id, source.id));
    await tx
      .update(inventory)
      .set({ quantity: sql`${inventory.quantity} + ${quantity}`, updatedAt: timestamp })
      .where(eq(inventory.id, destination.id));
    await tx.insert(inventoryMovements).values([
      {
        id: id("move"),
        inventoryId: source.id,
        type: "TRANSFER_OUT",
        quantity: -quantity,
        referenceType: "TRANSFER",
        referenceId: transferNo,
        note: `移库至${destination.warehouseName}`,
        createdBy: user.id,
        createdAt: timestamp
      },
      {
        id: id("move"),
        inventoryId: destination.id,
        type: "TRANSFER_IN",
        quantity,
        referenceType: "TRANSFER",
        referenceId: transferNo,
        note: `由${source.warehouseName}移入`,
        createdBy: user.id,
        createdAt: timestamp
      }
    ]);
    await audit(tx, user, "TRANSFER_INVENTORY", "INVENTORY", transferNo, {
      sourceId: source.id,
      destinationId: destination.id,
      quantity
    });
    return { transferNo, sourceId: source.id, destinationId: destination.id, quantity };
  });
}

export async function adjustInventory(db, user, inventoryId, quantity, note) {
  const delta = Number(quantity);
  if (!Number.isInteger(delta) || delta === 0) {
    throw new HttpError(400, "VALIDATION_ERROR", "库存调整数量必须为非零整数");
  }
  await db.transaction(async (tx) => {
    const [row] = await tx.select().from(inventory).where(eq(inventory.id, inventoryId)).limit(1);
    if (!row) throw new HttpError(404, "INVENTORY_NOT_FOUND", "库存记录不存在");
    if (row.quantity + delta < 0 || row.quantity + delta < row.reserved) {
      throw new HttpError(409, "INVALID_INVENTORY_ADJUSTMENT", "调整后库存不能低于已预占数量");
    }
    await tx
      .update(inventory)
      .set({ quantity: sql`${inventory.quantity} + ${delta}`, updatedAt: nowIso() })
      .where(eq(inventory.id, inventoryId));
    await tx.insert(inventoryMovements).values({
      id: id("move"),
      inventoryId,
      type: "ADJUST",
      quantity: delta,
      referenceType: "MANUAL",
      referenceId: null,
      note: cleanText(note || "库存调整", 500),
      createdBy: user.id,
      createdAt: nowIso()
    });
    await audit(tx, user, "ADJUST_INVENTORY", "INVENTORY", inventoryId, { delta, note });
  });
  return (await listInventory(db, { user })).find((item) => item.id === inventoryId);
}
