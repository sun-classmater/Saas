package com.sanlei.order.price;

import com.sanlei.order.auth.AuthInterceptor;
import com.sanlei.order.auth.AuthUser;
import com.sanlei.order.common.ApiResponse;
import com.sanlei.order.common.Roles;
import jakarta.servlet.http.HttpServletRequest;
import java.util.Map;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/admin")
public class PriceController {

    private static final String[] ROLES = {"SUPER_ADMIN", "SANLEI_SALES"};

    private final PriceService priceService;

    public PriceController(PriceService priceService) {
        this.priceService = priceService;
    }

    @GetMapping("/prices")
    public Map<String, Object> matrix(HttpServletRequest request) {
        Roles.require(AuthInterceptor.currentUser(request), ROLES);
        return ApiResponse.data(priceService.matrix());
    }

    @PutMapping("/prices")
    public Map<String, Object> setPrice(@RequestBody(required = false) Map<String, Object> body,
                                        HttpServletRequest request) {
        AuthUser user = AuthInterceptor.currentUser(request);
        Roles.require(user, ROLES);
        return ApiResponse.data(priceService.setPrice(user, body == null ? Map.of() : body));
    }
}
