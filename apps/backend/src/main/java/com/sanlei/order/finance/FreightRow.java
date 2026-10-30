package com.sanlei.order.finance;

import java.math.BigDecimal;
import lombok.Data;

@Data
public class FreightRow {
    private String id;
    private String orderId;
    private String customerId;
    private String orderNo;
    private String customerName;
    private BigDecimal amount;
    private String payer;
    private String status;
    private String description;
    private String settledAt;
    private String createdAt;
}
