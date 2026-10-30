package com.sanlei.order.order;

import java.math.BigDecimal;
import lombok.Data;

@Data
public class ShipmentRow {
    private String id;
    private String shipmentNo;
    private Integer batchNo;
    private String status;
    private String logisticsCompany;
    private String trackingNo;
    private String dispatchLocation;
    private String deliveryMode;
    private BigDecimal amount;
    private String shippedAt;
    private String receivedAt;
    private String summary;
}
