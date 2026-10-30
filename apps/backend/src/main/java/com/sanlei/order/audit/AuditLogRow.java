package com.sanlei.order.audit;

import lombok.Data;

@Data
public class AuditLogRow {
    private String id;
    private String userName;
    private String action;
    private String entityType;
    private String entityId;
    private String details;
    private String createdAt;
}
