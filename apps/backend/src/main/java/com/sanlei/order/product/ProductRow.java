package com.sanlei.order.product;

import java.math.BigDecimal;
import lombok.Data;

@Data
public class ProductRow {
    private String id;
    private String sku;
    private String name;
    private String category;
    private String vehicleModel;
    private Integer minPackage;
    private BigDecimal basePrice;
    private Integer warrantyMonths;
    private Integer warrantyKm;
    private Integer active;
    private String description;
    private String createdAt;
    private Double realAvailable;
    private Double virtualAvailable;
}
