package com.sanlei.order.finance;

import java.math.BigDecimal;
import lombok.Data;

@Data
public class InvoiceRow {
    private String id;
    private String invoiceNo;
    private String orderId;
    private String customerId;
    private String orderNo;
    private String customerName;
    private String title;
    private String taxNumber;
    private BigDecimal amount;
    private BigDecimal taxRate;
    private String status;
    private String note;
    private String issuedAt;
    private String createdAt;
}
