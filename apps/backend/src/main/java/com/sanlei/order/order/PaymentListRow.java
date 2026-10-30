package com.sanlei.order.order;

import java.math.BigDecimal;
import lombok.Data;

@Data
public class PaymentListRow {
    private String id;
    private String paymentNo;
    private String customerName;
    private String orderId;
    private String orderNo;
    private BigDecimal amount;
    private String channel;
    private String status;
    private String transactionId;
    private String paidAt;
    private String createdAt;
}
