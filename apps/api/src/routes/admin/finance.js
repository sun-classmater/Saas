import { requireRoles } from "../../lib/core.js";
import { requireUser } from "../../lib/request.js";
import {
  createAdjustment,
  createFreight,
  createInvoice,
  listFinancialRecords,
  settleFinancialRecord,
  updateInvoiceStatus
} from "../../services/finance.js";

const READ_ROLES = ["SUPER_ADMIN", "SANLEI_FINANCE", "BANGBANG_FINANCE", "BANGBANG_OPS"];

export async function financeRoutes(app) {
  app.get("/finance", async (request) => {
    const user = await requireUser(app, request);
    requireRoles(user, READ_ROLES);
    return { data: await listFinancialRecords(app.db) };
  });

  app.post("/finance/invoices", async (request, reply) => {
    const user = await requireUser(app, request);
    requireRoles(user, ["SUPER_ADMIN", "SANLEI_FINANCE"]);
    return reply.code(201).send({ data: await createInvoice(app.db, user, request.body || {}) });
  });

  app.post("/finance/invoices/:id/status", async (request) => {
    const user = await requireUser(app, request);
    requireRoles(user, ["SUPER_ADMIN", "SANLEI_FINANCE"]);
    const body = request.body || {};
    return {
      data: await updateInvoiceStatus(app.db, user, decodeURIComponent(request.params.id), body.status)
    };
  });

  app.post("/finance/freight", async (request, reply) => {
    const user = await requireUser(app, request);
    requireRoles(user, ["SUPER_ADMIN", "SANLEI_FINANCE", "SANLEI_WAREHOUSE"]);
    return reply.code(201).send({ data: await createFreight(app.db, user, request.body || {}) });
  });

  app.post("/finance/adjustments", async (request, reply) => {
    const user = await requireUser(app, request);
    requireRoles(user, ["SUPER_ADMIN", "SANLEI_FINANCE", "BANGBANG_FINANCE"]);
    return reply.code(201).send({ data: await createAdjustment(app.db, user, request.body || {}) });
  });

  app.post("/finance/:kind/:id/settle", async (request) => {
    const user = await requireUser(app, request);
    requireRoles(user, ["SUPER_ADMIN", "SANLEI_FINANCE", "BANGBANG_FINANCE"]);
    return {
      data: await settleFinancialRecord(
        app.db,
        user,
        request.params.kind,
        decodeURIComponent(request.params.id)
      )
    };
  });
}
