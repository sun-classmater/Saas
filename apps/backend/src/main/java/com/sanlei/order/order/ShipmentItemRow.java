package com.sanlei.order.order;

import java.math.BigDecimal;
import lombok.Data;

/** 发货时校验用的订单行（含产品名与已发/预占数量）。 */
@Data
public class ShipmentItemRow {
    private String id;
    private String orderId;
    private String productId;
    private String productName;
    private Integer quantity;
    private BigDecimal unitPrice;
    private Integer shippedQuantity;
    private Integer reservedQuantity;
}
