package com.sanlei.order.mobile;

import lombok.Data;

/** 收货时读取的发货批次。 */
@Data
public class ShipmentStatusRow {
    private String id;
    private String orderId;
    private String status;
}
