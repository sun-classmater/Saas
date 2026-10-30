package com.sanlei.order.user;

import com.sanlei.order.audit.AuditService;
import com.sanlei.order.auth.AuthUser;
import com.sanlei.order.auth.PasswordHasher;
import com.sanlei.order.common.HttpException;
import com.sanlei.order.common.Ids;
import com.sanlei.order.common.Times;
import com.sanlei.order.common.Validation;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** 账号管理：内部员工号、客户子账号、启停用与审计日志。 */
@Service
public class UserAdminService {

    private static final Set<String> STAFF_ROLES = Set.of(
            "BANGBANG_OPS", "BANGBANG_FINANCE", "SANLEI_SALES",
            "SANLEI_WAREHOUSE", "SANLEI_FINANCE", "SANLEI_AFTERSALES");

    private final UserAdminMapper userAdminMapper;
    private final AuditService auditService;

    public UserAdminService(UserAdminMapper userAdminMapper, AuditService auditService) {
        this.userAdminMapper = userAdminMapper;
        this.auditService = auditService;
    }

    private Map<String, Object> map(UserListRow row) {
        Map<String, Object> view = new LinkedHashMap<>();
        view.put("id", row.getId());
        view.put("username", row.getUsername());
        view.put("displayName", row.getDisplayName());
        view.put("phone", row.getPhone());
        view.put("role", row.getRole());
        view.put("customerName", row.getCustomerName());
        view.put("active", Validation.asBoolean(row.getActive()));
        view.put("createdAt", row.getCreatedAt());
        return view;
    }

    public List<Map<String, Object>> list() {
        List<Map<String, Object>> result = new ArrayList<>();
        for (UserListRow row : userAdminMapper.listAll()) {
            result.add(map(row));
        }
        return result;
    }

    @Transactional
    public Map<String, Object> createCustomerUser(AuthUser user, Map<String, Object> payload) {
        String customerId = payload.get("customerId") == null ? "" : String.valueOf(payload.get("customerId"));
        String customerName = userAdminMapper.customerName(customerId);
        if (customerName == null) {
            throw new HttpException(404, "CUSTOMER_NOT_FOUND", "客户不存在");
        }
        String phone = Validation.requireText(payload.get("phone"), "手机号", 30);
        String userId = Ids.next("user");
        String username = Validation.cleanText(
                payload.get("username") == null || "".equals(payload.get("username")) ? phone : payload.get("username"),
                80);
        String displayName = Validation.requireText(
                payload.get("displayName") == null || "".equals(payload.get("displayName"))
                        ? customerName : payload.get("displayName"),
                "账号名称");
        try {
            userAdminMapper.insertCustomerUser(userId, username, displayName, phone, customerId, Times.nowIso());
            auditService.record(user, "CREATE_CUSTOMER_USER", "USER", userId,
                    Map.of("customerId", customerId, "phone", phone));
        } catch (DuplicateKeyException error) {
            throw new HttpException(409, "USER_EXISTS", "登录名或手机号已绑定其他账号");
        }
        return map(userAdminMapper.findById(userId));
    }

    @Transactional
    public Map<String, Object> createStaffUser(AuthUser user, Map<String, Object> payload) {
        String role = Validation.cleanText(payload.get("role"), 32).toUpperCase();
        if (!STAFF_ROLES.contains(role)) {
            throw new HttpException(400, "VALIDATION_ERROR", "内部角色无效");
        }
        String password = Validation.requireText(payload.get("password"), "登录密码", 200);
        if (password.length() < 8) {
            throw new HttpException(400, "WEAK_PASSWORD", "登录密码至少8位");
        }
        String userId = Ids.next("user");
        String username = Validation.requireText(payload.get("username"), "登录名", 80);
        String displayName = Validation.requireText(payload.get("displayName"), "姓名", 100);
        try {
            userAdminMapper.insertStaffUser(userId, username, PasswordHasher.hash(password), displayName,
                    Validation.cleanText(payload.get("phone"), 30), role, Times.nowIso());
            auditService.record(user, "CREATE_STAFF_USER", "USER", userId, Map.of("role", role));
        } catch (DuplicateKeyException error) {
            throw new HttpException(409, "USER_EXISTS", "登录名已存在");
        }
        return map(userAdminMapper.findById(userId));
    }

    @Transactional
    public Map<String, Object> toggle(AuthUser user, String userId, boolean active) {
        String role = userAdminMapper.roleOf(userId);
        if (role == null) {
            throw new HttpException(404, "USER_NOT_FOUND", "账号不存在");
        }
        if ("SUPER_ADMIN".equals(role) && !active) {
            throw new HttpException(409, "CANNOT_DISABLE_ADMIN", "不能停用超级管理员");
        }
        userAdminMapper.updateActive(userId, active ? 1 : 0);
        auditService.record(user, active ? "ENABLE_USER" : "DISABLE_USER", "USER", userId, null);
        return map(userAdminMapper.findById(userId));
    }
}
