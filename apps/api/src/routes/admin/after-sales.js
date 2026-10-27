import { requireUser } from "../../lib/request.js";
import { createAfterSalesCase, listAfterSales, updateAfterSalesStatus } from "../../services/after-sales.js";

export async function afterSalesRoutes(app) {
  app.get("/after-sales", async (request) => {
    const user = await requireUser(app, request);
    return { data: await listAfterSales(app.db, user) };
  });

  app.put("/after-sales/:id", async (request) => {
    const user = await requireUser(app, request);
    const body = request.body || {};
    return {
      data: await updateAfterSalesStatus(
        app.db,
        user,
        decodeURIComponent(request.params.id),
        body.status,
        body.resolution
      )
    };
  });
}

export async function mobileAfterSalesRoutes(app) {
  app.get("/mobile/after-sales", async (request) => {
    const user = await requireUser(app, request);
    return { data: await listAfterSales(app.db, user) };
  });

  app.post("/mobile/after-sales", async (request, reply) => {
    const user = await requireUser(app, request);
    return reply.code(201).send({ data: await createAfterSalesCase(app.db, user, request.body || {}) });
  });
}
