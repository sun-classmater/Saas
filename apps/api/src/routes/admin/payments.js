import { HttpError, requireRoles } from "../../lib/core.js";
import { requireUser } from "../../lib/request.js";
import { completeMockPayment, createPayment, listPayments } from "../../services/orders.js";
import { isWechatMock } from "../../lib/wechat.js";

export async function adminPaymentRoutes(app) {
  app.get("/payments", async (request) => {
    await requireUser(app, request);
    return { data: await listPayments(app.db) };
  });

  app.post("/payments/mock", async (request) => {
    const user = await requireUser(app, request);
    requireRoles(user, ["SUPER_ADMIN"]);
    if (!isWechatMock()) {
      throw new HttpError(403, "MOCK_PAYMENT_DISABLED", "正式支付模式不允许模拟到账");
    }
    const body = request.body || {};
    const payment = await createPayment(app.db, user, { orderId: body.orderId, amount: body.amount });
    return { data: await completeMockPayment(app.db, user, payment.id) };
  });
}
