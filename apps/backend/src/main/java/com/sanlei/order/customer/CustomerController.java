package com.sanlei.order.customer;

import com.sanlei.order.auth.AuthInterceptor;
import com.sanlei.order.auth.AuthUser;
import com.sanlei.order.common.ApiResponse;
import com.sanlei.order.common.Roles;
import com.sanlei.order.price.PriceService;
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
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/admin")
public class CustomerController {

    private static final String[] READ_ROLES = {"SUPER_ADMIN", "BANGBANG_OPS", "BANGBANG_FINANCE", "SANLEI_SALES", "SANLEI_FINANCE"};
    private static final String[] WRITE_ROLES = {"SUPER_ADMIN", "BANGBANG_OPS"};

    private final CustomerService customerService;
    private final PriceService priceService;

    public CustomerController(CustomerService customerService, PriceService priceService) {
        this.customerService = customerService;
        this.priceService = priceService;
    }

    @GetMapping("/customers")
    public Map<String, Object> list(@RequestParam(required = false) String keyword,
                                    @RequestParam(required = false) String active,
                                    HttpServletRequest request) {
        Roles.require(AuthInterceptor.currentUser(request), READ_ROLES);
        return ApiResponse.data(customerService.list(keyword, active));
    }

    @PostMapping("/customers")
    public ResponseEntity<Map<String, Object>> create(@RequestBody(required = false) Map<String, Object> body,
                                                      HttpServletRequest request) {
        AuthUser user = AuthInterceptor.currentUser(request);
        Roles.require(user, WRITE_ROLES);
        Map<String, Object> data = customerService.save(user, body == null ? Map.of() : body, null);
        return ResponseEntity.status(HttpStatus.CREATED).body(ApiResponse.data(data));
    }

    @PutMapping("/customers/{id}")
    public Map<String, Object> update(@PathVariable String id,
                                      @RequestBody(required = false) Map<String, Object> body,
                                      HttpServletRequest request) {
        AuthUser user = AuthInterceptor.currentUser(request);
        Roles.require(user, WRITE_ROLES);
        return ApiResponse.data(customerService.save(user, body == null ? Map.of() : body, id));
    }

    @GetMapping("/customers/{id}/effective-prices")
    public Map<String, Object> effectivePrices(@PathVariable String id, HttpServletRequest request) {
        Roles.require(AuthInterceptor.currentUser(request), READ_ROLES);
        return ApiResponse.data(priceService.preview(id));
    }

    @GetMapping("/customers/{id}/authorizations")
    public Map<String, Object> authorizations(@PathVariable String id, HttpServletRequest request) {
        AuthInterceptor.currentUser(request);
        return ApiResponse.data(customerService.authorizations(id));
    }

    @PutMapping("/customers/{id}/authorizations")
    public Map<String, Object> setAuthorizations(@PathVariable String id,
                                                 @RequestBody(required = false) Map<String, Object> body,
                                                 HttpServletRequest request) {
        AuthUser user = AuthInterceptor.currentUser(request);
        Roles.require(user, "SUPER_ADMIN", "SANLEI_SALES");
        Object vehicles = body == null ? null : body.get("vehicles");
        return ApiResponse.data(customerService.setAuthorizations(user, id, vehicles));
    }
}
