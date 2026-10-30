package com.sanlei.order.order;

import lombok.Data;

/** 库存行（下单确认时占用）。 */
@Data
public class InventoryRow {
    private String id;
    private String productId;
    private String sourceType;
    private Integer quantity;
    private Integer reserved;
    private String updatedAt;
}
