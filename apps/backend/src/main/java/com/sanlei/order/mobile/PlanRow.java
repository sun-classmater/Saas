package com.sanlei.order.mobile;

import lombok.Data;

/** 计划订单校验用。 */
@Data
public class PlanRow {
    private String id;
    private String customerId;
    private String status;
}
