package com.sanlei.order.order;

import java.math.BigDecimal;
import lombok.Data;

/** 收款记录（创建/到账流程使用）。 */
@Data
public class PaymentRecordRow {
    private String id;
    private String orderId;
    private String customerId;
    private BigDecimal amount;
    private String status;
}
