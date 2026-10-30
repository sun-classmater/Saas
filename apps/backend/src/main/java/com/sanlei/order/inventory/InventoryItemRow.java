package com.sanlei.order.inventory;

import lombok.Data;

/** 库存行（含产品与供应商信息）。 */
@Data
public class InventoryItemRow {
    private String id;
    private String productId;
    private String sku;
    private String name;
    private String vehicleModel;
    private Integer minPackage;
    private String warehouseName;
    private String sourceType;
    private String supplierId;
    private String supplierName;
    private Integer quantity;
    private Integer reserved;
    private String updatedAt;
}
