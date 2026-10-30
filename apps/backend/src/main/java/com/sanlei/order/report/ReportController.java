package com.sanlei.order.report;

import com.sanlei.order.auth.AuthInterceptor;
import com.sanlei.order.common.ApiResponse;
import jakarta.servlet.http.HttpServletRequest;
import java.util.Map;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/admin")
public class ReportController {

    private final ReportService reportService;

    public ReportController(ReportService reportService) {
        this.reportService = reportService;
    }

    @GetMapping("/dashboard")
    public Map<String, Object> dashboard(HttpServletRequest request) {
        return ApiResponse.data(reportService.dashboard(AuthInterceptor.currentUser(request)));
    }

    @GetMapping("/reports/plan-execution")
    public Map<String, Object> planExecution(HttpServletRequest request) {
        AuthInterceptor.currentUser(request);
        return ApiResponse.data(reportService.planExecution());
    }
}
