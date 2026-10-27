import { HttpError, requireRoles } from "../../lib/core.js";
import { requireUser } from "../../lib/request.js";
import { acceptOrder, cancelOrder, confirmOrder, getOrder, listOrders, shipOrder } from "../../services/orders.js";

export async function orderRoutes(app) {
  app.get("/orders", async (request) => {
    const user = await requireUser(app, request);
    return { data: await listOrders(app.db, user, request.query) };
  });

  app.get("/orders/:id", async (request) => {
    const user = await requireUser(app, request);
    return { data: await getOrder(app.db, user, decodeURIComponent(request.params.id)) };
  });

  app.post("/orders/:id/actions", async (request) => {
    const user = await requireUser(app, request);
    const orderId = decodeURIComponent(request.params.id);
    const body = request.body || {};
    if (body.action === "BANGBANG_CONFIRM") {
      requireRoles(user, ["BANGBANG_OPS", "SUPER_ADMIN"]);
      return { data: await confirmOrder(app.db, user, orderId, body.note) };
    }
    if (body.action === "SANLEI_ACCEPT") {
      requireRoles(user, ["SANLEI_SALES", "SUPER_ADMIN"]);
      return { data: await acceptOrder(app.db, user, orderId) };
    }
    if (body.action === "SHIP") {
      requireRoles(user, ["SANLEI_WAREHOUSE", "SUPER_ADMIN"]);
      return { data: await shipOrder(app.db, user, orderId, body.shipment || body) };
    }
    if (body.action === "CANCEL") {
      return { data: await cancelOrder(app.db, user, orderId, body.reason) };
    }
    throw new HttpError(400, "INVALID_ORDER_ACTION", "订单操作无效");
  });
}
