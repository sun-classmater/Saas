package com.sanlei.order.mobile;

import java.math.BigDecimal;
import lombok.Data;

/** 下单时使用的客户快照（含结算与发货规则）。 */
@Data
public class MobileCustomerRow {
    private String id;
    private String code;
    private String name;
    private String province;
    private String city;
    private String channelType;
    private String grade;
    private String priceTier;
    private String settlementMethod;
    private Integer paymentTermsDays;
    private BigDecimal creditLimit;
    private BigDecimal prepayRatio;
    private Integer batchLimit;
    private Integer allowOverpayment;
    private String phone;
    private String address;
    private Integer active;
    private String notes;
    private String createdAt;
}
