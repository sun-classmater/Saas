package com.sanlei.order.plan;

import lombok.Data;

/** 计划明细（含产品信息），用于列表输出。 */
@Data
public class PlanItemDetailRow {
    private String id;
    private Integer weekNo;
    private String productId;
    private String sku;
    private String name;
    private String vehicleModel;
    private Integer quantity;
    private Integer orderedQuantity;
}
