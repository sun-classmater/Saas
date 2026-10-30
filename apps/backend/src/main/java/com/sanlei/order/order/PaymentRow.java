package com.sanlei.order.order;

import java.math.BigDecimal;
import lombok.Data;

@Data
public class PaymentRow {
    private String id;
    private String paymentNo;
    private BigDecimal amount;
    private String channel;
    private String status;
    private String transactionId;
    private String paidAt;
    private String createdAt;
}
