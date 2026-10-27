import { requireRoles } from "../../lib/core.js";
import { requireUser } from "../../lib/request.js";
import {
  createCustomerUser,
  createStaffUser,
  getAuditLogs,
  listUsers,
  toggleUser
} from "../../services/users.js";

export async function userRoutes(app) {
  app.get("/users", async (request) => {
    const user = await requireUser(app, request);
    requireRoles(user, ["SUPER_ADMIN", "BANGBANG_OPS"]);
    return { data: await listUsers(app.db) };
  });

  app.post("/users/customer", async (request, reply) => {
    const user = await requireUser(app, request);
    requireRoles(user, ["SUPER_ADMIN", "BANGBANG_OPS"]);
    return reply.code(201).send({ data: await createCustomerUser(app.db, user, request.body || {}) });
  });

  app.post("/users/staff", async (request, reply) => {
    const user = await requireUser(app, request);
    requireRoles(user, ["SUPER_ADMIN"]);
    return reply.code(201).send({ data: await createStaffUser(app.db, user, request.body || {}) });
  });

  app.post("/users/:id/toggle", async (request) => {
    const user = await requireUser(app, request);
    requireRoles(user, ["SUPER_ADMIN"]);
    const body = request.body || {};
    return { data: await toggleUser(app.db, user, decodeURIComponent(request.params.id), Boolean(body.active)) };
  });

  app.get("/audit-logs", async (request) => {
    const user = await requireUser(app, request);
    requireRoles(user, ["SUPER_ADMIN"]);
    return { data: await getAuditLogs(app.db) };
  });
}
