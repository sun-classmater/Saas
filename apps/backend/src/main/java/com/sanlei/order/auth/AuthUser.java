package com.sanlei.order.auth;

/** 登录态用户（对应 Node 端 mapAuthUser）。 */
public record AuthUser(
        String id,
        String username,
        String displayName,
        String phone,
        String wechatOpenid,
        String role,
        String customerId,
        String token
) {

    public boolean isCustomer() {
        return "CUSTOMER_ADMIN".equals(role) || "CUSTOMER_BUYER".equals(role);
    }
}
