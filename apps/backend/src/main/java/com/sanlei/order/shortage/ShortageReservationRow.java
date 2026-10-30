package com.sanlei.order.shortage;

import lombok.Data;

/** 缺货重分配时需要释放的未消耗预占。 */
@Data
public class ShortageReservationRow {
    private String id;
    private String inventoryId;
    private Integer quantity;
    private Integer consumedQuantity;
}
