package com.sanlei.order.order;

import com.sanlei.order.audit.AuditService;
import com.sanlei.order.auth.AuthUser;
import com.sanlei.order.common.HttpException;
import com.sanlei.order.common.Ids;
import com.sanlei.order.common.SerialNumbers;
import com.sanlei.order.common.Times;
import com.sanlei.order.common.Validation;
import com.sanlei.order.notification.NotificationService;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** 分批发货：批次上限、预付款可用额度、预占消耗、状态回写。 */
@Service
public class ShipmentService {

    private final OrderActionMapper orderActionMapper;
    private final OrderService orderService;
    private final AuditService auditService;
    private final NotificationService notificationService;

    public ShipmentService(OrderActionMapper orderActionMapper, OrderService orderService,
                           AuditService auditService, NotificationService notificationService) {
        this.orderActionMapper = orderActionMapper;
        this.orderService = orderService;
        this.auditService = auditService;
        this.notificationService = notificationService;
    }

    private record Detail(ShipmentItemRow item, int quantity, double amount) {
    }

    @Transactional
    public Map<String, Object> ship(AuthUser user, String orderId, Map<String, Object> payload) {
        CreditOrderRow order = orderActionMapper.findOrder(orderId);
        if (order == null) {
            throw new HttpException(404, "ORDER_NOT_FOUND", "订单不存在");
        }
        if (!List.of("PREPARING", "PARTIALLY_SHIPPED").contains(order.getStatus())) {
            throw new HttpException(409, "INVALID_ORDER_STATUS", "订单当前状态不能发货");
        }
        Object rawItems = payload.get("items");
        if (!(rawItems instanceof List<?> requestedItems) || requestedItems.isEmpty()) {
            throw new HttpException(400, "VALIDATION_ERROR", "请选择本批发货产品");
        }
        int shipmentCount = orderActionMapper.countShipments(orderId);
        int batchLimit = order.getBatchLimit() == null ? 3 : order.getBatchLimit();
        if (shipmentCount >= batchLimit) {
            throw new HttpException(409, "BATCH_LIMIT_REACHED", "该订单最多分" + batchLimit + "批发货");
        }

        List<Detail> details = new ArrayList<>();
        double shipmentAmount = 0;
        for (Object rawItem : requestedItems) {
            if (!(rawItem instanceof Map<?, ?> requested)) {
                throw new HttpException(400, "VALIDATION_ERROR", "发货明细格式不正确");
            }
            int quantity = Validation.parsePositiveInteger(requested.get("quantity"), "发货数量");
            String orderItemId = requested.get("orderItemId") == null ? "" : String.valueOf(requested.get("orderItemId"));
            ShipmentItemRow item = orderActionMapper.findShipmentItem(orderItemId, orderId);
            if (item == null) {
                throw new HttpException(400, "ORDER_ITEM_NOT_FOUND", "订单产品行不存在");
            }
            if (item.getShippedQuantity() + quantity > item.getQuantity()) {
                throw new HttpException(400, "SHIPMENT_QUANTITY_EXCEEDED",
                        item.getProductName() + "发货数量超出订单剩余数量");
            }
            if (item.getReservedQuantity() - item.getShippedQuantity() < quantity) {
                throw new HttpException(409, "INSUFFICIENT_RESERVED_STOCK",
                        item.getProductName() + "有效预占库存不足，请先补货或重新分配");
            }
            double amount = Validation.money(item.getUnitPrice().doubleValue() * quantity);
            shipmentAmount += amount;
            details.add(new Detail(item, quantity, amount));
        }
        shipmentAmount = Validation.money(shipmentAmount);

        if (!Validation.asBoolean(order.getAllowOverpayment()) && "PREPAY".equals(order.getSettlementMethod())) {
            double paid = order.getPaidAmount() == null ? 0d : order.getPaidAmount().doubleValue();
            double shipped = order.getShippedAmount() == null ? 0d : order.getShippedAmount().doubleValue();
            if (shipped + shipmentAmount > paid + 0.001) {
                throw new HttpException(409, "SHIPMENT_EXCEEDS_PREPAYMENT",
                        String.format(Locale.ROOT, "本批金额¥%.2f超过预付款可用发货额度¥%.2f",
                                shipmentAmount, Validation.money(paid - shipped)));
            }
        }

        String shipmentId = Ids.next("shipment");
        String shipmentNo = SerialNumbers.next("SHIP");
        String shippedAt = Times.nowIso();
        int batchNo = shipmentCount + 1;
        orderActionMapper.insertShipment(
                shipmentId,
                shipmentNo,
                orderId,
                batchNo,
                Validation.cleanText(payload.get("logisticsCompany"), 100),
                Validation.cleanText(payload.get("trackingNo"), 100),
                Validation.cleanText(payload.get("dispatchLocation"), 200),
                "PICKUP".equals(payload.get("deliveryMode")) ? "PICKUP" : "DELIVERY",
                java.math.BigDecimal.valueOf(shipmentAmount),
                shippedAt);

        for (Detail detail : details) {
            orderActionMapper.insertShipmentItem(Ids.next("shipitem"), shipmentId, detail.item().getId(),
                    detail.item().getProductId(), detail.quantity(), java.math.BigDecimal.valueOf(detail.amount()));
            consumeReservations(detail.item().getId(), detail.quantity(), shipmentId, user.id());
            orderActionMapper.increaseShipped(detail.item().getId(), detail.quantity());
        }

        int remaining = orderActionMapper.countUnshippedItems(orderId);
        String nextStatus = remaining > 0 ? "PARTIALLY_SHIPPED" : "SHIPPED";
        orderActionMapper.applyShipment(orderId, java.math.BigDecimal.valueOf(shipmentAmount), nextStatus, Times.nowIso());
        auditService.record(user, "SHIP_ORDER", "SHIPMENT", shipmentId,
                Map.of("orderId", orderId, "batchNo", batchNo, "shipmentAmount", shipmentAmount));

        String trackingNo = Validation.cleanText(payload.get("trackingNo"), 100);
        String logistics = Validation.cleanText(payload.get("logisticsCompany"), 100);
        notificationService.notifyCustomer(order.getCustomerId(), "订单第" + batchNo + "批已发货",
                "运单：" + (trackingNo.isEmpty() ? "待补充" : trackingNo)
                        + "，物流：" + (logistics.isEmpty() ? "待补充" : logistics));
        return orderService.detail(user, orderId);
    }

    private void consumeReservations(String orderItemId, int quantity, String shipmentId, String userId) {
        int remaining = quantity;
        String now = Times.nowIso();
        for (ConsumeReservationRow reservation : orderActionMapper.openReservationsForItem(orderItemId)) {
            if (remaining <= 0) {
                break;
            }
            int take = Math.min(remaining, reservation.getQuantity() - reservation.getConsumedQuantity());
            orderActionMapper.consumeReservationPart(reservation.getId(), take);
            orderActionMapper.consumeInventory(reservation.getInventoryId(), take, now);
            orderActionMapper.insertShipmentMovement(Ids.next("move"), reservation.getInventoryId(), -take,
                    shipmentId, userId, now);
            remaining -= take;
        }
        if (remaining > 0) {
            throw new HttpException(409, "INSUFFICIENT_RESERVED_STOCK", "预占库存扣减失败");
        }
    }
}
