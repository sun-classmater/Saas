package com.sanlei.order.health;

import com.sanlei.order.common.ApiResponse;
import com.sanlei.order.common.Times;
import java.util.LinkedHashMap;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api")
public class HealthController {

    private final JdbcTemplate jdbcTemplate;

    public HealthController(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    @GetMapping("/health")
    public Map<String, Object> health() {
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("status", "ok");
        data.put("time", Times.nowIso());
        data.put("service", "三磊·车邻汇客户订货系统");
        data.put("wechatMode", System.getProperty("WECHAT_MODE", System.getenv().getOrDefault("WECHAT_MODE", "mock")));
        data.put("database", "mysql");
        return ApiResponse.data(data);
    }

    @GetMapping("/health/db")
    public ResponseEntity<Map<String, Object>> database() {
        try {
            jdbcTemplate.queryForObject("SELECT 1", Integer.class);
            Map<String, Object> data = new LinkedHashMap<>();
            data.put("database", "mysql");
            data.put("ok", true);
            return ResponseEntity.ok(ApiResponse.data(data));
        } catch (RuntimeException error) {
            Map<String, Object> errorBody = new LinkedHashMap<>();
            errorBody.put("code", "DB_UNAVAILABLE");
            errorBody.put("message", "数据库连接失败");
            errorBody.put("details", error.getMessage());
            Map<String, Object> body = new LinkedHashMap<>();
            body.put("error", errorBody);
            return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE).body(body);
        }
    }
}
