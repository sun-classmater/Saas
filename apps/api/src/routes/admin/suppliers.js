import { requireRoles } from "../../lib/core.js";
import { requireUser } from "../../lib/request.js";
import { listSuppliers, saveSupplier } from "../../services/suppliers.js";

const WRITE_ROLES = ["SUPER_ADMIN", "SANLEI_SALES", "SANLEI_WAREHOUSE"];

export async function supplierRoutes(app) {
  app.get("/suppliers", async (request) => {
    await requireUser(app, request);
    return { data: await listSuppliers(app.db) };
  });

  app.post("/suppliers", async (request, reply) => {
    const user = await requireUser(app, request);
    requireRoles(user, WRITE_ROLES);
    return reply.code(201).send({ data: await saveSupplier(app.db, user, request.body || {}) });
  });

  app.put("/suppliers/:id", async (request) => {
    const user = await requireUser(app, request);
    requireRoles(user, WRITE_ROLES);
    return {
      data: await saveSupplier(app.db, user, request.body || {}, decodeURIComponent(request.params.id))
    };
  });
}
