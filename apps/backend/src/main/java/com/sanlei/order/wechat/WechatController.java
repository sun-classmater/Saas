package com.sanlei.order.wechat;

import com.sanlei.order.common.ApiResponse;
import com.sanlei.order.common.HttpException;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * 微信支付回调。
 * mock 模式与 Node 完全一致：缺少参数时返回 503 WECHAT_NOT_CONFIGURED。
 * 正式模式（验签 + APIv3 解密 + 幂等到账）尚未在 Java 侧实现，返回 501 并说明原因，
 * 以便上线前必须显式补齐，而不是静默通过。
 */
@RestController
@RequestMapping("/api/wechat")
public class WechatController {

    private static final List<String> REQUIRED = List.of(
            "WECHAT_APP_ID", "WECHAT_APP_SECRET", "WECHAT_MCH_ID", "WECHAT_API_V3_KEY",
            "WECHAT_CERT_SERIAL", "WECHAT_PRIVATE_KEY_PATH", "WECHAT_NOTIFY_URL", "WECHAT_PLATFORM_CERT_PATH");

    private String config(String key) {
        String value = System.getProperty(key);
        if (value != null) {
            return value;
        }
        return System.getenv(key);
    }

    private boolean isMock() {
        String mode = config("WECHAT_MODE");
        return mode == null || mode.isBlank() || "mock".equals(mode);
    }

    private void assertConfigured() {
        List<String> missing = new ArrayList<>();
        for (String key : REQUIRED) {
            String value = config(key);
            if (value == null || value.isBlank()) {
                missing.add(key);
            }
        }
        if (!missing.isEmpty()) {
            throw new HttpException(503, "WECHAT_NOT_CONFIGURED", "微信参数未配置：" + String.join(", ", missing));
        }
        String apiV3Key = config("WECHAT_API_V3_KEY");
        if (apiV3Key == null || apiV3Key.length() != 32) {
            throw new HttpException(503, "WECHAT_CONFIG_INVALID", "微信 API v3 密钥必须为32位");
        }
    }

    @PostMapping("/pay/notify")
    public Map<String, Object> notify(@RequestBody(required = false) String body) {
        // 与 Node 一致：参数缺失/密钥长度不对时先返回 503，而不是接受一个无法验签的回调
        assertConfigured();
        throw new HttpException(501, "WECHAT_NOTIFY_NOT_READY",
                "微信支付回调验签尚未迁移到 Spring Boot 后端（mock 模式请直接使用模拟到账接口）");
    }
}
