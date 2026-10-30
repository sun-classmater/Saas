package com.sanlei.order.mobile;

import java.math.BigDecimal;
import lombok.Data;

/** 客户目录行（产品 + 可用库存汇总）。 */
@Data
public class CatalogRow {
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
    private Double realAvailable;
    private Double virtualAvailable;
}
