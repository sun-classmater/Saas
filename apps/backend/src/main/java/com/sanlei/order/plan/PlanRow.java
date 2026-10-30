package com.sanlei.order.plan;

import lombok.Data;

@Data
public class PlanRow {
    private String id;
    private String planNo;
    private String customerId;
    private String customerName;
    private String grade;
    private String planMonth;
    private String status;
    private String customerNote;
    private String bangbangNote;
    private String sanleiNote;
    private String submittedAt;
    private String bangbangReviewedAt;
    private String sanleiReviewedAt;
    private String createdAt;
    private String updatedAt;
}
