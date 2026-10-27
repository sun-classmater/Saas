import { HttpError } from "../lib/core.js";
import { first } from "../lib/sql.js";
import { verifyAndDecryptNotification } from "../lib/wechat.js";
import { markWechatPaymentSucceeded } from "../services/orders.js";

export async function wechatRoutes(app) {
  app.post("/wechat/pay/notify", async (request, reply) => {
    const rawBody = request.rawBody ? request.rawBody.toString("utf8") : "";
    const { transaction } = verifyAndDecryptNotification(request.headers, rawBody);
    if (transaction.trade_state === "SUCCESS") {
      const payment = await first(app.pool, "SELECT * FROM payments WHERE payment_no = ?", [transaction.out_trade_no]);
      if (!payment) throw new HttpError(404, "PAYMENT_NOT_FOUND", "微信支付单不存在");
      const paidAmount = Number(transaction.amount?.total || 0) / 100;
      await markWechatPaymentSucceeded(app.db, payment.id, transaction.transaction_id, paidAmount);
    }
    return reply.send({ code: "SUCCESS", message: "成功" });
  });
}
