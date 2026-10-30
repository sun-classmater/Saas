package com.sanlei.order.audit;

import com.sanlei.order.auth.AuthInterceptor;
import com.sanlei.order.common.ApiResponse;
import com.sanlei.order.common.Roles;
import jakarta.servlet.http.HttpServletRequest;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/admin")
public class AuditLogController {

    private final AuditLogMapper auditLogMapper;

    public AuditLogController(AuditLogMapper auditLogMapper) {
        this.auditLogMapper = auditLogMapper;
    }

    @GetMapping("/audit-logs")
    public Map<String, Object> list(HttpServletRequest request) {
        Roles.require(AuthInterceptor.currentUser(request), "SUPER_ADMIN");
        List<Map<String, Object>> result = new ArrayList<>();
        for (AuditLogRow row : auditLogMapper.recent()) {
            Map<String, Object> view = new LinkedHashMap<>();
            view.put("id", row.getId());
            view.put("userName", row.getUserName());
            view.put("action", row.getAction());
            view.put("entityType", row.getEntityType());
            view.put("entityId", row.getEntityId());
            view.put("details", row.getDetails());
            view.put("createdAt", row.getCreatedAt());
            result.add(view);
        }
        return ApiResponse.data(result);
    }
}
