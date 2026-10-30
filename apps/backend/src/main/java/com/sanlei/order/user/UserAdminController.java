package com.sanlei.order.user;

import com.sanlei.order.auth.AuthInterceptor;
import com.sanlei.order.auth.AuthUser;
import com.sanlei.order.common.ApiResponse;
import com.sanlei.order.common.Roles;
import com.sanlei.order.common.Validation;
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
public class UserAdminController {

    private final UserAdminService userAdminService;

    public UserAdminController(UserAdminService userAdminService) {
        this.userAdminService = userAdminService;
    }

    @GetMapping("/users")
    public Map<String, Object> list(HttpServletRequest request) {
        Roles.require(AuthInterceptor.currentUser(request), "SUPER_ADMIN", "BANGBANG_OPS");
        return ApiResponse.data(userAdminService.list());
    }

    @PostMapping("/users/customer")
    public ResponseEntity<Map<String, Object>> createCustomerUser(@RequestBody(required = false) Map<String, Object> body,
                                                                 HttpServletRequest request) {
        AuthUser user = AuthInterceptor.currentUser(request);
        Roles.require(user, "SUPER_ADMIN", "BANGBANG_OPS");
        Map<String, Object> data = userAdminService.createCustomerUser(user, body == null ? Map.of() : body);
        return ResponseEntity.status(HttpStatus.CREATED).body(ApiResponse.data(data));
    }

    @PostMapping("/users/staff")
    public ResponseEntity<Map<String, Object>> createStaffUser(@RequestBody(required = false) Map<String, Object> body,
                                                              HttpServletRequest request) {
        AuthUser user = AuthInterceptor.currentUser(request);
        Roles.require(user, "SUPER_ADMIN");
        Map<String, Object> data = userAdminService.createStaffUser(user, body == null ? Map.of() : body);
        return ResponseEntity.status(HttpStatus.CREATED).body(ApiResponse.data(data));
    }

    @PostMapping("/users/{id}/toggle")
    public Map<String, Object> toggle(@PathVariable String id,
                                      @RequestBody(required = false) Map<String, Object> body,
                                      HttpServletRequest request) {
        AuthUser user = AuthInterceptor.currentUser(request);
        Roles.require(user, "SUPER_ADMIN");
        Object activeValue = body == null ? null : body.get("active");
        boolean active = activeValue instanceof Boolean flag ? flag : Validation.asBoolean(
                activeValue == null ? 0 : Integer.valueOf(String.valueOf(activeValue)));
        return ApiResponse.data(userAdminService.toggle(user, id, active));
    }
}
