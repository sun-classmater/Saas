package com.sanlei.order.order;

import com.sanlei.order.audit.AuditService;
import com.sanlei.order.auth.AuthUser;
import com.sanlei.order.common.HttpException;
import com.sanlei.order.common.Ids;
import com.sanlei.order.common.Times;
import com.sanlei.order.common.Validation;
import com.sanlei.order.notification.NotificationService;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** 订单状态机：邦邦确认 / 三磊接单 / 取消（发货下一步迁移）。 */
@Service
public class OrderActionService {

    private static final Set<String> ACTIVE_STATUSES = Set.of(
            "PENDING_BANGBANG", "PENDING_PAYMENT", "PARTIALLY_PAID", "PENDING_SANLEI",
            "PREPARING", "BACKORDER", "PARTIALLY_SHIPPED");

    private final OrderActionMapper orderActionMapper;
    private final OrderService orderService;
    private final AuditService auditService;
    private final NotificationService notificationService;

    public OrderActionService(OrderActionMapper orderActionMapper, OrderService orderService,
                              AuditService auditService, NotificationService notificationService) {
        this.orderActionMapper = orderActionMapper;
        this.orderService = orderService;
        this.auditService = auditService;
        this.notificationService = notificationService;
    }

    @Transactional
    public Map<String, Object> confirm(AuthUser user, String orderId, String note) {
        CreditOrderRow order = orderActionMapper.findWithCredit(orderId);
        if (order == null) {
            throw new HttpException(404, "ORDER_NOT_FOUND", "订单不存在");
        }
        if (!"PENDING_BANGBANG".equals(order.getStatus())) {
            throw new HttpException(409, "INVALID_ORDER_STATUS", "订单当前状态不能由邦邦确认");
        }
        if ("CREDIT".equals(order.getSettlementMethod())) {
            double outstanding = Validation.money(orZero(orderActionMapper.customerOutstanding(order.getCustomerId())));
            double creditLimit = order.getCreditLimit() == null ? 0d : order.getCreditLimit().doubleValue();
            if (outstanding > creditLimit) {
                throw new HttpException(409, "CREDIT_LIMIT_EXCEEDED", "客户应收已超过授信额度，请改为预付款或调整额度");
            }
        }
        reserveStock(orderId);

        String nextStatus = "PENDING_SANLEI";
        if ("PREPAY".equals(order.getSettlementMethod())) {
            double total = order.getTotalAmount() == null ? 0d : order.getTotalAmount().doubleValue();
            double ratio = order.getPrepayRatio() == null ? 1d : order.getPrepayRatio().doubleValue();
            double paid = order.getPaidAmount() == null ? 0d : order.getPaidAmount().doubleValue();
            double threshold = Validation.money(total * ratio);
            nextStatus = paid > 0 ? (paid >= threshold ? "PENDING_SANLEI" : "PARTIALLY_PAID") : "PENDING_PAYMENT";
        }
        String trimmedNote = note == null ? "" : note.trim();
        if (trimmedNote.length() > 1000) {
            trimmedNote = trimmedNote.substring(0, 1000);
        }
        orderActionMapper.updateStatusWithNote(orderId, nextStatus, trimmedNote, Times.nowIso());
        auditService.record(user, "CONFIRM_ORDER", "ORDER", orderId, Map.of("nextStatus", nextStatus));
        notificationService.notifyCustomer(order.getCustomerId(), "订单已确认",
                "订单" + order.getOrderNo() + "已由邦邦确认。");
        final String confirmedStatus = nextStatus;
        if ("PENDING_SANLEI".equals(confirmedStatus)) {
            notificationService.notifyRoles(List.of("SUPER_ADMIN", "SANLEI_SALES"), "订单已确认待接单",
                    "订单" + order.getOrderNo() + "等待三磊接单。");
        }
        return orderService.detail(user, orderId);
    }

