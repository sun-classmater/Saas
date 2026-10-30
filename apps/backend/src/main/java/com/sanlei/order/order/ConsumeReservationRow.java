package com.sanlei.order.order;

import lombok.Data;

/** 发货时按创建时间顺序消耗的预占。 */
@Data
public class ConsumeReservationRow {
    private String id;
    private String inventoryId;
    private Integer quantity;
    private Integer consumedQuantity;
}
