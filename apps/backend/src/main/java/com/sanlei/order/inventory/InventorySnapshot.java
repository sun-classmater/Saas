package com.sanlei.order.inventory;

import lombok.Data;

/** 库存快照（移库/调整校验用）。 */
@Data
public class InventorySnapshot {
    private String id;
    private String productId;
    private String warehouseName;
    private Integer quantity;
    private Integer reserved;
}
