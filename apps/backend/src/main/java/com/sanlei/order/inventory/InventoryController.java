package com.sanlei.order.inventory;

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
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/admin")
public class InventoryController {

    private static final String[] WRITE_ROLES = {"SUPER_ADMIN", "SANLEI_WAREHOUSE"};

    private final InventoryService inventoryService;

    public InventoryController(InventoryService inventoryService) {
        this.inventoryService = inventoryService;
    }

    @GetMapping("/inventory")
    public Map<String, Object> list(@RequestParam(required = false) String productId,
                                    @RequestParam(required = false) String lowStock,
                                    HttpServletRequest request) {
        AuthInterceptor.currentUser(request);
        return ApiResponse.data(inventoryService.list(productId, lowStock));
    }

    @GetMapping("/inventory/movements")
    public Map<String, Object> movements(@RequestParam(required = false) String productId,
                                         HttpServletRequest request) {
        AuthInterceptor.currentUser(request);
        return ApiResponse.data(inventoryService.movements(productId));
    }

    @PostMapping("/inventory/transfer")
    public ResponseEntity<Map<String, Object>> transfer(@RequestBody(required = false) Map<String, Object> body,
                                                        HttpServletRequest request) {
        AuthUser user = AuthInterceptor.currentUser(request);
        Roles.require(user, WRITE_ROLES);
        Map<String, Object> data = inventoryService.transfer(user, body == null ? Map.of() : body);
        return ResponseEntity.status(HttpStatus.CREATED).body(ApiResponse.data(data));
    }

    @PostMapping("/inventory/{id}/adjust")
    public Map<String, Object> adjust(@PathVariable String id,
                                      @RequestBody(required = false) Map<String, Object> body,
                                      HttpServletRequest request) {
        AuthUser user = AuthInterceptor.currentUser(request);
        Roles.require(user, WRITE_ROLES);
        Map<String, Object> payload = body == null ? Map.of() : body;
        String note = payload.get("note") == null ? "" : String.valueOf(payload.get("note"));
        return ApiResponse.data(inventoryService.adjust(user, id, payload.get("quantity"), note));
    }
}
