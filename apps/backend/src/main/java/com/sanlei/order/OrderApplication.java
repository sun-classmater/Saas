package com.sanlei.order;

import com.sanlei.order.config.EnvLoader;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

@SpringBootApplication
public class OrderApplication {

    public static void main(String[] args) {
        // 允许路径中出现编码斜杠，由 RequestGuardFilter 统一按 404 处理（与 Node 行为对齐）
        System.setProperty("org.apache.tomcat.util.buf.UDecoder.ALLOW_ENCODED_SLASH", "true");
        // 复用项目根目录的 .env（DATABASE_URL 等），与 Node 后端保持同一份配置
        EnvLoader.load();
        SpringApplication.run(OrderApplication.class, args);
    }
}
