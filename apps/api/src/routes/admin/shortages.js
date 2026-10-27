import { requireUser } from "../../lib/request.js";
import { applyShortageAllocation, listShortageProducts, previewShortageAllocation } from "../../services/shortages.js";

export async function shortageRoutes(app) {
  app.get("/shortages", async (request) => {
    const user = await requireUser(app, request);
    return { data: await listShortageProducts(app.db, user) };
  });

  app.get("/shortages/:id/preview", async (request) => {
    const user = await requireUser(app, request);
    return { data: await previewShortageAllocation(app.db, user, decodeURIComponent(request.params.id)) };
  });

  app.post("/shortages/:id/apply", async (request) => {
    const user = await requireUser(app, request);
    const body = request.body || {};
    return {
      data: await applyShortageAllocation(
        app.db,
        user,
        decodeURIComponent(request.params.id),
        body.targets
      )
    };
  });
}
