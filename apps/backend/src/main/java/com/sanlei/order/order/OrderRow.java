package com.sanlei.order.order;

import java.math.BigDecimal;
import lombok.Data;

@Data
public class OrderRow {
    private String id;
    private String orderNo;
    private String groupId;
    private String customerId;
    private String vehicleModel;
    private String orderType;
    private String settlementMethod;
    private String status;
    private BigDecimal totalAmount;
    private BigDecimal paidAmount;
    private BigDecimal shippedAmount;
    private BigDecimal prepayRatio;
    private Integer allowOverpayment;
    private Integer batchLimit;
    private String planId;
    private Integer planWeek;
    private String customerNote;
    private String opsNote;
    private String createdAt;
    private String updatedAt;
    // 关联查询字段
    private String groupNo;
    private String customerName;
    private String customerGrade;
}
