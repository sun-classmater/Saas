import { requireRoles } from "../../lib/core.js";
import { requireUser } from "../../lib/request.js";
import { getPriceMatrix, setPrice } from "../../services/pricing.js";

export async function priceRoutes(app) {
  app.get("/prices", async (request) => {
    const user = await requireUser(app, request);
    requireRoles(user, ["SUPER_ADMIN", "SANLEI_SALES"]);
    return { data: await getPriceMatrix(app.db) };
  });

  app.put("/prices", async (request) => {
    const user = await requireUser(app, request);
    requireRoles(user, ["SUPER_ADMIN", "SANLEI_SALES"]);
    return { data: await setPrice(app.db, user, request.body || {}) };
  });
}
