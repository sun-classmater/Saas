package com.sanlei.order.aftersales;

import com.sanlei.order.auth.AuthInterceptor;
import com.sanlei.order.auth.AuthUser;
import com.sanlei.order.common.ApiResponse;
import jakarta.servlet.http.HttpServletRequest;
import java.util.Map;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/admin")
public class AfterSalesController {

    private final AfterSalesService afterSalesService;

    public AfterSalesController(AfterSalesService afterSalesService) {
        this.afterSalesService = afterSalesService;
    }

    @GetMapping("/after-sales")
    public Map<String, Object> list(HttpServletRequest request) {
        return ApiResponse.data(afterSalesService.list(AuthInterceptor.currentUser(request)));
    }

    @PutMapping("/after-sales/{id}")
    public Map<String, Object> update(@PathVariable String id,
                                      @RequestBody(required = false) Map<String, Object> body,
                                      HttpServletRequest request) {
        AuthUser user = AuthInterceptor.currentUser(request);
        Map<String, Object> payload = body == null ? Map.of() : body;
        return ApiResponse.data(afterSalesService.updateStatus(user, id,
                payload.get("status") == null ? "" : String.valueOf(payload.get("status")),
                payload.get("resolution") == null ? "" : String.valueOf(payload.get("resolution"))));
    }
}
