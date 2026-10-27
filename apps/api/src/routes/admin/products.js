import { requireRoles } from "../../lib/core.js";
import { requireUser } from "../../lib/request.js";
import { listProducts, saveProduct } from "../../services/products.js";

export async function productRoutes(app) {
  app.get("/products", async (request) => {
    const user = await requireUser(app, request);
    requireRoles(user, ["SUPER_ADMIN", "SANLEI_SALES", "SANLEI_WAREHOUSE", "SANLEI_FINANCE"]);
    return { data: await listProducts(app.db) };
  });

  app.post("/products", async (request, reply) => {
    const user = await requireUser(app, request);
    requireRoles(user, ["SUPER_ADMIN", "SANLEI_SALES"]);
    return reply.code(201).send({ data: await saveProduct(app.db, user, request.body || {}) });
  });

  app.put("/products/:id", async (request) => {
    const user = await requireUser(app, request);
    requireRoles(user, ["SUPER_ADMIN", "SANLEI_SALES"]);
    return {
      data: await saveProduct(app.db, user, request.body || {}, decodeURIComponent(request.params.id))
    };
  });
}
