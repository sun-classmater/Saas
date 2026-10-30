package com.sanlei.order.report;

import com.sanlei.order.auth.AuthUser;
import com.sanlei.order.common.Times;
import com.sanlei.order.common.Validation;
import com.sanlei.order.order.OrderService;
import java.math.BigDecimal;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

/** 经营概览与计划执行率报表（与 Node 端 services/reports.js 对应）。 */
@Service
public class ReportService {

    private final JdbcTemplate jdbcTemplate;
    private final OrderService orderService;

    public ReportService(JdbcTemplate jdbcTemplate, OrderService orderService) {
        this.jdbcTemplate = jdbcTemplate;
        this.orderService = orderService;
    }

    private long count(String sql, Object... args) {
        Number value = jdbcTemplate.queryForObject(sql, Number.class, args);
        return value == null ? 0 : value.longValue();
    }

    public Map<String, Object> dashboard(AuthUser user) {
        String now = Times.nowIso();
        long pendingPlan = count("SELECT COUNT(*) FROM plans WHERE status IN ('BANGBANG_REVIEW', 'SANLEI_REVIEW')");
        long pendingConfirm = count("SELECT COUNT(*) FROM orders WHERE status = 'PENDING_BANGBANG'");
        long pendingPayment = count("SELECT COUNT(*) FROM orders WHERE status IN ('PENDING_PAYMENT', 'PARTIALLY_PAID')");
        long preparing = count("SELECT COUNT(*) FROM orders WHERE status IN ('PENDING_SANLEI', 'PREPARING', 'PARTIALLY_SHIPPED')");
        BigDecimal monthAmount = jdbcTemplate.queryForObject(
                "SELECT COALESCE(SUM(total_amount), 0) FROM orders WHERE status != 'CANCELLED' "
                        + "AND SUBSTR(created_at, 1, 7) = SUBSTR(?, 1, 7)", BigDecimal.class, now);
        String overdueCutoff = Instant.now().minus(3, ChronoUnit.DAYS).truncatedTo(ChronoUnit.MILLIS).toString();
        long overduePrepay = count("SELECT COUNT(*) FROM orders WHERE settlement_method = 'PREPAY' "
                + "AND status IN ('PENDING_PAYMENT', 'PARTIALLY_PAID') AND created_at < ?", overdueCutoff);

        List<Map<String, Object>> lowStock = new ArrayList<>();
        for (Map<String, Object> row : jdbcTemplate.queryForList(
                "SELECT p.id AS product_id, p.sku, p.name, "
                        + "COALESCE(SUM(CASE WHEN i.source_type = 'REAL' THEN i.quantity - i.reserved ELSE 0 END), 0) AS available "
                        + "FROM products p LEFT JOIN inventory i ON i.product_id = p.id "
                        + "GROUP BY p.id HAVING available <= 20 ORDER BY available")) {
            Map<String, Object> view = new LinkedHashMap<>();
            view.put("productId", row.get("product_id"));
            view.put("sku", row.get("sku"));
            view.put("name", row.get("name"));
            view.put("available", ((Number) row.get("available")).intValue());
            lowStock.add(view);
        }

        Map<String, Object> metrics = new LinkedHashMap<>();
        metrics.put("pendingPlan", pendingPlan);
        metrics.put("pendingConfirm", pendingConfirm);
        metrics.put("pendingPayment", pendingPayment);
        metrics.put("preparing", preparing);
        metrics.put("monthAmount", Validation.money(monthAmount == null ? 0d : monthAmount.doubleValue()));
        metrics.put("overduePrepay", overduePrepay);

        Map<String, Object> data = new LinkedHashMap<>();
        data.put("metrics", metrics);
        data.put("lowStock", lowStock);
        data.put("recentOrders", orderService.list(user, null, null, null, null).stream().limit(8).toList());
        return data;
    }

    public List<Map<String, Object>> planExecution() {
        List<Map<String, Object>> result = new ArrayList<>();
        for (Map<String, Object> row : jdbcTemplate.queryForList("""
                SELECT p.plan_month, c.name AS customer_name, c.grade,
                  SUM(pi.quantity) AS planned_quantity,
                  SUM(pi.ordered_quantity) AS ordered_quantity,
                  ROUND(CASE WHEN SUM(pi.quantity) > 0
                    THEN SUM(pi.ordered_quantity) * 100.0 / SUM(pi.quantity) ELSE 0 END, 2) AS execution_rate
                FROM plans p
                JOIN customers c ON c.id = p.customer_id
                JOIN plan_items pi ON pi.plan_id = p.id
                WHERE p.status = 'APPROVED'
                GROUP BY p.id
                ORDER BY p.plan_month DESC, c.name
                """)) {
            Map<String, Object> view = new LinkedHashMap<>();
            view.put("planMonth", row.get("plan_month"));
            view.put("customerName", row.get("customer_name"));
            view.put("grade", row.get("grade"));
            view.put("plannedQuantity", ((Number) row.get("planned_quantity")).longValue());
            view.put("orderedQuantity", ((Number) row.get("ordered_quantity")).longValue());
            view.put("executionRate", row.get("execution_rate"));
            result.add(view);
        }
        return result;
    }
}
