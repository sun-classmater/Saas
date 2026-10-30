package com.sanlei.order.shortage;

import java.math.BigDecimal;
import lombok.Data;

/** 缺货分配的候选订单行（含客户与订单画像）。 */
@Data
public class ShortageCandidateRow {
    private String orderItemId;
    private Integer quantity;
    private Integer shippedQuantity;
    private Double currentReserved;
    private String orderId;
    private String orderNo;
    private String status;
    private String settlementMethod;
    private BigDecimal paidAmount;
    private BigDecimal totalAmount;
    private String createdAt;
    private String customerId;
    private String customerName;
    private String grade;
    private String channelType;
    private BigDecimal creditLimit;
}
