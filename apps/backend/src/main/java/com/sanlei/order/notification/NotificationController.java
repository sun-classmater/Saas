package com.sanlei.order.notification;

import com.sanlei.order.auth.AuthInterceptor;
import com.sanlei.order.auth.AuthUser;
import com.sanlei.order.common.ApiResponse;
import com.sanlei.order.common.Times;
import jakarta.servlet.http.HttpServletRequest;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api")
public class NotificationController {

    private final NotificationMapper notificationMapper;

    public NotificationController(NotificationMapper notificationMapper) {
        this.notificationMapper = notificationMapper;
    }

    @GetMapping("/notifications")
    public Map<String, Object> list(HttpServletRequest request) {
        AuthUser user = AuthInterceptor.currentUser(request);
        List<Map<String, Object>> result = new ArrayList<>();
        for (NotificationRow row : notificationMapper.listByUser(user.id())) {
            Map<String, Object> view = new LinkedHashMap<>();
            view.put("id", row.getId());
            view.put("title", row.getTitle());
            view.put("content", row.getContent());
            view.put("read", row.getReadAt() != null);
            view.put("readAt", row.getReadAt());
            view.put("createdAt", row.getCreatedAt());
            result.add(view);
        }
        return ApiResponse.data(result);
    }

    @PostMapping("/notifications/{id}/read")
    public Map<String, Object> markRead(@PathVariable String id, HttpServletRequest request) {
        AuthUser user = AuthInterceptor.currentUser(request);
        notificationMapper.markRead(id, user.id(), Times.nowIso());
        return ApiResponse.data(ApiResponse.map("ok", true));
    }
}
