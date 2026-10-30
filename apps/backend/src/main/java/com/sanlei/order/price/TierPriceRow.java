package com.sanlei.order.price;

import java.math.BigDecimal;
import lombok.Data;

@Data
public class TierPriceRow {
    private String id;
    private String tier;
    private String productId;
    private BigDecimal price;
    private String sku;
    private String productName;
}

@Data
class CustomerPriceRow {
    private String id;
    private String customerId;
    private String customerName;
    private String productId;
    private BigDecimal price;
    private String sku;
    private String productName;
}
