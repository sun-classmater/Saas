package com.sanlei.order.shortage;

import java.math.BigDecimal;
import lombok.Data;

/** 近 90 天客户采购额。 */
@Data
public class RecentPurchaseRow {
    private String customerId;
    private BigDecimal amount;
}
