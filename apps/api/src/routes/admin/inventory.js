import { requireRoles } from "../../lib/core.js";
import { requireUser } from "../../lib/request.js";
import {
  adjustInventory,
  listInventory,
  listInventoryMovements,
  transferInventory
} from "../../services/inventory.js";

export async function inventoryRoutes(app) {
  app.get("/inventory", async (request) => {
    await requireUser(app, request);
    return { data: await listInventory(app.db, request.query) };
  });

  app.get("/inventory/movements", async (request) => {
    await requireUser(app, request);
    return { data: await listInventoryMovements(app.db, request.query.productId || "") };
  });

  app.post("/inventory/transfer", async (request, reply) => {
    const user = await requireUser(app, request);
    requireRoles(user, ["SUPER_ADMIN", "SANLEI_WAREHOUSE"]);
    return reply.code(201).send({ data: await transferInventory(app.db, user, request.body || {}) });
  });

  app.post("/inventory/:id/adjust", async (request) => {
    const user = await requireUser(app, request);
    requireRoles(user, ["SUPER_ADMIN", "SANLEI_WAREHOUSE"]);
    const body = request.body || {};
    return {
      data: await adjustInventory(app.db, user, decodeURIComponent(request.params.id), body.quantity, body.note)
    };
  });
}
