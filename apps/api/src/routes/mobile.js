import { requireUser } from "../lib/request.js";
import { productCatalog } from "../services/catalog.js";
import { getCustomerProfile } from "../services/customers.js";
import {
  cancelOrder,
  completeMockPayment,
  createOrder,
  createPayment,
  getOrder,
  listOrders,
  receiveShipment
} from "../services/orders.js";

export async function mobileRoutes(app) {
  app.get("/mobile/profile", async (request) => {
    const user = await requireUser(app, request);
    return { data: await getCustomerProfile(app.db, user.customerId) };
  });

  app.get("/mobile/catalog", async (request) => {
    const user = await requireUser(app, request);
    return {
      data: {
        products: await productCatalog(app.db, user.customerId),
        customer: await getCustomerProfile(app.db, user.customerId)
      }
    };
  });

  app.get("/mobile/orders", async (request) => {
    const user = await requireUser(app, request);
    return { data: await listOrders(app.db, user, request.query) };
  });

  app.post("/mobile/orders", async (request, reply) => {
    const user = await requireUser(app, request);
    return reply.code(201).send({ data: await createOrder(app.db, user, request.body || {}) });
  });

  app.get("/mobile/orders/:id", async (request) => {
    const user = await requireUser(app, request);
    return { data: await getOrder(app.db, user, decodeURIComponent(request.params.id)) };
  });

  app.post("/mobile/orders/:id/cancel", async (request) => {
    const user = await requireUser(app, request);
    const body = request.body || {};
    return { data: await cancelOrder(app.db, user, decodeURIComponent(request.params.id), body.reason) };
  });

  app.post("/mobile/payments", async (request, reply) => {
    const user = await requireUser(app, request);
    return reply.code(201).send({ data: await createPayment(app.db, user, request.body || {}) });
  });

  app.post("/mobile/payments/:id/mock-complete", async (request) => {
    const user = await requireUser(app, request);
    return { data: await completeMockPayment(app.db, user, decodeURIComponent(request.params.id)) };
  });

  app.post("/mobile/shipments/:id/receive", async (request) => {
    const user = await requireUser(app, request);
    return { data: await receiveShipment(app.db, user, decodeURIComponent(request.params.id)) };
  });
}
