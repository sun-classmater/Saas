package com.sanlei.order.notification;

import lombok.Data;

@Data
public class NotificationRow {
    private String id;
    private String title;
    private String content;
    private String readAt;
    private String createdAt;
}