    @Transactional
    public Map<String, Object> accept(AuthUser user, String orderId) {
        CreditOrderRow order = orderActionMapper.findOrder(orderId);
        if (order == null) {
            throw new HttpException(404, "ORDER_NOT_FOUND", "订单不存在");
        }
        if (!"PENDING_SANLEI".equals(order.getStatus())) {
            throw new HttpException(409, "INVALID_ORDER_STATUS", "订单未达到三磊接单条件");
        }
        orderActionMapper.updateStatus(orderId, "PREPARING", Times.nowIso());
        auditService.record(user, "ACCEPT_ORDER", "ORDER", orderId, null);
        notificationService.notifyCustomer(order.getCustomerId(), "三磊已接单", "订单" + order.getOrderNo() + "正在备货。");
        notificationService.notifyRoles(List.of("SUPER_ADMIN", "SANLEI_WAREHOUSE"), "订单已接单待发货",
                "订单" + order.getOrderNo() + "已接单，请安排发货。");
        return orderService.detail(user, orderId);
    }

    @Transactional
    public Map<String, Object> cancel(AuthUser user, String orderId, String reason) {
        CreditOrderRow order = orderActionMapper.findOrder(orderId);
        if (order == null) {
            throw new HttpException(404, "ORDER_NOT_FOUND", "订单不存在");
        }
        if (user.isCustomer() && !user.customerId().equals(order.getCustomerId())) {
            throw new HttpException(404, "ORDER_NOT_FOUND", "订单不存在");
        }
        if (!ACTIVE_STATUSES.contains(order.getStatus())) {
            throw new HttpException(409, "ORDER_CANNOT_CANCEL", "订单已进入发货或完成阶段，不能取消");
        }
        if (order.getPaidAmount() != null && order.getPaidAmount().doubleValue() > 0) {
            throw new HttpException(409, "ORDER_HAS_PAYMENT", "订单已有付款，请先走退款流程");
        }
        releaseReservations(orderId, user.id());

        String note = reason == null || reason.isBlank() ? "订单取消" : reason.trim();
        if (note.length() > 1000) {
            note = note.substring(0, 1000);
        }
        orderActionMapper.updateStatusWithNote(orderId, "CANCELLED", note, Times.nowIso());

        if (order.getPlanId() != null && order.getPlanWeek() != null) {
            for (OrderItemRow item : orderActionMapper.items(orderId)) {
                orderActionMapper.decrementPlanItem(item.getQuantity(), order.getPlanId(), order.getPlanWeek(),
                        item.getProductId());
            }
        }
        auditService.record(user, "CANCEL_ORDER", "ORDER", orderId, Map.of("reason", note));
        return orderService.detail(user, orderId);
    }

    /** 与 Node 端 reserveStock 一致：真实库存优先，不足部分继续占用虚拟库存。 */
    private void reserveStock(String orderId) {
        String now = Times.nowIso();
        for (OrderItemRow item : orderActionMapper.items(orderId)) {
            int needed = item.getQuantity();
            for (InventoryRow stock : orderActionMapper.availableStocks(item.getProductId())) {
                if (needed <= 0) {
                    break;
                }
                int available = Math.max(0, stock.getQuantity() - stock.getReserved());
                int take = Math.min(available, needed);
                if (take <= 0) {
                    continue;
                }
                orderActionMapper.increaseReserved(stock.getId(), take, now);
                orderActionMapper.insertReservation(Ids.next("reserve"), item.getId(), stock.getId(), take, now);
                needed -= take;
            }
            orderActionMapper.updateItemReserved(item.getId(), item.getQuantity() - needed);
        }
    }

    /** 与 Node 端 releaseReservations 一致：释放未消耗预占并写库存流水。 */
    private void releaseReservations(String orderId, String userId) {
        String now = Times.nowIso();
        for (ReservationRow reservation : orderActionMapper.openReservations(orderId)) {
            int quantity = reservation.getQuantity() - reservation.getConsumedQuantity();
            orderActionMapper.decreaseReserved(reservation.getInventoryId(), quantity, now);
            orderActionMapper.consumeReservation(reservation.getId());
            orderActionMapper.insertReleaseMovement(Ids.next("move"), reservation.getInventoryId(), quantity,
                    orderId, userId, now);
        }
    }

    private double orZero(Double value) {
        return value == null ? 0d : value;
    }
}
