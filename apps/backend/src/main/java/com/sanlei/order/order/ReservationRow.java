package com.sanlei.order.order;

import lombok.Data;

/** 未消耗完的库存预占（取消订单时释放）。 */
@Data
public class ReservationRow {
    private String id;
    private String orderItemId;
    private String inventoryId;
    private Integer quantity;
    private Integer consumedQuantity;
}
