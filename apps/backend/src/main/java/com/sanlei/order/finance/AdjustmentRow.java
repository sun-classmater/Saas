package com.sanlei.order.finance;

import java.math.BigDecimal;
import lombok.Data;

@Data
public class AdjustmentRow {
    private String id;
    private String adjustmentNo;
    private String customerId;
    private String orderId;
    private String orderNo;
    private String customerName;
    private String type;
    private BigDecimal amount;
    private String status;
    private String description;
    private String settledAt;
    private String createdAt;
}
