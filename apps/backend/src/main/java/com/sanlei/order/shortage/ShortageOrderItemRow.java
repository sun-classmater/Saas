package com.sanlei.order.shortage;

import lombok.Data;

/** 分配时读取的订单行。 */
@Data
public class ShortageOrderItemRow {
    private String id;
    private String productId;
    private Integer quantity;
    private Integer shippedQuantity;
    private Integer reservedQuantity;
}
