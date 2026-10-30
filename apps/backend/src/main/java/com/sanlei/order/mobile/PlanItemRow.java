package com.sanlei.order.mobile;

import lombok.Data;

/** 计划周明细校验用。 */
@Data
public class PlanItemRow {
    private String id;
    private String planId;
    private Integer weekNo;
    private String productId;
    private Integer quantity;
    private Integer orderedQuantity;
}
