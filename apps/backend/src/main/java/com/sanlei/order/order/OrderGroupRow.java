package com.sanlei.order.order;

import lombok.Data;

@Data
public class OrderGroupRow {
    private String id;
    private String groupNo;
    private String customerId;
    private String settlementWeek;
    private String settlementMethod;
    private String currency;
    private String taxMode;
    private String createdAt;
}
