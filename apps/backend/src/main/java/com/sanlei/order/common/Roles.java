package com.sanlei.order.common;

import com.sanlei.order.auth.AuthUser;
import java.util.Arrays;

public final class Roles {

    private Roles() {
    }

    public static void require(AuthUser user, String... roles) {
        if (user == null || Arrays.stream(roles).noneMatch(role -> role.equals(user.role()))) {
            throw new HttpException(403, "FORBIDDEN", "没有执行此操作的权限");
        }
    }

    public static void requireStaff(AuthUser user) {
        if (user == null || user.isCustomer()) {
            throw new HttpException(403, "FORBIDDEN", "该接口仅供内部人员使用");
        }
    }
}
