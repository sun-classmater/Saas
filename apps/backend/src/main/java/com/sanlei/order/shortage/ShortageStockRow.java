package com.sanlei.order.shortage;

import lombok.Data;

/** 可占用库存行。 */
@Data
public class ShortageStockRow {
    private String id;
    private Integer quantity;
    private Integer reserved;
}
