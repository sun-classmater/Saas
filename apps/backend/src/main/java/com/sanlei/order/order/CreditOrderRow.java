package com.sanlei.order.order;

import java.math.BigDecimal;
import lombok.Data;

/** 订单动作需要的行（带客户授信额度与发货字段）。 */
@Data
public class CreditOrderRow {
    private String id;
    private String customerId;
    private String orderNo;
    private String status;
    private String settlementMethod;
    private BigDecimal totalAmount;
    private BigDecimal paidAmount;
    private BigDecimal shippedAmount;
    private BigDecimal prepayRatio;
    private Integer allowOverpayment;
    private Integer batchLimit;
    private String planId;
    private Integer planWeek;
    private BigDecimal creditLimit;
}
