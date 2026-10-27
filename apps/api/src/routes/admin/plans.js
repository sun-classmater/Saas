import { requireUser } from "../../lib/request.js";
import { planAction, createPlan, listPlans, updatePlan } from "../../services/plans.js";

export async function planRoutes(app) {
  app.get("/plans", async (request) => {
    const user = await requireUser(app, request);
    return { data: await listPlans(app.db, user, request.query) };
  });

  app.post("/plans/:id/actions", async (request) => {
    const user = await requireUser(app, request);
    const body = request.body || {};
    return {
      data: await planAction(app.db, user, decodeURIComponent(request.params.id), body.action, body.note)
    };
  });
}

export async function mobilePlanRoutes(app) {
  app.get("/mobile/plans", async (request) => {
    const user = await requireUser(app, request);
    return { data: await listPlans(app.db, user, request.query) };
  });

  app.post("/mobile/plans", async (request, reply) => {
    const user = await requireUser(app, request);
    return reply.code(201).send({ data: await createPlan(app.db, user, request.body || {}) });
  });

  app.put("/mobile/plans/:id", async (request) => {
    const user = await requireUser(app, request);
    return {
      data: await updatePlan(app.db, user, decodeURIComponent(request.params.id), request.body || {})
    };
  });

  app.post("/mobile/plans/:id/actions", async (request) => {
    const user = await requireUser(app, request);
    const body = request.body || {};
    return {
      data: await planAction(app.db, user, decodeURIComponent(request.params.id), body.action, body.note)
    };
  });
}
