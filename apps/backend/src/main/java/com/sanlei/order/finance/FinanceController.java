package com.sanlei.order.finance;

import com.sanlei.order.auth.AuthInterceptor;
import com.sanlei.order.auth.AuthUser;
import com.sanlei.order.common.ApiResponse;
import com.sanlei.order.common.Roles;
import jakarta.servlet.http.HttpServletRequest;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/admin")
public class FinanceController {

    private static final String[] READ_ROLES = {"SUPER_ADMIN", "SANLEI_FINANCE", "BANGBANG_FINANCE", "BANGBANG_OPS"};

    private final FinanceService financeService;

    public FinanceController(FinanceService financeService) {
        this.financeService = financeService;
    }

    @GetMapping("/finance")
    public Map<String, Object> list(HttpServletRequest request) {
        Roles.require(AuthInterceptor.currentUser(request), READ_ROLES);
        return ApiResponse.data(financeService.list());
    }

    @PostMapping("/finance/invoices")
    public ResponseEntity<Map<String, Object>> createInvoice(@RequestBody(required = false) Map<String, Object> body,
                                                             HttpServletRequest request) {
        AuthUser user = AuthInterceptor.currentUser(request);
        Roles.require(user, "SUPER_ADMIN", "SANLEI_FINANCE");
        Map<String, Object> data = financeService.createInvoice(user, body == null ? Map.of() : body);
        return ResponseEntity.status(HttpStatus.CREATED).body(ApiResponse.data(data));
    }

    @PostMapping("/finance/invoices/{id}/status")
    public Map<String, Object> updateInvoiceStatus(@PathVariable String id,
                                                   @RequestBody(required = false) Map<String, Object> body,
                                                   HttpServletRequest request) {
        AuthUser user = AuthInterceptor.currentUser(request);
        Roles.require(user, "SUPER_ADMIN", "SANLEI_FINANCE");
        String status = body == null || body.get("status") == null ? "" : String.valueOf(body.get("status"));
        return ApiResponse.data(financeService.updateInvoiceStatus(user, id, status));
    }

    @PostMapping("/finance/freight")
    public ResponseEntity<Map<String, Object>> createFreight(@RequestBody(required = false) Map<String, Object> body,
                                                             HttpServletRequest request) {
        AuthUser user = AuthInterceptor.currentUser(request);
        Roles.require(user, "SUPER_ADMIN", "SANLEI_FINANCE", "SANLEI_WAREHOUSE");
        Map<String, Object> data = financeService.createFreight(user, body == null ? Map.of() : body);
        return ResponseEntity.status(HttpStatus.CREATED).body(ApiResponse.data(data));
    }

    @PostMapping("/finance/adjustments")
    public ResponseEntity<Map<String, Object>> createAdjustment(@RequestBody(required = false) Map<String, Object> body,
                                                                HttpServletRequest request) {
        AuthUser user = AuthInterceptor.currentUser(request);
        Roles.require(user, "SUPER_ADMIN", "SANLEI_FINANCE", "BANGBANG_FINANCE");
        Map<String, Object> data = financeService.createAdjustment(user, body == null ? Map.of() : body);
        return ResponseEntity.status(HttpStatus.CREATED).body(ApiResponse.data(data));
    }

    @PostMapping("/finance/{kind}/{id}/settle")
    public Map<String, Object> settle(@PathVariable String kind, @PathVariable String id,
                                      HttpServletRequest request) {
        AuthUser user = AuthInterceptor.currentUser(request);
        Roles.require(user, "SUPER_ADMIN", "SANLEI_FINANCE", "BANGBANG_FINANCE");
        return ApiResponse.data(financeService.settle(user, kind, id));
    }
}
