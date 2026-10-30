package com.sanlei.order.order;

import java.math.BigDecimal;
import lombok.Data;

@Data
public class OrderItemRow {
    private String id;
    private String orderId;
    private String productId;
    private String sku;
    private String name;
    private String category;
    private String vehicleModel;
    private Integer minPackage;
    private Integer quantity;
    private BigDecimal unitPrice;
    private BigDecimal amount;
    private Integer reservedQuantity;
    private Integer shippedQuantity;
}
