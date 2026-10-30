package com.sanlei.order.mobile;

import com.sanlei.order.aftersales.AfterSalesService;
import com.sanlei.order.auth.AuthInterceptor;
import com.sanlei.order.auth.AuthUser;
import com.sanlei.order.common.ApiResponse;
import com.sanlei.order.customer.CustomerService;
import com.sanlei.order.order.OrderActionService;
import com.sanlei.order.order.OrderService;
import com.sanlei.order.order.PaymentService;
import com.sanlei.order.plan.PlanService;
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
@RequestMapping("/api/mobile")
public class MobileController {

    private final MobileOrderService mobileOrderService;
    private final OrderService orderService;
    private final OrderActionService orderActionService;
    private final PaymentService paymentService;
    private final CustomerService customerService;
    private final PlanService planService;
    private final AfterSalesService afterSalesService;

    public MobileController(MobileOrderService mobileOrderService, OrderService orderService,
                            OrderActionService orderActionService, PaymentService paymentService,
                            CustomerService customerService, PlanService planService,
                            AfterSalesService afterSalesService) {
        this.mobileOrderService = mobileOrderService;
        this.orderService = orderService;
        this.orderActionService = orderActionService;
        this.paymentService = paymentService;
        this.customerService = customerService;
        this.planService = planService;
        this.afterSalesService = afterSalesService;
    }

    @GetMapping("/profile")
    public Map<String, Object> profile(HttpServletRequest request) {
        AuthUser user = AuthInterceptor.currentUser(request);
        return ApiResponse.data(customerService.profile(user.customerId()));
    }

    @GetMapping("/catalog")
    public Map<String, Object> catalog(HttpServletRequest request) {
        AuthUser user = AuthInterceptor.currentUser(request);
        return ApiResponse.data(mobileOrderService.catalog(user.customerId()));
    }

    @GetMapping("/orders")
    public Map<String, Object> orders(@RequestParam(required = false) String customerId,
                                      @RequestParam(required = false) String status,
                                      @RequestParam(required = false) String type,
                                      @RequestParam(required = false) String keyword,
                                      HttpServletRequest request) {
        AuthUser user = AuthInterceptor.currentUser(request);
        return ApiResponse.data(orderService.list(user, customerId, status, type, keyword));
    }

    @PostMapping("/orders")
    public ResponseEntity<Map<String, Object>> createOrder(@RequestBody(required = false) Map<String, Object> body,
                                                           HttpServletRequest request) {
        AuthUser user = AuthInterceptor.currentUser(request);
        Map<String, Object> data = mobileOrderService.create(user, body == null ? Map.of() : body);
        return ResponseEntity.status(HttpStatus.CREATED).body(ApiResponse.data(data));
    }

    @GetMapping("/orders/{id}")
    public Map<String, Object> orderDetail(@PathVariable String id, HttpServletRequest request) {
        return ApiResponse.data(orderService.detail(AuthInterceptor.currentUser(request), id));
    }

    @PostMapping("/orders/{id}/cancel")
    public Map<String, Object> cancelOrder(@PathVariable String id,
                                           @RequestBody(required = false) Map<String, Object> body,
                                           HttpServletRequest request) {
        AuthUser user = AuthInterceptor.currentUser(request);
        String reason = body == null || body.get("reason") == null ? "" : String.valueOf(body.get("reason"));
        return ApiResponse.data(orderActionService.cancel(user, id, reason));
    }

    @PostMapping("/payments")
    public ResponseEntity<Map<String, Object>> createPayment(@RequestBody(required = false) Map<String, Object> body,
                                                             HttpServletRequest request) {
        AuthUser user = AuthInterceptor.currentUser(request);
        Map<String, Object> payload = body == null ? Map.of() : body;
        String orderId = payload.get("orderId") == null ? "" : String.valueOf(payload.get("orderId"));
        Map<String, Object> data = paymentService.createPayment(user, orderId, payload.get("amount"));
        return ResponseEntity.status(HttpStatus.CREATED).body(ApiResponse.data(data));
    }

    @PostMapping("/payments/{id}/mock-complete")
    public Map<String, Object> completeMockPayment(@PathVariable String id, HttpServletRequest request) {
        AuthUser user = AuthInterceptor.currentUser(request);
        return ApiResponse.data(paymentService.completeMockPayment(user, id));
    }

    @PostMapping("/shipments/{id}/receive")
    public Map<String, Object> receive(@PathVariable String id, HttpServletRequest request) {
        AuthUser user = AuthInterceptor.currentUser(request);
        return ApiResponse.data(mobileOrderService.receive(user, id));
    }

    // ---------- 采购计划 ----------

    @GetMapping("/plans")
    public Map<String, Object> plans(@RequestParam(required = false) String status, HttpServletRequest request) {
        AuthUser user = AuthInterceptor.currentUser(request);
        return ApiResponse.data(planService.list(user, null, status));
    }

    @PostMapping("/plans")
    public ResponseEntity<Map<String, Object>> createPlan(@RequestBody(required = false) Map<String, Object> body,
                                                          HttpServletRequest request) {
        AuthUser user = AuthInterceptor.currentUser(request);
        Map<String, Object> data = planService.create(user, body == null ? Map.of() : body);
        return ResponseEntity.status(HttpStatus.CREATED).body(ApiResponse.data(data));
    }

    @PutMapping("/plans/{id}")
    public Map<String, Object> updatePlan(@PathVariable String id,
                                          @RequestBody(required = false) Map<String, Object> body,
                                          HttpServletRequest request) {
        AuthUser user = AuthInterceptor.currentUser(request);
        return ApiResponse.data(planService.update(user, id, body == null ? Map.of() : body));
    }

    @PostMapping("/plans/{id}/actions")
    public Map<String, Object> planAction(@PathVariable String id,
                                          @RequestBody(required = false) Map<String, Object> body,
                                          HttpServletRequest request) {
        AuthUser user = AuthInterceptor.currentUser(request);
        Map<String, Object> payload = body == null ? Map.of() : body;
        return ApiResponse.data(planService.action(user, id,
                payload.get("action") == null ? "" : String.valueOf(payload.get("action")),
                payload.get("note") == null ? "" : String.valueOf(payload.get("note"))));
    }

    // ---------- 售后 ----------

    @GetMapping("/after-sales")
    public Map<String, Object> afterSales(HttpServletRequest request) {
        return ApiResponse.data(afterSalesService.list(AuthInterceptor.currentUser(request)));
    }

    @PostMapping("/after-sales")
    public ResponseEntity<Map<String, Object>> createAfterSales(@RequestBody(required = false) Map<String, Object> body,
                                                                HttpServletRequest request) {
        AuthUser user = AuthInterceptor.currentUser(request);
        Map<String, Object> data = afterSalesService.create(user, body == null ? Map.of() : body);
        return ResponseEntity.status(HttpStatus.CREATED).body(ApiResponse.data(data));
    }
}
