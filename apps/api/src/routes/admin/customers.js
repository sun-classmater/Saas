import { requireRoles } from "../../lib/core.js";
import { requireUser } from "../../lib/request.js";
import {
  getCustomerAuthorizations,
  listCustomers,
  saveCustomer,
  setCustomerAuthorizations
} from "../../services/customers.js";
import { previewEffectivePrices } from "../../services/pricing.js";

const READ_ROLES = ["SUPER_ADMIN", "BANGBANG_OPS", "BANGBANG_FINANCE", "SANLEI_SALES", "SANLEI_FINANCE"];
const WRITE_ROLES = ["SUPER_ADMIN", "BANGBANG_OPS"];

export async function customerRoutes(app) {
  app.get("/customers", async (request) => {
    const user = await requireUser(app, request);
    requireRoles(user, READ_ROLES);
    return { data: await listCustomers(app.db, request.query) };
  });

  app.post("/customers", async (request, reply) => {
    const user = await requireUser(app, request);
    requireRoles(user, WRITE_ROLES);
    return reply.code(201).send({ data: await saveCustomer(app.db, user, request.body || {}) });
  });

  app.put("/customers/:id", async (request) => {
    const user = await requireUser(app, request);
    requireRoles(user, WRITE_ROLES);
    return {
      data: await saveCustomer(app.db, user, request.body || {}, decodeURIComponent(request.params.id))
    };
  });

  app.get("/customers/:id/effective-prices", async (request) => {
    const user = await requireUser(app, request);
    requireRoles(user, READ_ROLES);
    return { data: await previewEffectivePrices(app.db, decodeURIComponent(request.params.id)) };
  });

  app.get("/customers/:id/authorizations", async (request) => {
    await requireUser(app, request);
    return { data: await getCustomerAuthorizations(app.db, decodeURIComponent(request.params.id)) };
  });

  app.put("/customers/:id/authorizations", async (request) => {
    const user = await requireUser(app, request);
    requireRoles(user, ["SUPER_ADMIN", "SANLEI_SALES"]);
    return {
      data: await setCustomerAuthorizations(
        app.db,
        user,
        decodeURIComponent(request.params.id),
        (request.body || {}).vehicles
      )
    };
  });
}
