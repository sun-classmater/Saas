package com.sanlei.order.shortage;

import lombok.Data;

@Data
public class ShortageProductRow {
    private String productId;
    private String sku;
    private String name;
    private String vehicleModel;
    private Integer minPackage;
    private Double available;
    private Double pendingDemand;
}
