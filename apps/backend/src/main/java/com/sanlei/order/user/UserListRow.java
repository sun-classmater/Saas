package com.sanlei.order.user;

import lombok.Data;

@Data
public class UserListRow {
    private String id;
    private String username;
    private String displayName;
    private String phone;
    private String role;
    private String customerName;
    private Integer active;
    private String createdAt;
}
