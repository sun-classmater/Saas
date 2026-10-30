package com.sanlei.order.auth;

import lombok.Data;

@Data
public class UserRow {
    private String id;
    private String username;
    private String passwordHash;
    private String displayName;
    private String phone;
    private String wechatOpenid;
    private String role;
    private String customerId;
    private Integer active;
    private String createdAt;
}
