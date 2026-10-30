package com.sanlei.order.inventory;

import lombok.Data;

/** 库存流水行。 */
@Data
public class MovementRow {
    private String id;
    private String sku;
    private String name;
    private String warehouseName;
    private String type;
    private Integer quantity;
    private String referenceType;
    private String referenceId;
    private String note;
    private String createdAt;
}
