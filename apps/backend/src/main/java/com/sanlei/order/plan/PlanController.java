package com.sanlei.order.plan;

import com.sanlei.order.auth.AuthInterceptor;
import com.sanlei.order.auth.AuthUser;
import com.sanlei.order.common.ApiResponse;
import jakarta.servlet.http.HttpServletRequest;
import java.util.Map;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/admin")
public class PlanController {

    private final PlanService planService;

    public PlanController(PlanService planService) {
        this.planService = planService;
    }

    @GetMapping("/plans")
    public Map<String, Object> list(@RequestParam(required = false) String customerId,
                                    @RequestParam(required = false) String status,
                                    HttpServletRequest request) {
        return ApiResponse.data(planService.list(AuthInterceptor.currentUser(request), customerId, status));
    }

    @PostMapping("/plans/{id}/actions")
    public Map<String, Object> action(@PathVariable String id,
                                      @RequestBody(required = false) Map<String, Object> body,
                                      HttpServletRequest request) {
        AuthUser user = AuthInterceptor.currentUser(request);
        Map<String, Object> payload = body == null ? Map.of() : body;
        return ApiResponse.data(planService.action(user, id,
                payload.get("action") == null ? "" : String.valueOf(payload.get("action")),
                payload.get("note") == null ? "" : String.valueOf(payload.get("note"))));
    }
}
