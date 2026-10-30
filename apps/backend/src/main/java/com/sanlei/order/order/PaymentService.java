package com.sanlei.order.order;

import com.sanlei.order.audit.AuditService;
import com.sanlei.order.auth.AuthUser;
import com.sanlei.order.common.HttpException;
import com.sanlei.order.common.Ids;
import com.sanlei.order.common.SerialNumbers;
import com.sanlei.order.common.Times;
import com.sanlei.order.common.Validation;
import com.sanlei.order.notification.NotificationService;
import java.math.BigDecimal;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** 收款：创建支付单 +（测试模式）模拟到账 + 到账后回写订单已付/状态。 */
@Service
public class PaymentService {

    private final OrderActionMapper orderActionMapper;
    private final OrderService orderService;
    private final AuditService auditService;
    private final NotificationService notificationService;

    public PaymentService(OrderActionMapper orderActionMapper, OrderService orderService,
                          AuditService auditService, NotificationService notificationService) {
        this.orderActionMapper = orderActionMapper;
        this.orderService = orderService;
        this.auditService = auditService;
        this.notificationService = notificationService;
    }

    public boolean isWechatMock() {
        String mode = System.getProperty("WECHAT_MODE");
        if (mode == null) {
            mode = System.getenv("WECHAT_MODE");
        }
        return mode == null || mode.isBlank() || "mock".equals(mode);
    }

    private boolean isWechatReal() {
        String mode = System.getProperty("WECHAT_MODE");
        if (mode == null) {
            mode = System.getenv("WECHAT_MODE");
        }
        return mode != null && !mode.isBlank() && !"mock".equals(mode);
    }

    @Transactional
    public Map<String, Object> createPayment(AuthUser user, String orderId, Object amountPayload) {
        CreditOrderRow order = orderActionMapper.findOrder(orderId);
        if (order == null) {
            throw new HttpException(404, "ORDER_NOT_FOUND", "订单不存在");
        }
        if (user.isCustomer() && !user.customerId().equals(order.getCustomerId())) {
            throw new HttpException(404, "ORDER_NOT_FOUND", "订单不存在");
        }
        if (!"PREPAY".equals(order.getSettlementMethod())) {
            throw new HttpException(409, "PAYMENT_NOT_REQUIRED", "该订单不是预付款订单");
        }
        List<String> payableStatuses = List.of("PENDING_PAYMENT", "PARTIALLY_PAID", "PARTIALLY_SHIPPED");
        if (!payableStatuses.contains(order.getStatus())) {
            throw new HttpException(409, "INVALID_ORDER_STATUS", "订单当前状态不能发起付款");
        }
        double amount = Validation.money(Validation.parsePositiveNumber(amountPayload, "付款金额"));
        double paid = order.getPaidAmount() == null ? 0d : order.getPaidAmount().doubleValue();
        double total = order.getTotalAmount() == null ? 0d : order.getTotalAmount().doubleValue();
        if (paid + amount > total) {
            throw new HttpException(400, "PAYMENT_EXCEEDS_TOTAL", "付款金额不能超过订单未付金额");
        }
        String paymentId = Ids.next("pay");
        String paymentNo = SerialNumbers.next("PAY");
        String createdAt = Times.nowIso();
        String prepayId;
        if (isWechatMock()) {
            prepayId = "mock_" + paymentId;
        } else {
            throw new HttpException(501, "WECHAT_PAY_NOT_READY", "正式微信支付尚未接入 Spring Boot 后端");
        }
        orderActionMapper.insertPayment(paymentId, paymentNo, order.getCustomerId(), order.getId(),
                BigDecimal.valueOf(amount), prepayId, createdAt);
        auditService.record(user, "CREATE_PAYMENT", "PAYMENT", paymentId,
                Map.of("orderId", order.getId(), "amount", amount));

        Map<String, Object> data = new LinkedHashMap<>();
        data.put("id", paymentId);
        data.put("paymentNo", paymentNo);
        data.put("amount", amount);
        data.put("status", "PENDING");
        data.put("mockMode", isWechatMock());
        data.put("payParams", null);
        data.put("message", isWechatMock() ? "当前为测试支付模式" : "微信预支付已创建");
        return data;
    }

    @Transactional
    public Map<String, Object> completeMockPayment(AuthUser user, String paymentId) {
        if (isWechatReal()) {
            throw new HttpException(403, "MOCK_PAYMENT_DISABLED", "正式支付模式不允许模拟到账");
        }
        PaymentRecordRow payment = orderActionMapper.findPayment(paymentId);
        if (payment == null) {
            throw new HttpException(404, "PAYMENT_NOT_FOUND", "支付记录不存在");
        }
        if (user.isCustomer() && !user.customerId().equals(payment.getCustomerId())) {
            throw new HttpException(404, "PAYMENT_NOT_FOUND", "支付记录不存在");
        }
        if (!"SUCCEEDED".equals(payment.getStatus())) {
            if (!"PENDING".equals(payment.getStatus())) {
                throw new HttpException(409, "PAYMENT_NOT_PENDING", "支付记录状态异常");
            }
            String transactionId = String.format("MOCK-%012d", (long) (Math.random() * 1e12));
            applySuccessfulPayment(payment, transactionId, user, "MOCK");
        }
        return orderService.detail(user, payment.getOrderId());
    }

    /** 管理端「模拟到账」：创建支付单后立即完成。 */
    @Transactional
    public Map<String, Object> mockPay(AuthUser user, String orderId, Object amount) {
        Map<String, Object> created = createPayment(user, orderId, amount);
        return completeMockPayment(user, String.valueOf(created.get("id")));
    }

    private void applySuccessfulPayment(PaymentRecordRow payment, String transactionId, AuthUser actor, String source) {
        String paidAt = Times.nowIso();
        orderActionMapper.markPaymentSucceeded(payment.getId(), transactionId, paidAt);
        BigDecimal totalPaid = orderActionMapper.sumSucceededPayments(payment.getOrderId());
        if (totalPaid == null) {
            totalPaid = BigDecimal.ZERO;
        }
        CreditOrderRow order = orderActionMapper.findOrder(payment.getOrderId());
        double total = order.getTotalAmount() == null ? 0d : order.getTotalAmount().doubleValue();
        double ratio = order.getPrepayRatio() == null ? 1d : order.getPrepayRatio().doubleValue();
        double threshold = Validation.money(total * ratio);
        int ready = totalPaid.doubleValue() >= threshold ? 1 : 0;
        BigDecimal paidAmount = BigDecimal.valueOf(Validation.money(totalPaid));
        orderActionMapper.applyPaymentToOrder(order.getId(), paidAmount, ready, Times.nowIso());

        auditService.record(actor, "WECHAT".equals(source) ? "WECHAT_PAYMENT_SUCCEEDED" : "PAYMENT_SUCCEEDED",
                "PAYMENT", payment.getId(),
                Map.of("amount", payment.getAmount(), "transactionId", transactionId, "source", source));
        double paymentAmount = payment.getAmount() == null ? 0d : payment.getAmount().doubleValue();
        notificationService.notifyCustomer(order.getCustomerId(), "预付款已到账",
                "订单" + order.getOrderNo() + "已到账¥" + Validation.money(paymentAmount) + "。");
        notificationService.notifyRoles(List.of("SUPER_ADMIN", "BANGBANG_FINANCE", "SANLEI_FINANCE"), "预付款到账",
                "订单" + order.getOrderNo() + "到账¥" + Validation.money(paymentAmount)
                        + "，当前已付¥" + Validation.money(totalPaid.doubleValue()) + "。");
    }
}
