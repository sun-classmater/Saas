package com.sanlei.order.aftersales;

import java.math.BigDecimal;
import lombok.Data;

@Data
public class AfterSalesRow {
    private String id;
    private String caseNo;
    private String customerId;
    private String customerName;
    private String orderId;
    private String orderNo;
    private String type;
    private String status;
    private String description;
    private BigDecimal claimAmount;
    private String resolution;
    private String createdAt;
    private String updatedAt;
}
