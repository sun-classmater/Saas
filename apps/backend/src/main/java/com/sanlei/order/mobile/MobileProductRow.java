package com.sanlei.order.mobile;

import java.math.BigDecimal;
import lombok.Data;

/** 下单时的产品快照。 */
@Data
public class MobileProductRow {
    private String id;
    private String sku;
    private String name;
    private String category;
    private String vehicleModel;
    private Integer minPackage;
    private BigDecimal basePrice;
    private Integer warrantyMonths;
    private Integer warrantyKm;
    private String description;
}
