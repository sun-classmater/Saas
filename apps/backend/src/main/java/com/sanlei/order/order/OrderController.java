package com.sanlei.order.order;

import com.sanlei.order.auth.AuthInterceptor;
import com.sanlei.order.auth.AuthUser;
import com.sanlei.order.common.ApiResponse;
import com.sanlei.order.common.HttpException;
import com.sanlei.order.common.Roles;
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
public class OrderController {

    private final OrderService orderService;
    private final OrderActionService orderActionService;
    private final ShipmentService shipmentService;

    public OrderController(OrderService orderService, OrderActionService orderActionService,
                           ShipmentService shipmentService) {
        this.orderService = orderService;
        this.orderActionService = orderActionService;
        this.shipmentService = shipmentService;
    }

    @GetMapping("/orders")
    public Map<String, Object> list(@RequestParam(required = false) String customerId,
                                    @RequestParam(required = false) String status,
                                    @RequestParam(required = false) String type,
                                    @RequestParam(required = false) String keyword,
                                    HttpServletRequest request) {
        return ApiResponse.data(orderService.list(
                AuthInterceptor.currentUser(request), customerId, status, type, keyword));
    }

    @GetMapping("/orders/{id}")
    public Map<String, Object> detail(@PathVariable String id, HttpServletRequest request) {
        return ApiResponse.data(orderService.detail(AuthInterceptor.currentUser(request), id));
    }

    @PostMapping("/orders/{id}/actions")
    public Map<String, Object> action(@PathVariable String id,
                                      @RequestBody(required = false) Map<String, Object> body,
                                      HttpServletRequest request) {
        AuthUser user = AuthInterceptor.currentUser(request);
        Map<String, Object> payload = body == null ? Map.of() : body;
        String action = payload.get("action") == null ? "" : String.valueOf(payload.get("action"));
        switch (action) {
            case "BANGBANG_CONFIRM" -> {
                Roles.require(user, "BANGBANG_OPS", "SUPER_ADMIN");
                return ApiResponse.data(orderActionService.confirm(user, id,
                        payload.get("note") == null ? "" : String.valueOf(payload.get("note"))));
            }
            case "SANLEI_ACCEPT" -> {
                Roles.require(user, "SANLEI_SALES", "SUPER_ADMIN");
                return ApiResponse.data(orderActionService.accept(user, id));
            }
            case "CANCEL" -> {
                return ApiResponse.data(orderActionService.cancel(user, id,
                        payload.get("reason") == null ? "" : String.valueOf(payload.get("reason"))));
            }
            case "SHIP" -> {
                Roles.require(user, "SANLEI_WAREHOUSE", "SUPER_ADMIN");
                Object shipment = payload.get("shipment");
                @SuppressWarnings("unchecked")
                Map<String, Object> shipmentPayload = shipment instanceof Map<?, ?> map
                        ? (Map<String, Object>) map
                        : payload;
                return ApiResponse.data(shipmentService.ship(user, id, shipmentPayload));
            }
            default -> throw new HttpException(400, "INVALID_ORDER_ACTION", "订单操作无效");
        }
    }
}
