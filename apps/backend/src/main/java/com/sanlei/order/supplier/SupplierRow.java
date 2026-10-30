package com.sanlei.order.supplier;

import lombok.Data;

@Data
public class SupplierRow {
    private String id;
    private String name;
    private String type;
    private String contact;
    private String phone;
    private Integer active;
}
