package com.sanlei.order.payment;

import com.sanlei.order.auth.AuthInterceptor;
import com.sanlei.order.auth.AuthUser;
import com.sanlei.order.common.ApiResponse;
import com.sanlei.order.common.Roles;
import com.sanlei.order.common.Validation;
import com.sanlei.order.order.PaymentListRow;
import com.sanlei.order.order.PaymentService;
import jakarta.servlet.http.HttpServletRequest;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/admin")
public class PaymentController {

    private final PaymentMapper paymentMapper;
    private final PaymentService paymentService;

    public PaymentController(PaymentMapper paymentMapper, PaymentService paymentService) {
        this.paymentMapper = paymentMapper;
        this.paymentService = paymentService;
    }

    @GetMapping("/payments")
    public Map<String, Object> list(HttpServletRequest request) {
        AuthInterceptor.currentUser(request);
        List<Map<String, Object>> result = new ArrayList<>();
        for (PaymentListRow row : paymentMapper.listAll()) {
            Map<String, Object> view = new LinkedHashMap<>();
            view.put("id", row.getId());
            view.put("paymentNo", row.getPaymentNo());
            view.put("customerName", row.getCustomerName());
            view.put("orderId", row.getOrderId());
            view.put("orderNo", row.getOrderNo());
            view.put("amount", Validation.money(row.getAmount()));
            view.put("channel", row.getChannel());
            view.put("status", row.getStatus());
            view.put("transactionId", row.getTransactionId());
            view.put("paidAt", row.getPaidAt());
            view.put("createdAt", row.getCreatedAt());
            result.add(view);
        }
        return ApiResponse.data(result);
    }

    @PostMapping("/payments/mock")
    public Map<String, Object> mockPay(@RequestBody(required = false) Map<String, Object> body,
                                       HttpServletRequest request) {
        AuthUser user = AuthInterceptor.currentUser(request);
        Roles.require(user, "SUPER_ADMIN");
        Map<String, Object> payload = body == null ? Map.of() : body;
        String orderId = payload.get("orderId") == null ? "" : String.valueOf(payload.get("orderId"));
        return ApiResponse.data(paymentService.mockPay(user, orderId, payload.get("amount")));
    }
}
