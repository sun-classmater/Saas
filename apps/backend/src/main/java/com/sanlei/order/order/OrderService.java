package com.sanlei.order.order;

import com.sanlei.order.auth.AuthUser;
import com.sanlei.order.common.HttpException;
import com.sanlei.order.common.Validation;
import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.stereotype.Service;

@Service
public class OrderService {

    private final OrderMapper orderMapper;

    public OrderService(OrderMapper orderMapper) {
        this.orderMapper = orderMapper;
    }

    public Map<String, Object> mapOrder(OrderRow row) {
        BigDecimal total = row.getTotalAmount() == null ? BigDecimal.ZERO : row.getTotalAmount();
        BigDecimal paid = row.getPaidAmount() == null ? BigDecimal.ZERO : row.getPaidAmount();
        BigDecimal shipped = row.getShippedAmount() == null ? BigDecimal.ZERO : row.getShippedAmount();
        Map<String, Object> view = new LinkedHashMap<>();
        view.put("id", row.getId());
        view.put("orderNo", row.getOrderNo());
        view.put("groupId", row.getGroupId());
        view.put("groupNo", row.getGroupNo());
        view.put("customerId", row.getCustomerId());
        view.put("customerName", row.getCustomerName());
        view.put("customerGrade", row.getCustomerGrade());
        view.put("vehicleModel", row.getVehicleModel());
        view.put("orderType", row.getOrderType());
        view.put("settlementMethod", row.getSettlementMethod());
        view.put("status", row.getStatus());
        view.put("totalAmount", Validation.money(total));
        view.put("paidAmount", Validation.money(paid));
        view.put("shippedAmount", Validation.money(shipped));
        view.put("unpaidAmount", Validation.money(total.subtract(paid)));
        view.put("unshippedAmount", Validation.money(total.subtract(shipped)));
        view.put("prepayRatio", row.getPrepayRatio() == null ? 1d : row.getPrepayRatio().doubleValue());
        view.put("allowOverpayment", Validation.asBoolean(row.getAllowOverpayment()));
        view.put("batchLimit", row.getBatchLimit());
        view.put("planId", row.getPlanId());
        view.put("planWeek", row.getPlanWeek());
        view.put("customerNote", row.getCustomerNote());
        view.put("opsNote", row.getOpsNote());
        view.put("createdAt", row.getCreatedAt());
        view.put("updatedAt", row.getUpdatedAt());
        return view;
    }

    public List<Map<String, Object>> list(AuthUser user, String customerId, String status, String type, String keyword) {
        String scopedCustomer = user != null && user.isCustomer() ? user.customerId() : blankToNull(customerId);
        String keywordParam = keyword == null || keyword.isBlank()
                ? null
                : "%" + keyword.trim().substring(0, Math.min(keyword.trim().length(), 1000)) + "%";
        List<Map<String, Object>> result = new ArrayList<>();
        for (OrderRow row : orderMapper.search(scopedCustomer, blankToNull(status), blankToNull(type), keywordParam)) {
            result.add(mapOrder(row));
        }
        return result;
    }

    public Map<String, Object> detail(AuthUser user, String orderId) {
        OrderRow row = orderMapper.findById(orderId);
        if (row == null) {
            throw new HttpException(404, "ORDER_NOT_FOUND", "订单不存在");
        }
        if (user != null && user.isCustomer() && !user.customerId().equals(row.getCustomerId())) {
            throw new HttpException(404, "ORDER_NOT_FOUND", "订单不存在");
        }
        Map<String, Object> order = mapOrder(row);

        List<Map<String, Object>> items = new ArrayList<>();
        for (OrderItemRow item : orderMapper.items(orderId)) {
            Map<String, Object> view = new LinkedHashMap<>();
            view.put("id", item.getId());
            view.put("productId", item.getProductId());
            view.put("sku", item.getSku());
            view.put("name", item.getName());
            view.put("category", item.getCategory());
            view.put("vehicleModel", item.getVehicleModel());
            view.put("minPackage", item.getMinPackage());
            view.put("quantity", item.getQuantity());
            view.put("unitPrice", Validation.money(item.getUnitPrice()));
            view.put("amount", Validation.money(item.getAmount()));
            view.put("reservedQuantity", item.getReservedQuantity());
            view.put("shippedQuantity", item.getShippedQuantity());
            view.put("remainingQuantity", item.getQuantity() - item.getShippedQuantity());
            items.add(view);
        }
        order.put("items", items);

        List<Map<String, Object>> payments = new ArrayList<>();
        for (PaymentRow payment : orderMapper.payments(orderId)) {
            Map<String, Object> view = new LinkedHashMap<>();
            view.put("id", payment.getId());
            view.put("paymentNo", payment.getPaymentNo());
            view.put("amount", Validation.money(payment.getAmount()));
            view.put("channel", payment.getChannel());
            view.put("status", payment.getStatus());
            view.put("transactionId", payment.getTransactionId());
            view.put("paidAt", payment.getPaidAt());
            view.put("createdAt", payment.getCreatedAt());
            payments.add(view);
        }
        order.put("payments", payments);

        List<Map<String, Object>> shipments = new ArrayList<>();
        for (ShipmentRow shipment : orderMapper.shipments(orderId)) {
            Map<String, Object> view = new LinkedHashMap<>();
            view.put("id", shipment.getId());
            view.put("shipmentNo", shipment.getShipmentNo());
            view.put("batchNo", shipment.getBatchNo());
            view.put("status", shipment.getStatus());
            view.put("logisticsCompany", shipment.getLogisticsCompany());
            view.put("trackingNo", shipment.getTrackingNo());
            view.put("dispatchLocation", shipment.getDispatchLocation());
            view.put("deliveryMode", shipment.getDeliveryMode());
            view.put("amount", Validation.money(shipment.getAmount()));
            view.put("shippedAt", shipment.getShippedAt());
            view.put("receivedAt", shipment.getReceivedAt());
            view.put("summary", shipment.getSummary());
            shipments.add(view);
        }
        order.put("shipments", shipments);

        OrderGroupRow groupRow = orderMapper.group(row.getGroupId());
        Map<String, Object> group = new LinkedHashMap<>();
        if (groupRow != null) {
            // 与 Node 端一致：group 为 order_groups 原样字段（去掉 id 与 customer_id）
            group.put("group_no", groupRow.getGroupNo());
            group.put("settlement_week", groupRow.getSettlementWeek());
            group.put("settlement_method", groupRow.getSettlementMethod());
            group.put("currency", groupRow.getCurrency());
            group.put("tax_mode", groupRow.getTaxMode());
            group.put("created_at", groupRow.getCreatedAt());
        }
        List<Map<String, Object>> siblings = new ArrayList<>();
        for (OrderRow sibling : orderMapper.siblings(row.getGroupId())) {
            Map<String, Object> view = new LinkedHashMap<>();
            view.put("id", sibling.getId());
            view.put("orderNo", sibling.getOrderNo());
            view.put("vehicleModel", sibling.getVehicleModel());
            view.put("totalAmount", Validation.money(sibling.getTotalAmount()));
            view.put("status", sibling.getStatus());
            siblings.add(view);
        }
        group.put("siblingOrders", siblings);
        order.put("group", group);
        return order;
    }

    private String blankToNull(String value) {
        return value == null || value.isBlank() ? null : value;
    }
}
