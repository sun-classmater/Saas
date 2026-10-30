package com.sanlei.order.supplier;

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
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/admin")
public class SupplierController {

    private static final String[] WRITE_ROLES = {"SUPER_ADMIN", "SANLEI_SALES", "SANLEI_WAREHOUSE"};

    private final SupplierService supplierService;

    public SupplierController(SupplierService supplierService) {
        this.supplierService = supplierService;
    }

    @GetMapping("/suppliers")
    public Map<String, Object> list(HttpServletRequest request) {
        AuthInterceptor.currentUser(request);
        return ApiResponse.data(supplierService.list());
    }

    @PostMapping("/suppliers")
    public ResponseEntity<Map<String, Object>> create(@RequestBody(required = false) Map<String, Object> body,
                                                      HttpServletRequest request) {
        AuthUser user = AuthInterceptor.currentUser(request);
        Roles.require(user, WRITE_ROLES);
        Map<String, Object> data = supplierService.save(user, body == null ? Map.of() : body, null);
        return ResponseEntity.status(HttpStatus.CREATED).body(ApiResponse.data(data));
    }

    @PutMapping("/suppliers/{id}")
    public Map<String, Object> update(@PathVariable String id,
                                      @RequestBody(required = false) Map<String, Object> body,
                                      HttpServletRequest request) {
        AuthUser user = AuthInterceptor.currentUser(request);
        Roles.require(user, WRITE_ROLES);
        return ApiResponse.data(supplierService.save(user, body == null ? Map.of() : body, id));
    }
}
