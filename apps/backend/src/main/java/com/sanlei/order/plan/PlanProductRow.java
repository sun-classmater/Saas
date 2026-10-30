package com.sanlei.order.plan;

import lombok.Data;

/** 计划校验用的产品快照。 */
@Data
public class PlanProductRow {
    private String id;
    private String name;
    private Integer minPackage;
}
